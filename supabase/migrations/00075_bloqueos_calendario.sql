-- 00075 · Bloqueos y cierres del calendario (OP-05, tercera etapa)
--
-- Problema: si el gimnasio cierra por feriado, una disciplina para vacaciones
-- o un entrenador se enferma, no había forma de decirlo en la aplicación. Las
-- sesiones seguían programadas, el generador las volvía a crear y la gente
-- quedaba con una reserva para una clase que no va a existir.
--
-- Decisión de esta etapa:
--   * `schedule_blocks` guarda el cierre o bloqueo: todo el gimnasio, una
--     disciplina o un entrenador, entre dos fechas y horas, con motivo
--     —feriado, vacaciones, enfermedad, mantenimiento u otro— y una nota.
--   * Antes de aplicar se ve qué sesiones y cuántas reservas se tocan. Si hay
--     reservas, hace falta confirmar explícitamente.
--   * Aplicar cancela las sesiones afectadas y deja las reservas canceladas
--     con el motivo. No se borra nada: la sesión y la reserva quedan con su
--     historial.
--   * Si el bloqueo es de un entrenador y se elige un sustituto, en vez de
--     cancelar se reasigna la sesión al sustituto.
--   * El generador omite lo bloqueado: `_schedule_plan()` lo marca como
--     `blocked` y `generate_week_sessions()` no lo crea.
--   * Levantar un bloqueo lo deja `is_active = false`; no resucita sesiones
--     canceladas. Volver a programarlas es una acción explícita.
--
-- Reversión segura: eliminar las funciones `admin_*` y `_session_blocked` de
-- esta migración, restaurar `generate_week_sessions()` de 00072 y desmarcar
-- `schedule_blocks`. Las columnas nuevas de `bookings` son opcionales y no
-- rompen nada si quedan vacías.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.classes') is null
     or to_regclass('public.sessions') is null
     or to_regclass('public.bookings') is null
     or to_regclass('public.coaches') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'SCHEDULE_BLOCK_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. El motivo con el que se canceló una reserva queda escrito en la reserva.
alter table public.bookings
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by uuid references public.profiles (id) on delete set null;

-- 2. La tabla de bloqueos.
create table if not exists public.schedule_blocks (
  id                  uuid primary key default gen_random_uuid(),
  scope               text not null check (scope in ('gym', 'class', 'coach')),
  class_id            text references public.classes (id) on delete restrict,
  coach_id            text references public.coaches (id) on delete restrict,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  reason_kind         text not null
                      check (reason_kind in ('holiday', 'vacation', 'sick', 'maintenance', 'other')),
  reason              text not null check (length(trim(reason)) between 3 and 200),
  substitute_coach_id text references public.coaches (id) on delete set null,
  is_active           boolean not null default true,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint schedule_blocks_range_chk check (ends_at > starts_at),
  constraint schedule_blocks_scope_chk check (
    (scope = 'gym' and class_id is null and coach_id is null)
    or (scope = 'class' and class_id is not null and coach_id is null)
    or (scope = 'coach' and coach_id is not null and class_id is null)
  ),
  constraint schedule_blocks_substitute_chk check (
    substitute_coach_id is null or scope = 'coach'
  )
);

create index if not exists schedule_blocks_range_idx
  on public.schedule_blocks (starts_at, ends_at) where is_active;

-- Un mismo bloqueo no se carga dos veces; editar es otra cosa.
create unique index if not exists schedule_blocks_unique_idx
  on public.schedule_blocks (
    scope,
    coalesce(class_id, ''),
    coalesce(coach_id, ''),
    starts_at,
    ends_at
  )
  where is_active;

alter table public.schedule_blocks enable row level security;
revoke all on public.schedule_blocks from public, anon, authenticated;

-- 3. ¿Esta clase, con este entrenador y en este horario, cae en un bloqueo?
create or replace function public._session_blocked(
  p_class_id text,
  p_coach_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.schedule_blocks b
     where b.is_active
       and b.starts_at < p_ends_at
       and b.ends_at > p_starts_at
       and (
         b.scope = 'gym'
         or (b.scope = 'class' and b.class_id = p_class_id)
         or (b.scope = 'coach' and p_coach_id is not null and b.coach_id = p_coach_id)
       )
  )
$$;

revoke all on function public._session_blocked(text, text, timestamptz, timestamptz)
  from public, anon, authenticated;

-- 4. El generador deja de crear sesiones bloqueadas.
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
      order by id
      limit 1;
    end if;

    v_duration := coalesce(v_slot.duration_min, v_slot.class_duration);

    -- Lo bloqueado no se programa: feriado, cierre, vacaciones o enfermedad.
    if public._session_blocked(
         v_slot.class_id,
         v_coach,
         v_start,
         v_start + make_interval(mins => v_duration)
       ) then
      continue;
    end if;

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

-- 5. El plan de generación también distingue lo bloqueado.
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
        when public._session_blocked(cc.class_id, cc.coach_id, cc.starts_at, cc.ends_at)
          then 'blocked'
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

-- 6. Previsualizar y aplicar comparten el total de "bloqueado".
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
      'blocked', (select count(*)::int from jsonb_array_elements(v_plan) i where i ->> 'status' = 'blocked'),
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

-- 7. Lo que toca un bloqueo, sin escribir nada.
create or replace function public._schedule_block_impact(
  p_scope text,
  p_class_id text,
  p_coach_id text,
  p_starts timestamptz,
  p_ends timestamptz,
  p_substitute text
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with afectadas as (
    select
      s.id,
      s.class_id,
      c.name_es as class_name,
      s.starts_at,
      s.room,
      s.coach_id,
      coalesce(
        nullif(to_jsonb(co) ->> 'full_name', ''),
        nullif(to_jsonb(co) ->> 'name', ''),
        s.coach_id
      ) as coach_name,
      (
        select count(*)::int from public.bookings b
         where b.session_id = s.id and b.status in ('confirmed', 'attended')
      ) as bookings
    from public.sessions s
    join public.classes c on c.id = s.class_id
    left join public.coaches co on co.id = s.coach_id
    where s.status = 'scheduled'
      and s.starts_at < p_ends
      and s.ends_at > p_starts
      and (
        p_scope = 'gym'
        or (p_scope = 'class' and s.class_id = p_class_id)
        or (p_scope = 'coach' and s.coach_id = p_coach_id)
      )
  )
  select jsonb_build_object(
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'class_id', a.class_id,
        'class_name', a.class_name,
        'starts_at', a.starts_at,
        'room', a.room,
        'coach_id', a.coach_id,
        'coach_name', a.coach_name,
        'bookings', a.bookings
      ) order by a.starts_at)
      from afectadas a
    ), '[]'::jsonb),
    'session_count', (select count(*)::int from afectadas),
    'booking_count', (select coalesce(sum(bookings), 0)::int from afectadas),
    'action', case when p_substitute is not null then 'reassign' else 'cancel' end
  )
$$;

revoke all on function public._schedule_block_impact(text, text, text, timestamptz, timestamptz, text)
  from public, anon, authenticated;

-- 8. Ver qué tocaría un bloqueo antes de cargarlo.
create or replace function public.admin_preview_schedule_block(
  p_scope text,
  p_class_id text,
  p_coach_id text,
  p_starts text,
  p_ends text,
  p_substitute text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_starts timestamptz;
  v_ends timestamptz;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_scope is null or p_scope not in ('gym', 'class', 'coach') then
    raise exception 'INVALID_SCOPE';
  end if;
  if p_scope = 'class' and not exists (
    select 1 from public.classes where id = p_class_id
  ) then
    raise exception 'INVALID_CLASS';
  end if;
  if p_scope = 'coach' and not exists (
    select 1 from public.coaches where id = p_coach_id
  ) then
    raise exception 'INVALID_COACH';
  end if;
  begin
    v_starts := (p_starts::timestamp) at time zone 'America/Managua';
    v_ends := (p_ends::timestamp) at time zone 'America/Managua';
  exception when others then
    raise exception 'INVALID_RANGE';
  end;
  if v_ends <= v_starts then raise exception 'INVALID_RANGE'; end if;
  if p_scope <> 'coach' and p_substitute is not null then
    raise exception 'INVALID_SUBSTITUTE';
  end if;
  if p_substitute is not null then
    if not exists (select 1 from public.coaches where id = p_substitute and is_active) then
      raise exception 'INVALID_SUBSTITUTE';
    end if;
    if p_substitute = p_coach_id then raise exception 'INVALID_SUBSTITUTE'; end if;
  end if;

  return public._schedule_block_impact(
    p_scope, p_class_id, p_coach_id, v_starts, v_ends, p_substitute
  ) || jsonb_build_object(
    'scope', p_scope,
    'class_id', p_class_id,
    'coach_id', p_coach_id,
    'starts_at', v_starts,
    'ends_at', v_ends,
    'substitute_coach_id', p_substitute
  );
end $$;

revoke all on function public.admin_preview_schedule_block(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_preview_schedule_block(text, text, text, text, text, text)
  to authenticated;

-- 9. Lista de bloqueos con lo que afectan hoy.
create or replace function public.admin_schedule_blocks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id,
      'scope', b.scope,
      'class_id', b.class_id,
      'class_name', c.name_es,
      'coach_id', b.coach_id,
      'coach_name', coalesce(
        nullif(to_jsonb(co) ->> 'full_name', ''),
        nullif(to_jsonb(co) ->> 'name', ''),
        b.coach_id
      ),
      'starts_at', b.starts_at,
      'ends_at', b.ends_at,
      'reason_kind', b.reason_kind,
      'reason', b.reason,
      'substitute_coach_id', b.substitute_coach_id,
      'substitute_coach_name', coalesce(
        nullif(to_jsonb(su) ->> 'full_name', ''),
        nullif(to_jsonb(su) ->> 'name', ''),
        b.substitute_coach_id
      ),
      'is_active', b.is_active,
      'cancelled_sessions', (
        select count(*)::int from public.sessions s
         where s.status = 'cancelled'
           and s.starts_at < b.ends_at
           and s.ends_at > b.starts_at
           and (
             b.scope = 'gym'
             or (b.scope = 'class' and s.class_id = b.class_id)
             or (b.scope = 'coach' and s.coach_id = b.coach_id)
           )
      )
    ) order by b.is_active desc, b.starts_at desc)
    from public.schedule_blocks b
    left join public.classes c on c.id = b.class_id
    left join public.coaches co on co.id = b.coach_id
    left join public.coaches su on su.id = b.substitute_coach_id
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_schedule_blocks()
  from public, anon, authenticated;
grant execute on function public.admin_schedule_blocks()
  to authenticated;

-- 10. Guardar un bloqueo y aplicarlo a las sesiones.
create or replace function public.admin_save_schedule_block(
  p_id uuid,
  p_scope text,
  p_class_id text,
  p_coach_id text,
  p_starts text,
  p_ends text,
  p_reason_kind text,
  p_reason text,
  p_substitute text default null,
  p_confirmed boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_starts timestamptz;
  v_ends timestamptz;
  v_reason text := trim(coalesce(p_reason, ''));
  v_id uuid := p_id;
  v_impact jsonb;
  v_blocking integer;
  v_cancelled integer := 0;
  v_reassigned integer := 0;
  v_booking record;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_scope is null or p_scope not in ('gym', 'class', 'coach') then
    raise exception 'INVALID_SCOPE';
  end if;
  if p_scope = 'class' and not exists (
    select 1 from public.classes where id = p_class_id
  ) then
    raise exception 'INVALID_CLASS';
  end if;
  if p_scope = 'coach' and not exists (
    select 1 from public.coaches where id = p_coach_id
  ) then
    raise exception 'INVALID_COACH';
  end if;
  begin
    v_starts := (p_starts::timestamp) at time zone 'America/Managua';
    v_ends := (p_ends::timestamp) at time zone 'America/Managua';
  exception when others then
    raise exception 'INVALID_RANGE';
  end;
  if v_ends <= v_starts then raise exception 'INVALID_RANGE'; end if;
  if p_reason_kind is null
     or p_reason_kind not in ('holiday', 'vacation', 'sick', 'maintenance', 'other') then
    raise exception 'INVALID_REASON';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 200 then
    raise exception 'INVALID_REASON';
  end if;
  if p_scope <> 'coach' and p_substitute is not null then
    raise exception 'INVALID_SUBSTITUTE';
  end if;
  if p_substitute is not null then
    if not exists (select 1 from public.coaches where id = p_substitute and is_active)
       or p_substitute = p_coach_id then
      raise exception 'INVALID_SUBSTITUTE';
    end if;
  end if;

  -- Dos administradores a la vez no pueden aplicar el mismo bloqueo dos veces.
  perform pg_advisory_xact_lock(hashtext('strong_gym_schedule_block'));

  v_impact := public._schedule_block_impact(
    p_scope, p_class_id, p_coach_id, v_starts, v_ends, p_substitute
  );
  v_blocking := coalesce((v_impact ->> 'booking_count')::int, 0);

  -- Con reservas encima, no se cancela nada sin confirmación explícita.
  if v_blocking > 0 and not coalesce(p_confirmed, false) then
    raise exception 'CONFIRM_REQUIRED';
  end if;

  if v_id is null then
    if exists (
      select 1 from public.schedule_blocks b
       where b.is_active
         and b.scope = p_scope
         and b.class_id is not distinct from p_class_id
         and b.coach_id is not distinct from p_coach_id
         and b.starts_at = v_starts
         and b.ends_at = v_ends
    ) then
      raise exception 'BLOCK_EXISTS';
    end if;

    insert into public.schedule_blocks
      (scope, class_id, coach_id, starts_at, ends_at, reason_kind, reason,
       substitute_coach_id, created_by)
    values
      (p_scope, p_class_id, p_coach_id, v_starts, v_ends, p_reason_kind, v_reason,
       p_substitute, auth.uid())
    returning id into v_id;
  else
    update public.schedule_blocks
       set scope = p_scope,
           class_id = p_class_id,
           coach_id = p_coach_id,
           starts_at = v_starts,
           ends_at = v_ends,
           reason_kind = p_reason_kind,
           reason = v_reason,
           substitute_coach_id = p_substitute,
           updated_at = now()
     where id = v_id
     returning id into v_id;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;

  -- Aplicar: reasignar si hay sustituto; si no, cancelar sin borrar.
  if p_substitute is not null then
    update public.sessions s
       set coach_id = p_substitute
     where s.status = 'scheduled'
       and s.starts_at < v_ends
       and s.ends_at > v_starts
       and s.coach_id = p_coach_id;
    get diagnostics v_reassigned = row_count;
  else
    for v_booking in
      select b.id
        from public.bookings b
        join public.sessions s on s.id = b.session_id
       where s.status = 'scheduled'
         and s.starts_at < v_ends
         and s.ends_at > v_starts
         and b.status in ('confirmed', 'attended')
         and (
           p_scope = 'gym'
           or (p_scope = 'class' and s.class_id = p_class_id)
           or (p_scope = 'coach' and s.coach_id = p_coach_id)
         )
    loop
      update public.bookings
         set status = 'cancelled',
             cancelled_at = now(),
             cancel_reason = v_reason,
             cancelled_by = auth.uid()
       where id = v_booking.id;
    end loop;

    update public.sessions s
       set status = 'cancelled'
     where s.status = 'scheduled'
       and s.starts_at < v_ends
       and s.ends_at > v_starts
       and (
         p_scope = 'gym'
         or (p_scope = 'class' and s.class_id = p_class_id)
         or (p_scope = 'coach' and s.coach_id = p_coach_id)
       );
    get diagnostics v_cancelled = row_count;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'impact', v_impact,
    'cancelled_sessions', v_cancelled,
    'reassigned_sessions', v_reassigned,
    'blocks', public.admin_schedule_blocks()
  );
end $$;

revoke all on function public.admin_save_schedule_block(uuid,text,text,text,text,text,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.admin_save_schedule_block(uuid,text,text,text,text,text,text,text,text,boolean)
  to authenticated;

-- 11. Levantar un bloqueo no resucita nada: solo deja de bloquear.
create or replace function public.admin_lift_schedule_block(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_id is null then raise exception 'INVALID_REQUEST'; end if;

  update public.schedule_blocks
     set is_active = false, updated_at = now()
   where id = p_id and is_active;
  if not found then raise exception 'NOT_FOUND'; end if;

  return jsonb_build_object('id', p_id, 'blocks', public.admin_schedule_blocks());
end $$;

revoke all on function public.admin_lift_schedule_block(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_lift_schedule_block(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
