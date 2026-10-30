-- 00078 · Sesiones sueltas y días especiales (OP-05, quinta etapa)
--
-- Problema: la grilla crea la clase de todos los martes a las 06:00, pero la
-- vida real no es tan prolija. Un sábado hay una clase especial a las 10:00,
-- un feriado se corre el horario, una sesión se suspende porque el entrenador
-- se enfermó, o el cupo de una fecha puntual cambió. Sin tocar la grilla, no
-- había forma de resolver eso: o se cambiaba la semana fija —y con ella todas
-- las semanas— o se quedaba como estaba.
--
-- Decisión de esta etapa:
--   * `admin_save_session()` crea o edita **una** clase con fecha: día, hora,
--     duración, cupo, sala, entrenador y una nota para el día especial. No
--     toca la grilla semanal y no crea clases como efecto colateral.
--   * `admin_cancel_session()` suspende **una** clase y deja canceladas sus
--     reservas con el motivo y quién las canceló. No borra nada.
--   * Para suspender varios días seguidos sigue estando **Bloqueos y
--     cierres**: no se duplica esa herramienta.
--   * La clase suelta se marca con `origin = 'manual'`, así la pantalla puede
--     distinguirla de las que crea la grilla sin adivinar.
--   * Mover una clase con reservas encima es válido —las reservas siguen a su
--     clase—, pero no se puede bajar el cupo por debajo de lo ya reservado ni
--     cambiar de disciplina con reservas.
--   * Se rechazan choques de sala y de entrenador, días bloqueados y fechas
--     pasadas. Cancelar una clase no la resucita al generar la semana: la fila
--     sigue ahí y el generador la cuenta como existente.
--
-- Reversión segura: eliminar `admin_save_session`, `admin_cancel_session` y
-- `admin_schedule_sessions`. Las columnas nuevas de `sessions` son opcionales
-- y quedan sin uso; no se borra ninguna clase ni ninguna reserva.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.sessions') is null
     or to_regclass('public.bookings') is null
     or to_regclass('public.classes') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.plan_local_today()') is null
     or to_regprocedure('public._session_blocked(text, text, timestamptz, timestamptz)') is null then
    raise exception 'SESSION_ADMIN_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. Rastro en la clase: de dónde salió, quién la tocó y por qué se canceló.
alter table public.sessions
  add column if not exists origin text not null default 'grid',
  add column if not exists note text,
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by uuid references public.profiles (id) on delete set null,
  add column if not exists cancelled_at timestamptz;

do $$ begin
  alter table public.sessions drop constraint if exists sessions_origin_chk;
  alter table public.sessions
    add constraint sessions_origin_chk check (origin in ('grid', 'manual'));
  alter table public.sessions drop constraint if exists sessions_note_chk;
  alter table public.sessions
    add constraint sessions_note_chk
    check (note is null or length(trim(note)) between 3 and 200);
end $$;

-- 2. Las clases de un período, con lo que cada una tiene encima.
create or replace function public.admin_schedule_sessions(
  p_from date default null,
  p_to date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.plan_local_today();
  v_from date;
  v_to date;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  v_from := coalesce(p_from, v_today);
  v_to := coalesce(p_to, v_today + 27);
  if v_to < v_from then raise exception 'INVALID_RANGE'; end if;
  if (v_to - v_from) > 120 then raise exception 'RANGE_TOO_LONG'; end if;

  return jsonb_build_object(
    'from', to_char(v_from, 'YYYY-MM-DD'),
    'to', to_char(v_to, 'YYYY-MM-DD'),
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'class_id', x.class_id,
        'class_name', x.class_name,
        'class_color', x.class_color,
        'class_active', x.class_active,
        'coach_id', x.coach_id,
        'coach_name', x.coach_name,
        'room', x.room,
        'starts_at', x.starts_at,
        'ends_at', x.ends_at,
        'duration_min', (extract(epoch from (x.ends_at - x.starts_at)) / 60)::int,
        'capacity', x.capacity,
        'booked', x.booked,
        'status', x.status,
        'origin', x.origin,
        'note', x.note,
        'cancel_reason', x.cancel_reason,
        'cancelled_at', x.cancelled_at,
        'is_past', x.starts_at <= now()
      ) order by x.starts_at, x.class_name)
      from (
        select
          s.id,
          s.class_id,
          c.name_es as class_name,
          c.color as class_color,
          c.is_active as class_active,
          s.coach_id,
          coalesce(
            nullif(to_jsonb(co) ->> 'full_name', ''),
            nullif(to_jsonb(co) ->> 'name', ''),
            s.coach_id
          ) as coach_name,
          s.room,
          s.starts_at,
          s.ends_at,
          s.capacity,
          s.status,
          s.origin,
          s.note,
          s.cancel_reason,
          s.cancelled_at,
          (
            select count(*)::int from public.bookings b
             where b.session_id = s.id and b.status in ('confirmed', 'attended')
          ) as booked
        from public.sessions s
        join public.classes c on c.id = s.class_id
        left join public.coaches co on co.id = s.coach_id
        where s.starts_at >= (v_from::timestamp at time zone 'America/Managua')
          and s.starts_at <  ((v_to + 1)::timestamp at time zone 'America/Managua')
        order by s.starts_at
        limit 300
      ) x
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_schedule_sessions(date, date)
  from public, anon, authenticated;
grant execute on function public.admin_schedule_sessions(date, date)
  to authenticated;

-- 3. Crear o editar una clase con fecha, sin tocar la semana fija.
create or replace function public.admin_save_session(
  p_id text,
  p_class_id text,
  p_date text,
  p_time text,
  p_duration integer,
  p_capacity integer,
  p_room text,
  p_coach text,
  p_note text default null,
  p_expected_starts text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text := nullif(trim(coalesce(p_id, '')), '');
  v_class public.classes;
  v_day date;
  v_clock time;
  v_starts timestamptz;
  v_ends timestamptz;
  v_room text := trim(coalesce(p_room, ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_old public.sessions;
  v_new public.sessions;
  v_booked integer := 0;
  v_action text;
  v_fields text[] := '{}';
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  if p_class_id is null then raise exception 'INVALID_CLASS'; end if;
  select * into v_class from public.classes where id = p_class_id;
  if not found then raise exception 'INVALID_CLASS'; end if;

  begin
    v_day := (p_date)::date;
  exception when others then
    raise exception 'INVALID_DATE';
  end;
  begin
    v_clock := (p_time)::time;
  exception when others then
    raise exception 'INVALID_TIME';
  end;
  if p_duration is null or p_duration not between 10 and 180 then
    raise exception 'INVALID_DURATION';
  end if;
  if p_capacity is null or p_capacity not between 1 and 200 then
    raise exception 'INVALID_CAPACITY';
  end if;
  if length(v_room) not between 2 and 60 then
    raise exception 'INVALID_ROOM';
  end if;
  if p_coach is not null and not exists (
    select 1 from public.coaches where id = p_coach and is_active
  ) then
    raise exception 'INVALID_COACH';
  end if;
  if v_note is not null and length(v_note) > 200 then
    raise exception 'INVALID_NOTE';
  end if;

  -- Fecha y hora se interpretan en la hora del gimnasio, no en UTC.
  v_starts := (v_day + v_clock) at time zone 'America/Managua';
  v_ends := v_starts + make_interval(mins => p_duration);

  perform pg_advisory_xact_lock(hashtext('strong_gym_admin_sessions'));

  if v_id is null then
    if not v_class.is_active then raise exception 'CLASS_INACTIVE'; end if;
    if v_starts <= now() then raise exception 'PAST_SESSION'; end if;
    if exists (
      select 1 from public.sessions
       where class_id = p_class_id and starts_at = v_starts and status = 'scheduled'
    ) then
      raise exception 'SESSION_EXISTS';
    end if;
  else
    select * into v_old from public.sessions where id = v_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_old.status <> 'scheduled' then raise exception 'SESSION_CANCELLED'; end if;
    if v_old.starts_at <= now() then raise exception 'PAST_SESSION'; end if;
    if p_expected_starts is not null
       and to_char(v_old.starts_at at time zone 'America/Managua', 'YYYY-MM-DD"T"HH24:MI')
           <> p_expected_starts then
      raise exception 'STALE_SESSION';
    end if;

    select count(*)::int into v_booked
      from public.bookings
     where session_id = v_id and status in ('confirmed', 'attended');

    if p_capacity < v_booked then
      raise exception 'CAPACITY_BELOW_BOOKINGS';
    end if;
    if v_old.class_id <> p_class_id and v_booked > 0 then
      raise exception 'CLASS_CHANGE_WITH_BOOKINGS';
    end if;
  end if;

  if public._session_blocked(p_class_id, p_coach, v_starts, v_ends) then
    raise exception 'BLOCKED';
  end if;

  if exists (
    select 1 from public.sessions s
     where s.status = 'scheduled'
       and s.id <> coalesce(v_id, '')
       and s.room = v_room
       and s.starts_at < v_ends
       and s.ends_at > v_starts
  ) then
    raise exception 'SCHEDULE_CONFLICT';
  end if;

  if p_coach is not null and exists (
    select 1 from public.sessions s
     where s.status = 'scheduled'
       and s.id <> coalesce(v_id, '')
       and s.coach_id = p_coach
       and s.starts_at < v_ends
       and s.ends_at > v_starts
  ) then
    raise exception 'SCHEDULE_CONFLICT';
  end if;

  if v_id is null then
    insert into public.sessions
      (class_id, coach_id, starts_at, ends_at, capacity, room, origin, note,
       created_by, updated_by, updated_at)
    values
      (p_class_id, p_coach, v_starts, v_ends, p_capacity, v_room, 'manual', v_note,
       auth.uid(), auth.uid(), now())
    returning * into v_new;

    v_id := v_new.id;
    v_action := 'alta';
    v_fields := array['starts_at', 'duration_min', 'capacity', 'room'];
  else
    update public.sessions
       set class_id = p_class_id,
           coach_id = p_coach,
           starts_at = v_starts,
           ends_at = v_ends,
           capacity = p_capacity,
           room = v_room,
           note = v_note,
           updated_by = auth.uid(),
           updated_at = now()
     where id = v_id
    returning * into v_new;

    if v_old.class_id <> v_new.class_id then
      v_fields := array_append(v_fields, 'class_id');
    end if;
    if v_old.starts_at <> v_new.starts_at then
      v_fields := array_append(v_fields, 'starts_at');
    end if;
    if (v_new.ends_at - v_new.starts_at) <> (v_old.ends_at - v_old.starts_at) then
      v_fields := array_append(v_fields, 'duration_min');
    end if;
    if v_old.capacity <> v_new.capacity then
      v_fields := array_append(v_fields, 'capacity');
    end if;
    if v_old.room <> v_new.room then
      v_fields := array_append(v_fields, 'room');
    end if;
    if v_old.coach_id is distinct from v_new.coach_id then
      v_fields := array_append(v_fields, 'coach_id');
    end if;
    if v_old.note is distinct from v_new.note then
      v_fields := array_append(v_fields, 'note');
    end if;

    if cardinality(v_fields) = 0 then
      v_action := 'sin_cambios';
    else
      v_action := 'edicion';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'changed_fields', v_fields,
    'session', jsonb_build_object(
      'id', v_new.id,
      'class_id', v_new.class_id,
      'class_name', v_class.name_es,
      'coach_id', v_new.coach_id,
      'room', v_new.room,
      'starts_at', v_new.starts_at,
      'ends_at', v_new.ends_at,
      'capacity', v_new.capacity,
      'booked', v_booked,
      'status', v_new.status,
      'origin', v_new.origin,
      'note', v_new.note
    )
  );
end $$;

revoke all on function public.admin_save_session(text, text, text, text, integer, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_save_session(text, text, text, text, integer, integer, text, text, text, text)
  to authenticated;

-- 4. Suspender una sola clase, sin borrar nada.
create or replace function public.admin_cancel_session(
  p_id text,
  p_reason text,
  p_confirmed boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions;
  v_reason text := trim(coalesce(p_reason, ''));
  v_booked integer := 0;
  v_cancelled integer := 0;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  if length(v_reason) < 3 or length(v_reason) > 200 then
    raise exception 'INVALID_REASON';
  end if;

  select * into v_session from public.sessions where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- Cancelar dos veces no cambia nada: la pantalla puede reintentar segura.
  if v_session.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'session_id', v_session.id,
      'cancelled_bookings', 0
    );
  end if;

  if v_session.starts_at <= now() then
    raise exception 'PAST_SESSION';
  end if;

  select count(*)::int into v_booked
    from public.bookings
   where session_id = p_id and status in ('confirmed', 'attended');

  -- Con reservas encima, primero se ve a quién afecta y después se confirma.
  if v_booked > 0 and not coalesce(p_confirmed, false) then
    raise exception 'CONFIRM_REQUIRED';
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = v_reason,
         cancelled_by = auth.uid()
   where session_id = p_id
     and status in ('confirmed', 'attended');
  get diagnostics v_cancelled = row_count;

  update public.sessions
     set status = 'cancelled',
         cancel_reason = v_reason,
         cancelled_by = auth.uid(),
         cancelled_at = now(),
         updated_by = auth.uid(),
         updated_at = now()
   where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'session_id', p_id,
    'cancelled_bookings', v_cancelled
  );
end $$;

revoke all on function public.admin_cancel_session(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_cancel_session(text, text, boolean)
  to authenticated;

notify pgrst, 'reload schema';
commit;
