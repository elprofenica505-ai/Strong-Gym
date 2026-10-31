-- 00086 · Cuánta gente tiene cada plan y qué precio tuvo antes
--
-- Qué faltaba en Administración → Planes y modalidades:
--   1. La lista solo decía «Mes · 30 días · Todo el gimnasio · C$560». Para
--      contestar «¿cuánta gente tiene este plan?» había que ir ficha por ficha,
--      y no había forma de ver juntas a las personas de un plan.
--   2. Al cambiar un precio, el anterior se perdía. Un cobro de ayer a C$560
--      no se podía explicar mirando la pantalla, porque nadie guardaba cuándo
--      cambió ni quién lo cambió.
--
-- Qué agrega, y solo esto:
--   * `plan_price_log`: cada alta y cada cambio de precio de un plan, con el
--     valor de antes, el de después, quién y cuándo. Lo llena un disparador en
--     `plans`, así cubre las **dos** puertas que tocan precios (el editor de
--     tarifas rápidas y el catálogo de planes) sin repetir la regla en cada
--     función. Solo escribe cuando un precio cambió de verdad.
--   * `admin_plans_catalog()` suma a cada plan cuántas personas lo tienen
--     vigente, cuántas lo tienen por empezar, cuántos cobros hubo este mes y
--     el último cambio de precio.
--   * `admin_plan_usage(p_plan)` devuelve la lista de esas personas con su
--     vencimiento y el historial de precios del plan.
--
-- Qué NO hace: no cambia precios, no crea ni borra planes, no toca cobros ni
-- vigencias. Es lectura más una bitácora que se llena sola.
--
-- Sin datos inventados: los planes que ya existían **no** reciben un registro
-- histórico con fecha falsa; su primer registro es el primer cambio real que
-- ocurra después de esta migración. La pantalla lo dice así.
--
-- Seguridad: las tres piezas exigen `is_admin()` (administración con segundo
-- factor). La tabla no se entrega a `anon` ni a `authenticated`: se lee solo
-- por las funciones.
--
-- Reversible: `drop trigger ... on public.plans; drop function
-- plan_price_capture, admin_plan_usage; drop table public.plan_price_log;` y
-- volver a aplicar `admin_plans_catalog()` de la 00068.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.plans') is null
     or to_regclass('public.payment_plans') is null
     or to_regclass('public.gym_clients') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.plan_local_today()') is null then
    raise exception 'PLAN_USAGE_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. Bitácora de precios. Mismos criterios que `class_audit` (00077).
create table if not exists public.plan_price_log (
  id             uuid primary key default gen_random_uuid(),
  plan_id        text not null,
  action         text not null check (action in ('alta', 'edicion')),
  before         jsonb,
  after          jsonb not null,
  changed_fields text[] not null default '{}',
  changed_by     uuid references public.profiles (id) on delete set null,
  changed_at     timestamptz not null default now()
);

create index if not exists plan_price_log_plan_idx
  on public.plan_price_log (plan_id, changed_at desc);

alter table public.plan_price_log enable row level security;
revoke all on public.plan_price_log from public, anon, authenticated;

-- 2. Llenado automático. Un solo lugar para las dos pantallas que editan
--    precios; si el valor no cambió, no se escribe nada.
create or replace function public.plan_price_capture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_fields text[] := '{}';
begin
  v_after := jsonb_build_object(
    'price_nio', new.price_nio,
    'price', new.price,
    'validity_currency', new.validity_currency,
    'validity_amount', new.validity_amount
  );

  if tg_op = 'INSERT' then
    insert into public.plan_price_log(plan_id, action, before, after, changed_fields, changed_by)
    values (
      new.id, 'alta', null, v_after,
      array['price_nio', 'price', 'validity_currency', 'validity_amount'],
      auth.uid()
    );
    return new;
  end if;

  v_before := jsonb_build_object(
    'price_nio', old.price_nio,
    'price', old.price,
    'validity_currency', old.validity_currency,
    'validity_amount', old.validity_amount
  );
  if new.price_nio is distinct from old.price_nio then
    v_fields := v_fields || 'price_nio'::text;
  end if;
  if new.price is distinct from old.price then
    v_fields := v_fields || 'price'::text;
  end if;
  if new.validity_currency is distinct from old.validity_currency then
    v_fields := v_fields || 'validity_currency'::text;
  end if;
  if new.validity_amount is distinct from old.validity_amount then
    v_fields := v_fields || 'validity_amount'::text;
  end if;

  if cardinality(v_fields) = 0 then
    return new;
  end if;

  insert into public.plan_price_log(plan_id, action, before, after, changed_fields, changed_by)
  values (new.id, 'edicion', v_before, v_after, v_fields, auth.uid());
  return new;
end $$;
revoke all on function public.plan_price_capture() from public, anon, authenticated;

drop trigger if exists plan_price_capture on public.plans;
create trigger plan_price_capture
  after insert or update on public.plans
  for each row execute function public.plan_price_capture();

-- 3. Catálogo con el uso de cada plan.
create or replace function public.admin_plans_catalog()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.plan_local_today();
  -- Primer instante del mes en curso, en la hora de Managua.
  v_month timestamptz := date_trunc('month', v_today) at time zone 'America/Managua';
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  return jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name_es', p.name_es, 'name_en', p.name_en,
        'period', p.period, 'price_nio', p.price_nio, 'price', p.price,
        'access_kind', p.access_kind, 'class_id', p.class_id,
        'class_name', (select name_es from public.classes where id = p.class_id),
        'duration_days', p.duration_days,
        'validity_currency', p.validity_currency,
        'validity_amount', p.validity_amount,
        'is_active', p.is_active, 'sort_order', p.sort_order,
        'updated_at', p.updated_at,
        -- Quiénes lo tienen hoy, quiénes lo tienen por empezar y cuántos se
        -- cobraron este mes. Los segmentos anulados no cuentan (00085).
        'holders_active', (
          select count(*)::int from public.payment_plans s
           where s.plan_id = p.id and s.voided_at is null
             and s.started_on <= v_today and s.expires_on >= v_today
        ),
        'holders_upcoming', (
          select count(*)::int from public.payment_plans s
           where s.plan_id = p.id and s.voided_at is null and s.started_on > v_today
        ),
        'sold_this_month', (
          select count(*)::int from public.payment_plans s
           where s.plan_id = p.id and s.voided_at is null
             and s.created_at >= v_month
        ),
        'last_price_change', (
          select jsonb_build_object(
            'action', l.action, 'before', l.before, 'after', l.after,
            'changedAt', l.changed_at, 'changedBy', l.changed_by,
            'changedByName', (select full_name from public.profiles where id = l.changed_by)
          )
          from public.plan_price_log l
          where l.plan_id = p.id
          order by l.changed_at desc, l.id desc
          limit 1
        )
      ) order by p.sort_order, p.name_es)
      from public.plans p
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name_es', c.name_es, 'is_active', c.is_active)
        order by c.sort_order, c.name_es)
      from public.classes c
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_plans_catalog() from public, anon, authenticated;
grant execute on function public.admin_plans_catalog() to authenticated;

-- 4. Quiénes tienen un plan y qué precios tuvo.
create or replace function public.admin_plan_usage(p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.plan_local_today();
  v_plan public.plans;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_plan is null then raise exception 'NOT_FOUND'; end if;

  select * into v_plan from public.plans where id = p_plan;
  if not found then raise exception 'NOT_FOUND'; end if;

  return jsonb_build_object(
    'plan', jsonb_build_object(
      'id', v_plan.id, 'name_es', v_plan.name_es, 'name_en', v_plan.name_en,
      'access_kind', v_plan.access_kind, 'duration_days', v_plan.duration_days,
      'validity_currency', v_plan.validity_currency,
      'validity_amount', v_plan.validity_amount,
      'price_nio', v_plan.price_nio, 'is_active', v_plan.is_active
    ),
    'today', v_today,
    -- Vigentes y por empezar: es lo que se consulta en el mostrador. Los
    -- vencidos quedan fuera para que la lista no se vuelva un archivo.
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clientId', s.client_id,
        'name', c.full_name,
        'startedOn', s.started_on,
        'expiresOn', s.expires_on,
        'daysLeft', greatest(s.expires_on - v_today + 1, 0),
        'pricePaid', s.price_paid,
        'currency', s.currency,
        'state', case when s.started_on > v_today then 'upcoming' else 'active' end
      ) order by s.started_on, c.full_name)
      from public.payment_plans s
      join public.gym_clients c on c.id = s.client_id
      where s.plan_id = v_plan.id
        and s.voided_at is null
        and s.expires_on >= v_today
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'action', x.action, 'before', x.before, 'after', x.after,
        'changedAt', x.changed_at,
        'changedByName', (select full_name from public.profiles where id = x.changed_by)
      ) order by x.changed_at desc, x.id desc)
      from (
        select l.id, l.action, l.before, l.after, l.changed_at, l.changed_by
          from public.plan_price_log l
         where l.plan_id = v_plan.id
         order by l.changed_at desc, l.id desc
         limit 30
      ) x
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_plan_usage(text) from public, anon, authenticated;
grant execute on function public.admin_plan_usage(text) to authenticated;

notify pgrst, 'reload schema';

commit;
