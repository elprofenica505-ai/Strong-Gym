-- 00076 · Un paso, un efecto: guardar un horario ya no crea clases solo
--
-- Problema de lógica detectado al usar la pantalla: al guardar un horario
-- fijo (o al reactivarlo) la base creaba de golpe las clases de las próximas
-- cuatro semanas. Nadie lo pedía en ese momento y nadie veía qué se había
-- creado. La misma consecuencia llegaba por dos caminos distintos —guardar un
-- horario y el botón de generar— así que no había forma de saber de dónde
-- salió cada clase del calendario.
--
-- Regla nueva:
--   * Guardar, editar, suspender o reactivar un horario fijo NO escribe en el
--     calendario. Solo cambia la semana fija.
--   * Las clases con fecha se crean en un único lugar: la generación con
--     previsualización (`admin_apply_schedule`, migración 00074) y el
--     generador histórico de semanas que usa Operación.
--   * Las firmas no cambian: `p_weeks` se conserva por compatibilidad con las
--     llamadas existentes, pero ya no tiene efecto. `created_sessions` sigue
--     viniendo en la respuesta, ahora siempre en 0, para que la pantalla no
--     tenga que cambiar de contrato.
--
-- Reversión segura: volver a las definiciones de 00072 (las funciones que
-- llamaban a `schedule_generate_weeks()`). No se toca ningún dato.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.class_schedule_slots') is null
     or to_regprocedure('public.schedule_generate_weeks(integer)') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'SCHEDULE_SLOT_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. Guardar un horario: misma validación y mismos choques, sin generar clases.
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

  -- Ninguna clase se crea acá: eso pasa en el paso de "pasar al calendario".
  return public.admin_schedule_board() || jsonb_build_object(
    'created_sessions', 0,
    'slot_id', v_id
  );
end $$;
revoke all on function public.admin_save_schedule_slot(uuid,text,integer,text,integer,integer,text,text,boolean,integer)
  from public, anon, authenticated;
grant execute on function public.admin_save_schedule_slot(uuid,text,integer,text,integer,integer,text,text,boolean,integer)
  to authenticated;

-- 2. Suspender o reactivar: tampoco genera. Reactivar no resucita clases.
create or replace function public.admin_set_schedule_slot_active(
  p_id uuid, p_active boolean, p_weeks integer default 4
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_id is null or p_active is null then raise exception 'INVALID_REQUEST'; end if;

  update public.class_schedule_slots
     set is_active = p_active, updated_at = now(), updated_by = auth.uid()
   where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  return public.admin_schedule_board() || jsonb_build_object('created_sessions', 0);
end $$;
revoke all on function public.admin_set_schedule_slot_active(uuid, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.admin_set_schedule_slot_active(uuid, boolean, integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;
