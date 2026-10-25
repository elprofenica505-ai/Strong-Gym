-- 00058 · Tarifas en córdobas de pesas y máquinas
--
-- Tarifas confirmadas por el dueño:
--   Día C$40 (ya estaba en 00057) · Semana C$150 · Quincena C$280 · Mes C$560.
--
-- Alcance aprobado:
--   * Solo pesas y máquinas. Boxeo queda aparte y no se toca: sigue con su
--     precio histórico `plans.price` en USD y sin usar estas tarifas NIO.
--   * Se reutiliza `public.plans` y `plans.price_nio` de 00057. No se crea
--     otra tabla ni otro motor de cobro.
--   * Cobrar Semana, Quincena o Mes solo registra el ingreso. Esta migración
--     NO activa, renueva ni calcula vigencia de membresía.
--   * La quincena usa el nuevo periodo `fortnight`. El editor nuevo solo
--     acepta los cuatro slugs de pesas y máquinas y exige administrador+MFA.
--
-- Reversión segura: poner `is_active = false` en los planes nuevos y dejar
-- sus `price_nio` en NULL; retirar `admin_set_plan_price_nio(text, numeric)`.
-- No hace falta borrar filas ni cobros. El periodo `fortnight` puede quedar
-- permitido sin uso.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.plans') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.crm_is_staff()') is null
     or to_regprocedure('public.crm_finance_layout()') is null
     or not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'plans'
          and column_name = 'price_nio'
     ) then
    raise exception 'GYM_TARIFFS_PREREQUISITE_MISSING';
  end if;
end $$;

-- Permitir `fortnight` sin tocar otras restricciones de la tabla.
do $$
declare
  r record;
begin
  for r in
    select distinct c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any (c.conkey)
     where c.conrelid = 'public.plans'::regclass
       and c.contype = 'c'
       and a.attname = 'period'
  loop
    execute format('alter table public.plans drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.plans
  add constraint plans_period_check
  check (period in ('month', 'week', 'fortnight', 'session'));

-- Planes nuevos solo si todavía no existen por id ni por slug. Si una fila ya
-- fue creada a mano, no se pisa su contenido ni una tarifa ya configurada.
with new_plans(
  id, slug, name_es, name_en, tagline_es, tagline_en,
  price, price_nio, period, features_es, features_en,
  is_popular, sort_order, is_active
) as (
  values
    (
      'pln_semana', 'gimnasio-semanal', 'Gimnasio semanal', 'Weekly Gym',
      'Pesas y máquinas por una semana', 'Weights and machines for one week',
      null::numeric, 150::numeric, 'week',
      array['Máquinas modernas y pesas libres', 'Acceso en todo el horario de atención', 'Orientación del personal para usar los equipos']::text[],
      array['Modern machines and free weights', 'Access during all opening hours', 'Staff guidance on how to use the equipment']::text[],
      false, 3, true
    ),
    (
      'pln_quincena', 'gimnasio-quincenal', 'Gimnasio quincenal', '15-Day Gym',
      'Pesas y máquinas por 15 días', 'Weights and machines for 15 days',
      null::numeric, 280::numeric, 'fortnight',
      array['Máquinas modernas y pesas libres', 'Acceso en todo el horario de atención', 'Orientación del personal para usar los equipos']::text[],
      array['Modern machines and free weights', 'Access during all opening hours', 'Staff guidance on how to use the equipment']::text[],
      false, 4, true
    )
)
insert into public.plans (
  id, slug, name_es, name_en, tagline_es, tagline_en,
  price, price_nio, period, features_es, features_en,
  is_popular, sort_order, is_active
)
select n.id, n.slug, n.name_es, n.name_en, n.tagline_es, n.tagline_en,
       n.price, n.price_nio, n.period, n.features_es, n.features_en,
       n.is_popular, n.sort_order, n.is_active
  from new_plans n
 where not exists (
   select 1 from public.plans p where p.id = n.id or p.slug = n.slug
 );

-- Completar tarifas iniciales solo donde todavía estén vacías. Una tarifa que
-- administración ya haya cambiado no se vuelve a pisar si esto se reejecuta.
update public.plans
   set price_nio = case slug
     when 'gimnasio-semanal' then 150
     when 'gimnasio-quincenal' then 280
     when 'gimnasio-mensual' then 560
   end
 where (
     (slug = 'gimnasio-semanal' and period = 'week')
     or (slug = 'gimnasio-quincenal' and period = 'fortnight')
     or (slug = 'gimnasio-mensual' and period = 'month')
   )
   and price_nio is null;

-- Orden público por duración, después de Boxeo: día, semana, quincena y mes.
update public.plans
   set sort_order = case slug
     when 'pase-del-dia' then 2
     when 'gimnasio-semanal' then 3
     when 'gimnasio-quincenal' then 4
     when 'gimnasio-mensual' then 5
   end
 where (slug = 'pase-del-dia' and period = 'session')
    or (slug = 'gimnasio-semanal' and period = 'week')
    or (slug = 'gimnasio-quincenal' and period = 'fortnight')
    or (slug = 'gimnasio-mensual' and period = 'month');

-- Editor acotado a las cuatro tarifas NIO de pesas y máquinas. Boxeo y
-- cualquier otro slug se rechazan; NULL quita el cobro rápido de esa tarifa.
create or replace function public.admin_set_plan_price_nio(p_slug text, p_price numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id text;
  v_slug text;
  v_period text;
  v_expected_period text;
  v_name text;
  v_price numeric;
  v_active boolean;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  v_expected_period := case p_slug
    when 'pase-del-dia' then 'session'
    when 'gimnasio-semanal' then 'week'
    when 'gimnasio-quincenal' then 'fortnight'
    when 'gimnasio-mensual' then 'month'
    else null
  end;
  if v_expected_period is null then
    raise exception 'INVALID_PLAN';
  end if;
  if p_price is not null
     and (p_price <= 0 or p_price > 99999999 or p_price <> round(p_price, 2)) then
    raise exception 'INVALID_PRICE';
  end if;

  update public.plans
     set price_nio = p_price
   where slug = p_slug
     and period = v_expected_period
  returning id, slug, period, name_es, price_nio, is_active
       into v_id, v_slug, v_period, v_name, v_price, v_active;

  if not found then raise exception 'NOT_FOUND'; end if;

  return jsonb_build_object(
    'id', v_id,
    'slug', v_slug,
    'period', v_period,
    'name_es', v_name,
    'price_nio', v_price,
    'is_active', v_active
  );
end $$;
revoke all on function public.admin_set_plan_price_nio(text, numeric) from public, anon, authenticated;
grant execute on function public.admin_set_plan_price_nio(text, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
