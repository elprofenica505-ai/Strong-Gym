-- Seguridad 1A: permisos de perfiles, vistas y RPC de mantenimiento.
-- Compatible con repository y bank_accounts_split. Requiere FASE2/00020.
-- No modifica registros, saldos, planes ni escritores de dinero.
-- Aplicar SOLO este incremental; no reinstalar SETUP/FASE2/00028/00029.
begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.profiles') is null
     or to_regprocedure('public.crm_is_staff()') is null then
    raise exception 'SECURITY_PREREQUISITE_MISSING';
  end if;
end $$;

-- Ningún usuario de la API necesita crear objetos del esquema.
revoke create on schema public from public, anon, authenticated;

-- El registro se crea desde Auth/trigger; cambios comerciales vía RPC autorizada.
-- Revocar también grants por columna: quitar el grant de tabla no los elimina.
revoke all on table public.profiles from public, anon, authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
  from pg_attribute where attrelid='public.profiles'::regclass
    and attnum>0 and not attisdropped;
  execute format('revoke all (%s) on table public.profiles from public, anon, authenticated', cols);
end $$;
grant select on table public.profiles to authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;
alter table public.profiles enable row level security;

-- Lectores administrativos necesitan nombres al unir perfiles con finanzas.
-- Helper SECURITY DEFINER sin recursión; clientes siguen viendo sólo su perfil.
drop policy if exists security_profiles_staff_read on public.profiles;
create policy security_profiles_staff_read on public.profiles
  for select to authenticated using (public.crm_is_staff());

-- La política permisiva antigua de bank_accounts permitía leer saldos a cualquier
-- usuario autenticado. Una política RESTRICTIVE se combina con todas las anteriores.
do $$ begin
  if to_regclass('public.bank_accounts') is not null then
    execute 'alter table public.bank_accounts enable row level security';
    execute 'revoke all on table public.bank_accounts from public, anon';
    execute 'drop policy if exists security_bank_accounts_staff_read on public.bank_accounts';
    execute 'create policy security_bank_accounts_staff_read on public.bank_accounts as restrictive for select to authenticated using (public.crm_is_staff())';
  end if;
end $$;

-- Permisos explícitos necesarios al pasar vistas a invoker. No se concede
-- escritura. Fallar antes de conceder SELECT si una tabla no tiene RLS.
do $$ declare t text; begin
  foreach t in array array['transactions','member_balances','invoices',
    'payment_methods','accounts','bank_accounts','cash_registers'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists(select 1 from pg_class where oid=to_regclass('public.' || t) and relrowsecurity) then
      raise exception 'SECURITY_TABLE_RLS_REQUIRED: %', t;
    end if;
    execute format('grant select on table public.%I to authenticated', t);
    if t in ('transactions','member_balances','invoices') then
      execute format('drop policy if exists security_finance_own_or_staff on public.%I', t);
      execute format('create policy security_finance_own_or_staff on public.%I as restrictive for select to authenticated using (member_id=(select auth.uid()) or (select public.crm_is_staff()))', t);
    end if;
  end loop;
end $$;

-- Vistas financieras: RLS/permisos DEL SOLICITANTE, nunca del propietario.
-- Clientes sólo pueden alcanzar filas propias cuando la política lo permite;
-- cuentas globales requieren staff. Se eliminan todos los grants públicos/escritura.
do $$ declare v text; cols text; begin
  foreach v in array array[
    'v_daily_cash','v_accounts_receivable','v_monthly_pnl',
    'v_payment_methods_breakdown','v_member_account',
    'v_account_balances','v_expenses_by_category','v_members_with_debt',
    'v_monthly_summary','v_top_members'
  ] loop
    if to_regclass('public.' || v) is null then continue; end if;
    if not exists(select 1 from pg_class where oid=to_regclass('public.' || v) and relkind='v') then
      raise exception 'SECURITY_EXPECTED_VIEW: %', v;
    end if;
    execute format('alter view public.%I set (security_invoker=true, security_barrier=true)', v);
    execute format('revoke all on table public.%I from public, anon, authenticated', v);
    select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute where attrelid=to_regclass('public.' || v)
      and attnum>0 and not attisdropped;
    execute format('revoke all (%s) on table public.%I from public, anon, authenticated', cols, v);
    execute format('grant select on table public.%I to authenticated', v);
  end loop;
end $$;

-- EXCEPCIÓN INTENCIONAL: ocupación pública agregada, sin datos de personas.
-- No pasarla a invoker: contaría sólo las reservas propias y falsearía los cupos.
-- Mantener únicamente los dos campos revisados y acceso de sólo lectura.
do $$ begin
  if to_regclass('public.session_occupancy') is not null then
    if (select array_agg(attname::text order by attnum) from pg_attribute
        where attrelid='public.session_occupancy'::regclass and attnum>0 and not attisdropped)
       is distinct from array['session_id','booked_count']::text[] then
      raise exception 'SECURITY_OCCUPANCY_COLUMNS_UNEXPECTED';
    end if;
    execute 'revoke all on table public.session_occupancy from public, anon, authenticated';
    execute 'grant select on table public.session_occupancy to anon, authenticated';
  end if;
end $$;

-- Funciones CRM: retirar ejecución pública heredada sin abrir helpers privados.
-- Mantener grants authenticated ya existentes y comprobaciones internas de rol.
do $$ declare f record; signature text; begin
  for f in select proname, proargtypes,
    has_function_privilege('authenticated', oid, 'EXECUTE') can_execute from pg_proc
    where pronamespace='public'::regnamespace
      and (left(proname,4)='crm_' or proname in ('book_session','cancel_booking','handle_new_user'))
  loop
    signature := format('public.%I(%s)', f.proname, oidvectortypes(f.proargtypes));
    if f.can_execute then
      execute format('grant execute on function %s to authenticated', signature);
    end if;
    execute format('revoke all on function %s from public, anon', signature);
  end loop;
  -- No están usadas por la web: mantenimiento sólo por SQL/servicio autorizado.
  -- Así se cierra la excepción antigua que admitía auth.uid() NULL.
  for f in select proname, proargtypes from pg_proc
    where pronamespace='public'::regnamespace
      and proname in ('generate_week_sessions','close_past_sessions')
  loop
    signature := format('public.%I(%s)', f.proname, oidvectortypes(f.proargtypes));
    execute format('revoke all on function %s from public, anon, authenticated', signature);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
