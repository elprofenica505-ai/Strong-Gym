-- 00072 · Grilla semanal administrable (OP-05, primera etapa)
--
-- Problema: `generate_week_sessions()` armaba las sesiones desde una plantilla
-- fija escrita en SQL (solo Boxeo, martes y jueves). Para abrir Zumba u otra
-- disciplina no había forma de cargar su horario desde la aplicación: había
-- que editar código y migrar. Tampoco existía dónde ver ni corregir la grilla.
--
-- Decisión de esta etapa:
--   * La grilla pasa a ser DATOS: `class_schedule_slots` (una fila por
--     disciplina, día de la semana y hora), con sala, cupo, duración,
--     entrenador y vigencia opcional.
--   * `generate_week_sessions()` lee esa tabla; la plantilla fija deja de usarse.
--     La migración carga como semilla las nueve sesiones de Boxeo que ya
--     existían, así el calendario no cambia por sí solo.
--   * Solo administración con MFA edita, activa o anula horarios.
--   * Guardar un horario crea sus sesiones de las próximas semanas, sin
--     duplicar y sin tocar las que ya tienen reservas.
--   * Anular un horario es `is_active = false`: no se borra la fila ni las
--     sesiones ya creadas.
--   * Se rechazan choques de sala o de entrenador en el mismo día y horario.
--
-- Reversión segura: `create or replace` de `generate_week_sessions()` con la
-- versión de 00003 y quitar las funciones `admin_*` de esta migración. La tabla
-- puede quedarse: no la usa nada más y no borra datos.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.classes') is null
     or to_regclass('public.sessions') is null
     or to_regclass('public.coaches') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.generate_week_sessions(date)') is null then
    raise exception 'SCHEDULE_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. La grilla: una fila = una clase fija en un día y hora.
--    `day_of_week` sigue la convención que ya usaba la plantilla: 0 = lunes.
create table if not exists public.class_schedule_slots (
  id           uuid primary key default gen_random_uuid(),
  class_id     text not null references public.classes (id) on delete restrict,
  day_of_week  integer not null check (day_of_week between 0 and 6),
  start_time   time not null,
  duration_min integer not null check (duration_min between 10 and 180),
  capacity     integer not null check (capacity between 1 and 200),
  room         text not null default 'Salón principal'
               check (length(trim(room)) between 2 and 60),
  coach_id     text references public.coaches (id) on delete set null,
  valid_from   date,
  valid_to     date,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id) on delete set null,
  constraint class_schedule_slots_dates_chk
    check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

create index if not exists class_schedule_slots_order_idx
  on public.class_schedule_slots (day_of_week, start_time) where is_active;

alter table public.class_schedule_slots enable row level security;
revoke all on public.class_schedule_slots from public, anon, authenticated;

-- 2. Semilla: exactamente el Boxeo que ya estaba en la plantilla fija.
insert into public.class_schedule_slots
  (class_id, day_of_week, start_time, duration_min, capacity, room, coach_id)
select c.id, s.day, s.start_time, c.duration_min, c.capacity,
  case c.slug
    when 'boxeo' then 'Área de boxeo'
    when 'musculacion' then 'Sala de máquinas'
    when 'zumba' then 'Salón de clases'
    else 'Salón principal'
  end,
  (select co.id from public.coaches co
    where co.is_active and c.slug = any (co.specialties)
    order by co.sort_order, co.id limit 1)
from (values
  (1, '06:00'::time), (1, '17:30'::time), (1, '20:00'::time),
  (2, '06:00'::time), (2, '17:30'::time), (2, '20:00'::time),
  (3, '06:00'::time), (3, '17:30'::time), (3, '20:00'::time)
) as s(day, start_time)
join public.classes c on c.slug = 'boxeo'
where not exists (select 1 from public.class_schedule_slots);

-- 3. El generador de semana ahora lee la grilla. Misma firma y mismo permiso
--    que la versión anterior para no romper a quien ya lo llamaba.
create or replace function public.generate_week_sessions(p_monday date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
  v_slot record;
  v_start timestamptz;
  v_coach text;
  v_duration integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  ) and auth.uid() is not null then
    raise exception 'AUTH: sólo el staff puede generar horarios';
  end if;

  for v_slot in
    select s.*, c.slug, c.duration_min as class_duration, c.capacity as class_capacity
    from public.class_schedule_slots s
    join public.classes c on c.id = s.class_id and c.is_active
    where s.is_active
      and (s.valid_from is null or s.valid_from <= p_monday + s.day_of_week)
      and (s.valid_to is null or s.valid_to >= p_monday + s.day_of_week)
    order by s.day_of_week, s.start_time, c.sort_order
  loop
    -- `fecha + hora` sin zona, interpretada como hora local de Managua.
    v_start := ((p_monday + v_slot.day_of_week) + v_slot.start_time)
               at time zone 'America/Managua';

    if exists (
      select 1 from public.sessions
      where class_id = v_slot.class_id and starts_at = v_start
    ) then
      continue;
    end if;

    v_coach := v_slot.coach_id;
    if v_coach is null then
      select id into v_coach
      from public.coaches
      where is_active and v_slot.slug = any (specialties)
      order by sort_order, id
      limit 1;
    end if;

    v_duration := coalesce(v_slot.duration_min, v_slot.class_duration);

    insert into public.sessions (class_id, coach_id, starts_at, ends_at, capacity, room)
    values (
      v_slot.class_id,
      v_coach,
      v_start,
      v_start + make_interval(mins => v_duration),
      coalesce(v_slot.capacity, v_slot.class_capacity),
      coalesce(nullif(trim(v_slot.room), ''), 'Salón principal')
    );

    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end $$;

revoke all on function public.generate_week_sessions(date) from public, anon;
grant execute on function public.generate_week_sessions(date) to authenticated;

-- 4. Rellenar las próximas semanas con la grilla vigente. Es idempotente:
--    nunca duplica una sesión que ya existe ni toca las reservas.
create or replace function public.schedule_generate_weeks(p_weeks integer default 4)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.plan_local_today();
  v_monday date := date_trunc('week', v_today::timestamp)::date;
  v_offset integer;
  v_created integer := 0;
begin
  if p_weeks is null or p_weeks < 1 or p_weeks > 8 then
    raise exception 'INVALID_WEEKS';
  end if;

  perform pg_advisory_xact_lock(hashtext('strong_gym_schedule_generate'));

  for v_offset in 0..p_weeks - 1 loop
    v_created := v_created + public.generate_week_sessions(v_monday + (v_offset * 7));
  end loop;

  return v_created;
end $$;
revoke all on function public.schedule_generate_weeks(integer) from public, anon, authenticated;

-- 5. Pantalla de grilla.
create or replace function public.admin_schedule_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.plan_local_today();
  v_monday date := date_trunc('week', v_today::timestamp)::date;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  return jsonb_build_object(
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'class_id', s.class_id,
        'class_name', c.name_es,
        'class_slug', c.slug,
        'class_active', c.is_active,
        'day_of_week', s.day_of_week,
        'start_time', to_char(s.start_time, 'HH24:MI'),
        'duration_min', s.duration_min,
        'capacity', s.capacity,
        'room', s.room,
        'coach_id', s.coach_id,
        'coach_name', co.name,
        'is_active', s.is_active
      ) order by s.day_of_week, s.start_time, c.sort_order)
      from public.class_schedule_slots s
      join public.classes c on c.id = s.class_id
      left join public.coaches co on co.id = s.coach_id
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name_es, 'active', c.is_active)
        order by c.sort_order, c.id)
      from public.classes c
    ), '[]'::jsonb),
    'coaches', coalesce((
      select jsonb_agg(jsonb_build_object('id', co.id, 'name', co.name, 'specialties', co.specialties)
        order by co.sort_order, co.id)
      from public.coaches co
      where co.is_active
    ), '[]'::jsonb),
    'room_hint', 'Usá la misma sala para que el choque de horario se detecte.',
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week_start', (v_monday + (w * 7)),
        'scheduled', (
          select count(*)::int from public.sessions s
          where s.status = 'scheduled'
            and s.starts_at >= ((v_monday + (w * 7)) + time '00:00') at time zone 'America/Managua'
            and s.starts_at < ((v_monday + ((w + 1) * 7)) + time '00:00') at time zone 'America/Managua'
        )
      ) order by w)
      from generate_series(0, 3) as w
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_schedule_board() from public, anon, authenticated;
grant execute on function public.admin_schedule_board() to authenticated;

-- 6. Guardar un horario (crear o editar). Rechaza choques de sala o entrenador.
create or replace function public.admin_save_schedule_slot(
  p_id uuid,
  p_class_id text,
  p_day integer,
  p_start text,
  p_duration integer,
  p_capacity integer,
  p_room text,
  p_coach text,
  p_active boolean default true,
  p_weeks integer default 4
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_class public.classes;
  v_start time;
  v_room text := trim(coalesce(p_room, ''));
  v_id uuid;
  v_conflict record;
  v_created integer := 0;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_class_id is null then raise exception 'INVALID_CLASS'; end if;
  select * into v_class from public.classes where id = p_class_id;
  if not found then raise exception 'INVALID_CLASS'; end if;
  if p_day is null or p_day not between 0 and 6 then raise exception 'INVALID_DAY'; end if;
  begin
    v_start := coalesce(nullif(trim(coalesce(p_start, '')), ''), '18:00')::time;
  exception when others then
    raise exception 'INVALID_TIME';
  end;
  if p_duration is null or p_duration not between 10 and 180 then raise exception 'INVALID_DURATION'; end if;
  if p_capacity is null or p_capacity not between 1 and 200 then raise exception 'INVALID_CAPACITY'; end if;
  if length(v_room) not between 2 and 60 then raise exception 'INVALID_ROOM'; end if;
  if p_coach is not null and not exists (
    select 1 from public.coaches where id = p_coach and is_active
  ) then
    raise exception 'INVALID_COACH';
  end if;

  -- Choque: misma sala o mismo entrenador, mismo día, horarios que se pisan.
  select s.id, s.start_time, s.duration_min, s.room, s.coach_id into v_conflict
  from public.class_schedule_slots s
  where s.is_active
    and s.day_of_week = p_day
    and (p_id is null or s.id <> p_id)
    and (s.room = v_room or (p_coach is not null and s.coach_id = p_coach))
    and v_start < (s.start_time + make_interval(mins => s.duration_min))
    and (v_start + make_interval(mins => p_duration)) > s.start_time
  limit 1;
  if found then
    raise exception 'SCHEDULE_CONFLICT';
  end if;

  perform pg_advisory_xact_lock(hashtext('strong_gym_admin_schedule'));

  if p_id is null then
    insert into public.class_schedule_slots
      (class_id, day_of_week, start_time, duration_min, capacity, room, coach_id, is_active, updated_by)
    values
      (p_class_id, p_day, v_start, p_duration, p_capacity, v_room, p_coach, coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.class_schedule_slots
       set class_id = p_class_id,
           day_of_week = p_day,
           start_time = v_start,
           duration_min = p_duration,
           capacity = p_capacity,
           room = v_room,
           coach_id = p_coach,
           is_active = coalesce(p_active, is_active),
           updated_at = now(),
           updated_by = auth.uid()
     where id = p_id
     returning id into v_id;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;

  if coalesce(p_active, true) then
    v_created := public.schedule_generate_weeks(coalesce(p_weeks, 4));
  end if;

  return public.admin_schedule_board() || jsonb_build_object('created_sessions', v_created, 'slot_id', v_id);
end $$;
revoke all on function public.admin_save_schedule_slot(uuid,text,integer,text,integer,integer,text,text,boolean,integer)
  from public, anon, authenticated;
grant execute on function public.admin_save_schedule_slot(uuid,text,integer,text,integer,integer,text,text,boolean,integer)
  to authenticated;

-- 7. Anular o reactivar un horario. No borra la fila ni las sesiones creadas.
create or replace function public.admin_set_schedule_slot_active(
  p_id uuid, p_active boolean, p_weeks integer default 4
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created integer := 0;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_id is null or p_active is null then raise exception 'INVALID_REQUEST'; end if;

  update public.class_schedule_slots
     set is_active = p_active, updated_at = now(), updated_by = auth.uid()
   where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- Reactivar vuelve a crear las sesiones que falten; anular no cancela las
  -- que ya existen, para no quitarle la clase a quien ya reservó.
  if p_active then
    v_created := public.schedule_generate_weeks(coalesce(p_weeks, 4));
  end if;

  return public.admin_schedule_board() || jsonb_build_object('created_sessions', v_created);
end $$;
revoke all on function public.admin_set_schedule_slot_active(uuid, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.admin_set_schedule_slot_active(uuid, boolean, integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;
