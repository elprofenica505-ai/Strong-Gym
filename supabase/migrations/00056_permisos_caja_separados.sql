-- 00056 · Etapa 3, tanda 2: permisos separados de caja
--
-- Reutiliza public.staff_permissions (00033). No crea otra tabla.
-- Los cinco permisos nuevos nacen apagados. El cierre del día (00037) se
-- conserva tal como esté configurado y no se reinicia en esta migración.
--
-- Alcance aprobado:
--   * Caja conserva su operación diaria: cobros por servicio, abonos,
--     comprobantes y cierre del día si su interruptor actual está encendido.
--   * Resultado mensual, gráficos, saldos de cuentas del gimnasio, gastos
--     (ver y registrar) y lista de cuentas por cobrar se habilitan por
--     separado desde administración.
--   * Administración siempre conserva acceso.
--   * Registrar un abono desde la ficha sigue siendo operación diaria; el
--     permiso de cuentas por cobrar controla la lista consolidada y sus
--     totales, no el formulario operativo de abonos.
--
-- Reversión: volver a las definiciones de finance_read/finance_debt_report
-- de 00028/00038 y de finance_options/finance_receipt/
-- finance_recent_receipts/finance_record_movement de 00024/00028; retirar
-- las políticas restrictivas nuevas. Las claves pueden quedar en
-- staff_permissions sin efecto.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.staff_permissions') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.is_cashier()') is null
     or to_regprocedure('public.crm_is_staff()') is null
     or to_regprocedure('public.finance_read_before_debts(text,integer)') is null
     or to_regprocedure('public.finance_record_movement_before_debts(uuid,text,uuid,numeric,text,text,text,text,numeric,text)') is null
     or to_regprocedure('public.finance_options()') is null
     or to_regprocedure('public.finance_receipt(uuid)') is null
     or to_regprocedure('public.finance_recent_receipts(text,uuid)') is null then
    raise exception 'CASHIER_PERMISSIONS_PREREQUISITE_MISSING';
  end if;
end $$;

insert into public.staff_permissions(key, enabled)
values
  ('cashier_can_view_monthly_result', false),
  ('cashier_can_view_charts', false),
  ('cashier_can_view_account_balances', false),
  ('cashier_can_manage_expenses', false),
  ('cashier_can_view_receivables', false)
on conflict (key) do nothing;

-- Verdadero para administración; para caja exige aal2 y el interruptor dado.
-- La lista blanca evita usar este helper para permisos ajenos (por ejemplo,
-- trainer_can_request_clients o cashier_can_void).
create or replace function public.finance_permission_enabled(p_key text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_key is null or p_key not in (
      'cashier_can_view_daily_close',
      'cashier_can_view_monthly_result',
      'cashier_can_view_charts',
      'cashier_can_view_account_balances',
      'cashier_can_manage_expenses',
      'cashier_can_view_receivables'
    ) then false
    when public.is_admin() then true
    when public.is_cashier() then coalesce(
      (select enabled from public.staff_permissions where key = p_key),
      false
    )
    else false
  end;
$$;
revoke all on function public.finance_permission_enabled(text) from public, anon, authenticated;
grant execute on function public.finance_permission_enabled(text) to authenticated;

-- Una sola lectura para que el servidor decida qué pedir y qué mostrar.
-- No devuelve importes ni datos de clientes.
create or replace function public.cashier_permissions()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'dailyClose', public.finance_permission_enabled('cashier_can_view_daily_close'),
    'monthlyResult', public.finance_permission_enabled('cashier_can_view_monthly_result'),
    'charts', public.finance_permission_enabled('cashier_can_view_charts'),
    'accountBalances', public.finance_permission_enabled('cashier_can_view_account_balances'),
    'expenses', public.finance_permission_enabled('cashier_can_manage_expenses'),
    'receivables', public.finance_permission_enabled('cashier_can_view_receivables')
  );
$$;
revoke all on function public.cashier_permissions() from public, anon, authenticated;
grant execute on function public.cashier_permissions() to authenticated;

-- Lector financiero: la envoltura de 00028, con guardias por sección y
-- ocultamiento de campos sensibles cuando una sección compartida sí puede
-- leerse para la operación diaria. Se conserva la llamada a
-- finance_read_before_debts, que finance_debt_ready() verifica textualmente.
create or replace function public.finance_read(p_section text, p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v jsonb;
  v_monthly boolean := public.finance_permission_enabled('cashier_can_view_monthly_result');
  v_charts boolean := public.finance_permission_enabled('cashier_can_view_charts');
  v_account_balances boolean := public.finance_permission_enabled('cashier_can_view_account_balances');
  v_expenses boolean := public.finance_permission_enabled('cashier_can_manage_expenses');
  v_receivables boolean := public.finance_permission_enabled('cashier_can_view_receivables');
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if public.crm_finance_layout() <> 'bank_accounts_split' then raise exception 'FINANCE_SCHEMA_UNSUPPORTED'; end if;

  if p_section = 'monthly' and not v_monthly then raise exception 'AUTH'; end if;
  if p_section in ('daily', 'method_totals') and not v_charts then raise exception 'AUTH'; end if;
  if p_section = 'receivables' and not v_receivables then raise exception 'AUTH'; end if;
  if p_section = 'categories' and not v_expenses then raise exception 'AUTH'; end if;

  v := public.finance_read_before_debts(p_section, p_limit);

  if p_section = 'summary' then
    v := jsonb_set(v, '{data,totalOwed}', to_jsonb(coalesce((v#>>'{data,totalOwed}')::numeric, 0) + (select coalesce(sum(debt_nio), 0) from public.client_debt_balances)));
    v := jsonb_set(v, '{data,totalOwedUsd}', to_jsonb(coalesce((v#>>'{data,totalOwedUsd}')::numeric, 0) + (select coalesce(sum(debt_usd), 0) from public.client_debt_balances)));
  elsif p_section = 'receivables' then
    select jsonb_set(v, '{data}', coalesce(jsonb_agg(r order by (r->>'total_owed_nio')::numeric desc, r->>'member_id', r->>'client_id'), '[]'::jsonb)) into v from (
      select value as r from jsonb_array_elements(v->'data')
      union all
      select jsonb_build_object('member_id', null, 'client_id', c.id, 'full_name', c.full_name, 'email', c.email, 'phone', c.phone,
        'invoices_open', null, 'total_owed_nio', b.debt_nio, 'total_owed_usd', b.debt_usd, 'oldest_due', null, 'days_overdue', null)
      from public.client_debt_balances b join public.gym_clients c on c.id = b.client_id where b.debt_nio > 0 or b.debt_usd > 0
    ) r;
  end if;

  -- La ficha de resumen sí se usa en la operación diaria; sin permiso se
  -- neutralizan solo los campos mensuales o de deuda consolidada. La
  -- interfaz, además, no pinta esos indicadores.
  if p_section = 'summary' then
    if not v_monthly then
      v := jsonb_set(v, '{data,incomeMonth}', '0'::jsonb);
      v := jsonb_set(v, '{data,expenseMonth}', '0'::jsonb);
      v := jsonb_set(v, '{data,netMonth}', '0'::jsonb);
      v := jsonb_set(v, '{data,txMonth}', '0'::jsonb);
    end if;
    if not v_receivables then
      v := jsonb_set(v, '{data,totalOwed}', '0'::jsonb);
      v := jsonb_set(v, '{data,totalOwedUsd}', '0'::jsonb);
    end if;
  elsif p_section = 'accounts' and not v_account_balances then
    -- Caja sigue viendo qué cuentas existen para cobrar, sin sus saldos.
    select jsonb_set(v, '{data}', coalesce(jsonb_agg(jsonb_set(r, '{balance}', '0'::jsonb) order by ord), '[]'::jsonb)) into v
    from jsonb_array_elements(v->'data') with ordinality as rows(r, ord);
  elsif p_section = 'transactions' and not v_expenses then
    select jsonb_set(v, '{data}', coalesce(jsonb_agg(r order by ord), '[]'::jsonb)) into v
    from jsonb_array_elements(v->'data') with ordinality as rows(r, ord)
    where coalesce(r->>'direction', '') <> 'expense';
  elsif p_section = 'daily' and not v_expenses then
    select jsonb_set(v, '{data}', coalesce(jsonb_agg(
      jsonb_set(jsonb_set(r, '{expense_nio}', '0'::jsonb), '{net_nio}', coalesce(r->'income_nio', '0'::jsonb)) order by ord
    ), '[]'::jsonb)) into v
    from jsonb_array_elements(v->'data') with ordinality as rows(r, ord);
  elsif p_section = 'method_totals' and not v_expenses then
    select jsonb_set(v, '{data}', coalesce(jsonb_agg(
      jsonb_set(jsonb_set(r, '{expense_nio}', '0'::jsonb), '{total_nio}', coalesce(r->'income_nio', '0'::jsonb)) order by ord
    ), '[]'::jsonb)) into v
    from jsonb_array_elements(v->'data') with ordinality as rows(r, ord);
  end if;

  return v;
end $$;
revoke all on function public.finance_read(text, integer) from public, anon, authenticated;
grant execute on function public.finance_read(text, integer) to authenticated;

-- El resumen sigue disponible para la caja diaria (con campos protegidos por
-- finance_read). La lista de cuentas por cobrar exige su permiso propio.
create or replace function public.finance_debt_report(p_section text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_section not in ('summary', 'receivables') or p_section is null then raise exception 'INVALID_FINANCE_SECTION'; end if;
  if p_section = 'receivables'
     and not public.finance_permission_enabled('cashier_can_view_receivables') then
    raise exception 'AUTH';
  end if;
  return public.finance_read(p_section, 30);
end $$;
revoke all on function public.finance_debt_report(text) from public, anon, authenticated;
grant execute on function public.finance_debt_report(text) to authenticated;

-- Escritura de gastos: el cobro por servicio no cambia. La llamada a
-- finance_record_movement_before_debts se conserva (finance_debt_ready).
create or replace function public.finance_record_movement(
  p_request uuid, p_kind text, p_client uuid, p_amount numeric, p_currency text,
  p_method text, p_account text, p_concept text, p_fx numeric, p_category text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  if p_kind = 'expense'
     and not public.finance_permission_enabled('cashier_can_manage_expenses') then
    raise exception 'AUTH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  if exists(select 1 from public.client_debt_entries where request_id = p_request) then raise exception 'REQUEST_CONFLICT'; end if;
  return public.finance_record_movement_before_debts(p_request, p_kind, p_client, p_amount, p_currency, p_method, p_account, p_concept, p_fx, p_category);
end $$;
revoke all on function public.finance_record_movement(uuid, text, uuid, numeric, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.finance_record_movement(uuid, text, uuid, numeric, text, text, text, text, numeric, text) to authenticated;

-- Opciones de formularios: sin permiso de gastos no se entregan categorías.
-- Las cuentas y métodos necesarios para cobrar no cambian ni incluyen saldos.
create or replace function public.finance_options()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  v := public.crm_options();
  return (v - 'payments_enabled' - 'payment_block_reason') || jsonb_build_object(
    'protocol', 'service-v1',
    'writes_enabled', public.finance_writes_ready(),
    'categories', case
      when public.finance_permission_enabled('cashier_can_manage_expenses')
        then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by display_order) from public.expense_categories), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
end $$;
revoke all on function public.finance_options() from public, anon, authenticated;
grant execute on function public.finance_options() to authenticated;

create or replace function public.finance_receipt(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_payload jsonb; v_receipt jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select payload, receipt into v_payload, v_receipt
  from public.finance_entries where transaction_id = p_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  if coalesce(v_payload->>'kind', v_receipt->>'kind', '') = 'expense'
     and not public.finance_permission_enabled('cashier_can_manage_expenses') then
    raise exception 'AUTH';
  end if;
  return v_receipt;
end $$;
revoke all on function public.finance_receipt(uuid) from public, anon, authenticated;
grant execute on function public.finance_receipt(uuid) to authenticated;

create or replace function public.finance_recent_receipts(p_kind text, p_client uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_kind is null or p_kind not in ('service_income', 'expense')
    or (p_kind = 'service_income' and p_client is null)
    or (p_kind = 'expense' and p_client is not null) then raise exception 'INVALID_PAYMENT'; end if;
  if p_kind = 'expense'
     and not public.finance_permission_enabled('cashier_can_manage_expenses') then
    raise exception 'AUTH';
  end if;
  return coalesce((select jsonb_agg(receipt order by created_at desc, transaction_id) from (
    select receipt, created_at, transaction_id from public.finance_entries
    where payload->>'kind' = p_kind and (p_client is null or payload->>'client' = p_client::text)
    order by created_at desc, transaction_id limit 50
  ) r), '[]'::jsonb);
end $$;
revoke all on function public.finance_recent_receipts(text, uuid) from public, anon, authenticated;
grant execute on function public.finance_recent_receipts(text, uuid) to authenticated;

-- RLS directa para los datos que sí se pueden separar por tabla sin romper
-- la operación diaria. Las funciones SECURITY DEFINER operativas (cobros,
-- abonos y detalle de una ficha) conservan sus propias comprobaciones.
do $$ begin
  if to_regclass('public.bank_accounts') is not null then
    execute 'drop policy if exists cashier_account_balances_restrictive on public.bank_accounts';
    execute 'create policy cashier_account_balances_restrictive on public.bank_accounts as restrictive for select to authenticated using (public.is_admin() or (public.is_cashier() and public.finance_permission_enabled(''cashier_can_view_account_balances'')))';
  end if;

  if to_regclass('public.member_balances') is not null then
    execute 'drop policy if exists cashier_receivables_member_balances on public.member_balances';
    execute 'create policy cashier_receivables_member_balances on public.member_balances as restrictive for select to authenticated using (member_id = (select auth.uid()) or public.is_admin() or (public.is_cashier() and public.finance_permission_enabled(''cashier_can_view_receivables'')))';
  end if;

  if to_regclass('public.client_debt_balances') is not null then
    execute 'drop policy if exists cashier_receivables_client_balances on public.client_debt_balances';
    execute 'create policy cashier_receivables_client_balances on public.client_debt_balances as restrictive for select to authenticated using (public.is_admin() or (public.is_cashier() and public.finance_permission_enabled(''cashier_can_view_receivables'')))';
  end if;

  if to_regclass('public.client_debt_entries') is not null then
    execute 'drop policy if exists cashier_receivables_client_entries on public.client_debt_entries';
    execute 'create policy cashier_receivables_client_entries on public.client_debt_entries as restrictive for select to authenticated using (public.is_admin() or (public.is_cashier() and public.finance_permission_enabled(''cashier_can_view_receivables'')))';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
