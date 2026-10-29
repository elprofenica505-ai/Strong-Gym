-- 00074 · Generar sesiones con previsualización (OP-05, segunda etapa)
--
-- Problema: hasta ahora la grilla generaba sesiones de forma implícita —
-- cuatro semanas al guardar un horario y lo mismo desde el botón de
-- Operación— sin decir antes qué se iba a crear ni qué se iba a omitir. Si
-- alguien cargaba un horario, no sabía si su clase entraba al calendario o
-- quedaba afuera por duplicado o por choque.
--
-- Decisión de esta etapa:
--   * El plan de generación se calcula aparte y se puede mirar sin escribir
--     nada: `admin_preview_schedule(desde, semanas)`.
--   * Se puede generar para una fecha de inicio elegida y de 1 a 8 semanas:
--     `admin_apply_schedule(desde, semanas)`. Solo inserta lo que el plan
--     marcó como "crear".
--   * Cada clase candidata queda clasificada con un motivo legible:
--     se crea, ya existe, choca la sala, choca el entrenador, ya pasó o la
--     disciplina está desactivada.
--   * No se borra ni se modifica ninguna sesión existente ni ninguna reserva.
--     Generar dos veces seguidas no duplica: la segunda no crea nada.
--   * Solo administración con MFA. Usa el mismo cerrojo que
--     `schedule_generate_weeks()` para que dos generaciones simultáneas no se
--     pisen.
--
-- Reversión segura: eliminar `admin_preview_schedule`, `admin_apply_schedule`
-- y `_schedule_plan`. No se toca ninguna tabla ni datos.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.class_schedule_slots') is null
     or to_regclass('public.sessions') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'SCHEDULE_PLAN_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. El plan: qué pasaría si se generara el rango pedido. No escribe nada.
--    `p_from` puede ser cualquier día; se recorre esa fecha y las semanas
--    siguientes, y cada horario cae en su día de la semana.
create or replace function public._schedule_plan(p_from date, p_weeks integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with rango as (
    select p_from as desde, (p_from + (p_weeks * 7) - 1) as hasta
  ),
  dias as (
    select g::date as dia
    from rango, generate_series(rango.desde::timestamp, rango.hasta::timestamp, interval '1 day') g
  ),
  candidatas as (
    select
      d.dia,
      s.id as slot_id,
      s.day_of_week,
      to_char(s.start_time, 'HH24:MI') as hora,
      s.class_id,
      c.name_es as class_name,
      c.is_active as class_active,
      c.sort_order,
      s.room,
      s.coach_id,
      coalesce(
        nullif(to_jsonb(co) ->> 'full_name', ''),
        nullif(to_jsonb(co) ->> 'name', ''),
        s.coach_id
      ) as coach_name,
      ((d.dia + s.start_time) at time zone 'America/Managua') as starts_at,
      ((d.dia + s.start_time) at time zone 'America/Managua')
        + make_interval(mins => s.duration_min) as ends_at
    from dias d
    join public.class_schedule_slots s
      on s.day_of_week = ((extract(dow from d.dia)::integer + 6) % 7)
     and s.is_active
     and (s.valid_from is null or s.valid_from <= d.dia)
     and (s.valid_to is null or s.valid_to >= d.dia)
    join public.classes c on c.id = s.class_id
    left join public.coaches co on co.id = s.coach_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(x.dia, 'YYYY-MM-DD'),
      'slot_id', x.slot_id,
      'day_of_week', x.day_of_week,
      'start_time', x.hora,
      'class_id', x.class_id,
      'class_name', x.class_name,
      'room', x.room,
      'coach_id', x.coach_id,
      'coach_name', x.coach_name,
      'status', x.estado
    )
    order by x.dia, x.starts_at, x.sort_order, x.class_id
  ), '[]'::jsonb)
  from (
    select
      cc.*,
      case
        when not cc.class_active then 'inactive'
        when cc.starts_at <= now() then 'past'
        when exists (
          select 1 from public.sessions s
           where s.class_id = cc.class_id and s.starts_at = cc.starts_at
        ) then 'duplicate'
        when exists (
          select 1 from public.sessions s
           where s.status = 'scheduled'
             and s.room = cc.room
             and s.starts_at < cc.ends_at
             and s.ends_at > cc.starts_at
        ) then 'room_conflict'
        when cc.coach_id is not null and exists (
          select 1 from public.sessions s
           where s.status = 'scheduled'
             and s.coach_id = cc.coach_id
             and s.starts_at < cc.ends_at
             and s.ends_at > cc.starts_at
        ) then 'coach_conflict'
        else 'create'
      end as estado
    from candidatas cc
  ) x
$$;

revoke all on function public._schedule_plan(date, integer)
  from public, anon, authenticated;

-- 2. Mirar el plan sin escribir nada.
create or replace function public.admin_preview_schedule(
  p_from date default null,
  p_weeks integer default 4
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_from date;
  v_plan jsonb;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 8 then
    raise exception 'INVALID_WEEKS';
  end if;

  v_from := coalesce(
    p_from,
    date_trunc('week', public.plan_local_today()::timestamp)::date
  );
  v_plan := public._schedule_plan(v_from, p_weeks);

  return jsonb_build_object(
    'from', to_char(v_from, 'YYYY-MM-DD'),
    'to', to_char(v_from + (p_weeks * 7) - 1, 'YYYY-MM-DD'),
    'weeks', p_weeks,
    'created', 0,
    'totals', jsonb_build_object(
      'create', (select count(*)::int from jsonb_array_elements(v_plan) i where i ->> 'status' = 'create'),
      'duplicate', (select count(*)::int from jsonb_array_elements(v_plan) i where i ->> 'status' = 'duplicate'),
      'room_conflict', (select count(*)::int from jsonb_array_elements(v_plan) i where i ->> 'status' = 'room_conflict'),
      'coach_conflict', (select count(*)::int from jsonb_array_elements(v_plan) i where i ->> 'status' = 'coach_conflict'),
      'past', (select count(*)::int from jsonb_array_elements(v_plan) i where i ->> 'status' = 'past'),
      'inactive', (select count(*)::int from jsonb_array_elements(v_plan) i where i ->> 'status' = 'inactive')
    ),
    'items', v_plan
  );
end $$;

revoke all on function public.admin_preview_schedule(date, integer)
  from public, anon, authenticated;
grant execute on function public.admin_preview_schedule(date, integer)
  to authenticated;

-- 3. Generar exactamente lo que el plan marcó como "crear".
create or replace function public.admin_apply_schedule(
  p_from date default null,
  p_weeks integer default 4
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from date;
  v_plan jsonb;
  v_item jsonb;
  v_created integer := 0;
  v_preview jsonb;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 8 then
    raise exception 'INVALID_WEEKS';
  end if;

  v_from := coalesce(
    p_from,
    date_trunc('week', public.plan_local_today()::timestamp)::date
  );

  -- Mismo cerrojo que `schedule_generate_weeks()`: dos generaciones
  -- simultáneas no pueden crear la misma sesión dos veces.
  perform pg_advisory_xact_lock(hashtext('strong_gym_schedule_generate'));

  v_plan := public._schedule_plan(v_from, p_weeks);

  for v_item in
    select value from jsonb_array_elements(v_plan)
     where value ->> 'status' = 'create'
     order by value ->> 'date', value ->> 'start_time'
  loop
    -- Se inserta a partir del horario exacto del plan (`slot_id`), así no se
    -- repite la búsqueda ni se confunde un horario con otro parecido.
    insert into public.sessions (class_id, coach_id, starts_at, ends_at, capacity, room)
    select
      s.class_id,
      s.coach_id,
      ((v_item ->> 'date')::date + s.start_time) at time zone 'America/Managua',
      (((v_item ->> 'date')::date + s.start_time) at time zone 'America/Managua')
        + make_interval(mins => s.duration_min),
      s.capacity,
      s.room
    from public.class_schedule_slots s
    where s.id = (v_item ->> 'slot_id')::uuid
      and not exists (
        select 1 from public.sessions x
         where x.class_id = s.class_id
           and x.starts_at = ((v_item ->> 'date')::date + s.start_time)
                              at time zone 'America/Managua'
      );

    if found then
      v_created := v_created + 1;
    end if;
  end loop;

  v_preview := public.admin_preview_schedule(v_from, p_weeks);

  return v_preview || jsonb_build_object(
    'created', v_created,
    'planned', (select count(*)::int
                  from jsonb_array_elements(v_plan) i
                 where i ->> 'status' = 'create')
  );
end $$;

revoke all on function public.admin_apply_schedule(date, integer)
  from public, anon, authenticated;
grant execute on function public.admin_apply_schedule(date, integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;
