-- 00057 · Recepción: tarifa en córdobas del pase del día
--
-- Alcance aprobado, pequeño y aditivo:
--   * NO se toca public.plans.price. Ese precio histórico sigue siendo USD
--     (por ejemplo, Boxeo se muestra como US$20). Guardar C$40 allí
--     publicaría por error un pase de US$40.
--   * Se agrega price_nio como tarifa separada en córdobas. El pase del día
--     arranca en C$40 solo si todavía no tiene tarifa; nunca pisa un valor
--     que administración ya haya configurado.
--   * crm_options() expone slug, periodo y price_nio al personal autorizado
--     para que la ficha pueda preparar el cobro existente. No se crea otro
--     motor de cobro ni otra tabla.
--   * Solo un administrador con MFA puede cambiar la tarifa, mediante una
--     función acotada al plan de una sesión `pase-del-dia`.
--
-- Reversión segura: volver crm_options() a la definición de 00022 y retirar
-- admin_set_day_pass_price_nio(numeric). La columna price_nio puede quedar
-- sin uso; no hace falta borrar datos para revertir el flujo.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.plans') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.crm_is_staff()') is null
     or to_regprocedure('public.crm_finance_layout()') is null then
    raise exception 'DAY_PASS_TARIFF_PREREQUISITE_MISSING';
  end if;
end $$;

alter table public.plans
  add column if not exists price_nio numeric(12, 2);

do $$ begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'plans_price_nio_nonnegative_chk'
       and conrelid = 'public.plans'::regclass
  ) then
    alter table public.plans
      add constraint plans_price_nio_nonnegative_chk
      check (price_nio is null or price_nio >= 0);
  end if;
end $$;

comment on column public.plans.price_nio is
  'Tarifa opcional en córdobas (NIO). No reemplaza plans.price, que sigue siendo USD.';

-- Tarifa inicial aprobada. Solo completa el valor si está vacío.
update public.plans
   set price_nio = 40
 where slug = 'pase-del-dia'
   and period = 'session'
   and price_nio is null;

-- Misma función de 00022; el único cambio es que cada plan también trae
-- slug, period y price_nio para identificar la tarifa del pase del día.
create or replace function public.crm_options()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_layout text; v_methods jsonb; v_accounts jsonb; v_plans jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  v_layout := public.crm_finance_layout();
  if v_layout='unsupported' then raise exception 'FINANCE_SCHEMA_UNSUPPORTED'; end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by sort_order),'[]'::jsonb) into v_plans
    from (select id,name_es,slug,period,price_nio,sort_order from public.plans where is_active) p;
  if v_layout='repository' then
    select coalesce(jsonb_agg(to_jsonb(m) order by sort_order),'[]'::jsonb) into v_methods
      from (select id,name_es,accepts_nio,accepts_usd,sort_order from public.payment_methods where is_active) m;
    select coalesce(jsonb_agg(to_jsonb(a) order by name),'[]'::jsonb) into v_accounts
      from (select id,name,currency from public.accounts where is_active) a;
  else
    select coalesce(jsonb_agg(to_jsonb(m) order by display_order),'[]'::jsonb) into v_methods
      from (select id,name as name_es,currency in ('NIO','BOTH') as accepts_nio,
        currency in ('USD','BOTH') as accepts_usd,display_order from public.payment_methods where is_active) m;
    select coalesce(jsonb_agg(to_jsonb(a) order by display_order),'[]'::jsonb) into v_accounts
      from (select id,name,currency,display_order from public.bank_accounts where is_active) a;
  end if;
  return jsonb_build_object('plans',v_plans,'methods',v_methods,'accounts',v_accounts,
    'finance_layout',v_layout,'payments_enabled',v_layout='repository',
    'payment_block_reason',case when v_layout<>'repository' then
      'Cobros CRM pendientes de compatibilidad con esta Caja. No se guardará ningún cobro desde esta ficha; no lo repitas en otra pantalla sin revisar el historial.' else null end);
end $$;
revoke all on function public.crm_options() from public, anon, authenticated;
grant execute on function public.crm_options() to authenticated;

-- Editor acotado: no acepta un id arbitrario ni permite tocar otros planes.
-- NULL quita la tarifa rápida y la web vuelve a mostrar "Consultar".
create or replace function public.admin_set_day_pass_price_nio(p_price numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id text;
  v_slug text;
  v_name text;
  v_price numeric;
  v_active boolean;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_price is not null
     and (p_price <= 0 or p_price > 99999999 or p_price <> round(p_price, 2)) then
    raise exception 'INVALID_PRICE';
  end if;

  update public.plans
     set price_nio = p_price
   where slug = 'pase-del-dia'
     and period = 'session'
  returning id, slug, name_es, price_nio, is_active
       into v_id, v_slug, v_name, v_price, v_active;

  if not found then raise exception 'NOT_FOUND'; end if;

  return jsonb_build_object(
    'id', v_id,
    'slug', v_slug,
    'name_es', v_name,
    'price_nio', v_price,
    'is_active', v_active
  );
end $$;
revoke all on function public.admin_set_day_pass_price_nio(numeric) from public, anon, authenticated;
grant execute on function public.admin_set_day_pass_price_nio(numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
