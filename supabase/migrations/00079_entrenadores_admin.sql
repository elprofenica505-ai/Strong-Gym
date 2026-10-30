-- 00079 · Entrenadores: catálogo y asignación con detección de choques
--        (OP-05, sexta etapa)
--
-- Problema: `public.coaches` existía, pero sin manera de administrarla desde el
-- panel. Para poner un entrenador había que tocar la base a mano. Además la
-- lista `specialties` estaba vacía en los tres entrenadores, así que el
-- generador de sesiones no podía asignar a nadie y las 79 clases quedaron sin
-- entrenador; y el plan de generación enseñaba el entrenador del horario, no el
-- que el generador realmente iba a poner.
--
-- Decisión de esta etapa:
--   * `admin_save_coach()` crea y edita un entrenador: nombre, especialidad en
--     texto y **disciplinas que dicta** (las de `classes`, elegidas de una
--     lista, sin adivinar texto libre). Eso es lo que alimenta `specialties`.
--   * `admin_set_coach_active()` es el único interruptor de alta/baja. No se
--     borra ningún entrenador: se apaga, y sus clases quedan como están.
--   * Toda alta o edición queda en `coach_audit`, con quién, cuándo y los
--     NOMBRES de los campos cambiados. Nunca los valores.
--   * `admin_slot_coach_plan()` y `admin_apply_slot_coach()` pasan el
--     entrenador de un horario fijo a las clases que ya están en el calendario,
--     mirando primero cuántas se asignan y cuáles chocan. Es una acción
--     explícita: guardar un horario sigue sin tocar las clases existentes.
--   * `_schedule_plan()` y `admin_apply_schedule()` resuelven el entrenador igual
--     que el generador (el del horario y, si no hay, el primero activo que dicte
--     esa disciplina), así la previsualización dice la verdad y también detecta
--     los choques del entrenador que se va a asignar.
--
-- La tabla `coaches` no tiene las mismas columnas en todas las bases: la
-- productiva usa `full_name` y no tiene `slug`, `name` ni `sort_order`; las
-- migraciones del repo sí. Las altas y ediciones se arman según lo que exista,
-- igual que se hizo con el nombre en 00073.
--
-- Reversión segura: eliminar `admin_save_coach`, `admin_set_coach_active`,
-- `admin_coaches_catalog`, `admin_slot_coach_plan`, `admin_apply_slot_coach` y
-- `coach_audit`, y volver a las versiones de `_schedule_plan` (00075) y
-- `admin_apply_schedule` (00074). Los entrenadores creados siguen existiendo y
-- ninguna clase ni reserva se toca.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.coaches') is null
     or to_regclass('public.classes') is null
     or to_regclass('public.class_schedule_slots') is null
     or to_regclass('public.sessions') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'COACH_ADMIN_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. Bitácora de entrenadores: mismos criterios que `class_audit` (00077).
create table if not exists public.coach_audit (
  id             bigint generated always as identity primary key,
  coach_id       text not null references public.coaches (id) on delete cascade,
  action         text not null check (action in ('alta', 'edicion', 'baja', 'reactivacion')),
  changed_fields text[] not null default '{}',
  changed_by     uuid references public.profiles (id) on delete set null,
  changed_at     timestamptz not null default now()
);

create index if not exists coach_audit_coach_idx
  on public.coach_audit (coach_id, changed_at desc);

alter table public.coach_audit enable row level security;
revoke all on public.coach_audit from public, anon, authenticated;
grant select on public.coach_audit to authenticated;
drop policy if exists coach_audit_admin_read on public.coach_audit;
create policy coach_audit_admin_read on public.coach_audit
  for select to authenticated using (public.is_admin());

-- 2. El catálogo: entrenadores, disciplinas para elegir y bitácora.
create or replace function public.admin_coaches_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  return jsonb_build_object(
    'coaches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', co.id,
        'full_name', coalesce(
          nullif(to_jsonb(co) ->> 'full_name', ''),
          nullif(to_jsonb(co) ->> 'name', ''),
          co.id
        ),
        'specialty', coalesce(to_jsonb(co) ->> 'specialty', ''),
        'specialties', coalesce(to_jsonb(co) -> 'specialties', '[]'::jsonb),
        'specialty_labels', coalesce((
          select jsonb_agg(c.name_es order by c.sort_order, c.name_es)
          from public.classes c
          where c.slug in (
            select jsonb_array_elements_text(
              coalesce(to_jsonb(co) -> 'specialties', '[]'::jsonb)
            )
          )
        ), '[]'::jsonb),
        'is_active', co.is_active,
        'slots_active', (
          select count(*)::int from public.class_schedule_slots s
           where s.coach_id = co.id and s.is_active
        ),
        'sessions_upcoming', (
          select count(*)::int from public.sessions se
           where se.coach_id = co.id and se.status = 'scheduled' and se.starts_at > now()
        ),
        'sessions_unassigned', (
          select count(*)::int from public.sessions se
           where se.class_id = any (
             select s.class_id from public.class_schedule_slots s
              where s.coach_id = co.id and s.is_active
           )
             and se.coach_id is null
             and se.status = 'scheduled'
             and se.starts_at > now()
        )
      ) order by co.is_active desc,
        coalesce(
          nullif(to_jsonb(co) ->> 'full_name', ''),
          nullif(to_jsonb(co) ->> 'name', ''),
          co.id
        ))
      from public.coaches co
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'name_es', c.name_es,
        'is_active', c.is_active
      ) order by c.sort_order, c.name_es)
      from public.classes c
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'coach_id', a.coach_id,
        'coach_name', (
          select coalesce(
            nullif(to_jsonb(co) ->> 'full_name', ''),
            nullif(to_jsonb(co) ->> 'name', ''),
            a.coach_id
          ) from public.coaches co where co.id = a.coach_id
        ),
        'action', a.action,
        'changed_fields', a.changed_fields,
        'changed_by_name', (
          select coalesce(pr.full_name, '')
          from public.profiles pr where pr.id = a.changed_by
        ),
        'changed_at', a.changed_at
      ) order by a.changed_at desc, a.id desc)
      from (
        select * from public.coach_audit order by changed_at desc, id desc limit 20
      ) a
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_coaches_catalog()
  from public, anon, authenticated;
grant execute on function public.admin_coaches_catalog()
  to authenticated;

-- 3. Crear o editar un entrenador.
--
-- `coaches` no tiene las mismas columnas en todas las bases: las migraciones del
-- repo traen `slug` y `name`; la productiva trae `full_name` y `specialty`. Las
-- altas y ediciones se arman según lo que exista, sin depender de una forma.
create or replace function public.admin_save_coach(
  p_id text,
  p_full_name text,
  p_specialty text default null,
  p_specialties text[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text := nullif(trim(coalesce(p_id, '')), '');
  v_name text := trim(coalesce(p_full_name, ''));
  v_specialty text := nullif(trim(coalesce(p_specialty, '')), '');
  v_specialties text[] := coalesce(p_specialties, '{}');
  v_base text;
  v_new_id text;
  v_suffix integer := 1;
  v_fields text[] := '{}';
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_has_slug boolean;
  v_has_name boolean;
  v_has_full_name boolean;
  v_has_specialty boolean;
  v_cols text[] := array['id'];
  v_vals text[] := array['$1'];
  v_set text[] := array[]::text[];
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  if length(v_name) not between 3 and 80 then
    raise exception 'INVALID_NAME';
  end if;
  if v_specialty is not null and length(v_specialty) > 80 then
    raise exception 'INVALID_SPECIALTY';
  end if;
  if coalesce(array_length(v_specialties, 1), 0) > 12 then
    raise exception 'TOO_MANY_SPECIALTIES';
  end if;
  if exists (
    select 1 from unnest(v_specialties) as t(x)
     where x is null or not exists (select 1 from public.classes c where c.slug = x)
  ) then
    raise exception 'INVALID_CLASS_SLUG';
  end if;

  perform pg_advisory_xact_lock(hashtext('strong_gym_admin_coaches'));

  select
    bool_or(column_name = 'slug'),
    bool_or(column_name = 'name'),
    bool_or(column_name = 'full_name'),
    bool_or(column_name = 'specialty')
  into v_has_slug, v_has_name, v_has_full_name, v_has_specialty
  from information_schema.columns
  where table_schema = 'public' and table_name = 'coaches';

  if v_id is null then
    if exists (
      select 1 from public.coaches co
       where coalesce(
         nullif(to_jsonb(co) ->> 'full_name', ''),
         nullif(to_jsonb(co) ->> 'name', '')
       ) is not distinct from v_name
    ) then
      raise exception 'COACH_EXISTS';
    end if;

    v_base := 'coa_' || btrim(
      regexp_replace(
        lower(translate(v_name, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')),
        '[^a-z0-9]+', '_', 'g'
      ),
      '_'
    );
    if length(v_base) < 5 then v_base := 'coa_entrenador'; end if;
    v_base := left(v_base, 40);
    v_new_id := v_base;
    while exists (select 1 from public.coaches co where co.id = v_new_id) loop
      v_suffix := v_suffix + 1;
      v_new_id := v_base || '_' || v_suffix;
    end loop;

    if v_has_slug then
      v_cols := array_append(v_cols, 'slug');
      v_vals := array_append(v_vals, '$1');
    end if;
    if v_has_name then
      v_cols := array_append(v_cols, 'name');
      v_vals := array_append(v_vals, '$2');
    end if;
    if v_has_full_name then
      v_cols := array_append(v_cols, 'full_name');
      v_vals := array_append(v_vals, '$2');
    end if;
    if v_has_specialty then
      v_cols := array_append(v_cols, 'specialty');
      v_vals := array_append(v_vals, '$3');
    end if;
    v_cols := array_append(v_cols, 'specialties');
    v_vals := array_append(v_vals, '$4');
    v_cols := array_append(v_cols, 'is_active');
    v_vals := array_append(v_vals, '$5');

    execute format(
      'insert into public.coaches (%s) values (%s)',
      array_to_string(v_cols, ', '),
      array_to_string(v_vals, ', ')
    ) using v_new_id, v_name, v_specialty, v_specialties, true;

    insert into public.coach_audit (coach_id, action, changed_fields, changed_by)
    values (v_new_id, 'alta', array['full_name', 'specialty', 'specialties'], auth.uid());

    v_id := v_new_id;
    v_action := 'alta';
  else
    select to_jsonb(co) into v_old
      from public.coaches co where co.id = v_id for update;
    if v_old is null then raise exception 'NOT_FOUND'; end if;

    if exists (
      select 1 from public.coaches co
       where co.id <> v_id
         and coalesce(
           nullif(to_jsonb(co) ->> 'full_name', ''),
           nullif(to_jsonb(co) ->> 'name', '')
         ) is not distinct from v_name
    ) then
      raise exception 'COACH_EXISTS';
    end if;

    if v_has_name then v_set := array_append(v_set, 'name = $2'); end if;
    if v_has_full_name then v_set := array_append(v_set, 'full_name = $2'); end if;
    if v_has_specialty then v_set := array_append(v_set, 'specialty = $3'); end if;
    v_set := array_append(v_set, 'specialties = $4');

    execute format(
      'update public.coaches set %s where id = $1',
      array_to_string(v_set, ', ')
    ) using v_id, v_name, v_specialty, v_specialties;

    if coalesce(v_old ->> 'full_name', v_old ->> 'name', '') <> v_name then
      v_fields := array_append(v_fields, 'full_name');
    end if;
    if coalesce(v_old ->> 'specialty', '') is distinct from coalesce(v_specialty, '') then
      v_fields := array_append(v_fields, 'specialty');
    end if;
    if coalesce(v_old -> 'specialties', '[]'::jsonb) is distinct from to_jsonb(v_specialties) then
      v_fields := array_append(v_fields, 'specialties');
    end if;

    if cardinality(v_fields) = 0 then
      v_action := 'sin_cambios';
    else
      insert into public.coach_audit (coach_id, action, changed_fields, changed_by)
      values (v_id, 'edicion', v_fields, auth.uid());
      v_action := 'edicion';
    end if;
  end if;

  select to_jsonb(co) into v_new from public.coaches co where co.id = v_id;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'changed_fields', v_fields,
    'coach', jsonb_build_object(
      'id', v_id,
      'full_name', coalesce(
        nullif(v_new ->> 'full_name', ''),
        nullif(v_new ->> 'name', ''),
        v_id
      ),
      'specialty', coalesce(v_new ->> 'specialty', ''),
      'specialties', coalesce(v_new -> 'specialties', '[]'::jsonb),
      'is_active', coalesce((v_new ->> 'is_active')::boolean, true)
    )
  );
end $$;

revoke all on function public.admin_save_coach(text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.admin_save_coach(text, text, text, text[])
  to authenticated;

-- 4. El interruptor de alta/baja del entrenador. No borra nada.
create or replace function public.admin_set_coach_active(
  p_coach_id text,
  p_is_active boolean,
  p_expected_is_active boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous boolean;
  v_upcoming integer := 0;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  if p_coach_id is null
     or p_is_active is null
     or char_length(p_coach_id) < 1
     or char_length(p_coach_id) > 160
     or p_coach_id ~ '\s' then
    raise exception 'INVALID_ACTIVE_STATE';
  end if;

  select co.is_active into v_previous
    from public.coaches co where co.id = p_coach_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if v_previous = p_is_active then
    return jsonb_build_object(
      'id', p_coach_id,
      'is_active', v_previous,
      'previous_is_active', v_previous,
      'changed', false,
      'sessions_upcoming', (
        select count(*)::int from public.sessions
         where coach_id = p_coach_id and status = 'scheduled' and starts_at > now()
      )
    );
  end if;

  if p_expected_is_active is not null and v_previous is distinct from p_expected_is_active then
    raise exception 'STALE_ACTIVE_STATE';
  end if;

  update public.coaches set is_active = p_is_active where id = p_coach_id;

  select count(*)::int into v_upcoming
    from public.sessions
   where coach_id = p_coach_id and status = 'scheduled' and starts_at > now();

  insert into public.coach_audit (coach_id, action, changed_by)
  values (p_coach_id, case when p_is_active then 'reactivacion' else 'baja' end, auth.uid());

  return jsonb_build_object(
    'id', p_coach_id,
    'is_active', p_is_active,
    'previous_is_active', v_previous,
    'changed', true,
    'sessions_upcoming', v_upcoming
  );
end $$;

revoke all on function public.admin_set_coach_active(text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_coach_active(text, boolean, boolean)
  to authenticated;

-- 5. Qué pasaría si se pasa el entrenador del horario a las clases ya creadas.
--    No escribe nada.
create or replace function public._slot_coach_plan(p_slot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot record;
  v_items jsonb;
begin
  select s.id, s.class_id, s.day_of_week, s.start_time, s.coach_id, s.is_active
    into v_slot
    from public.class_schedule_slots s
   where s.id = p_slot_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id', x.id,
    'starts_at', x.starts_at,
    'capacity', x.capacity,
    'booked', x.booked,
    'current_coach_id', x.coach_id,
    'current_coach_name', x.current_coach_name,
    'status', case
      when v_slot.coach_id is null then 'no_coach'
      when x.coach_id = v_slot.coach_id then 'same'
      when exists (
        select 1 from public.sessions o
         where o.status = 'scheduled'
           and o.coach_id = v_slot.coach_id
           and o.id <> x.id
           and o.starts_at < x.ends_at
           and o.ends_at > x.starts_at
      ) then 'conflict'
      else 'assign'
    end
  ) order by x.starts_at), '[]'::jsonb)
  into v_items
  from (
    select se.id, se.starts_at, se.ends_at, se.capacity, se.coach_id,
           (
             select coalesce(
               nullif(to_jsonb(co) ->> 'full_name', ''),
               nullif(to_jsonb(co) ->> 'name', ''),
               se.coach_id
             )
             from public.coaches co where co.id = se.coach_id
           ) as current_coach_name,
           (
             select count(*)::int from public.bookings b
              where b.session_id = se.id and b.status in ('confirmed', 'attended')
           ) as booked
      from public.sessions se
     where se.class_id = v_slot.class_id
       and se.status = 'scheduled'
       and se.starts_at > now()
       and ((extract(dow from (se.starts_at at time zone 'America/Managua'))::int + 6) % 7)
           = v_slot.day_of_week
       and (se.starts_at at time zone 'America/Managua')::time = v_slot.start_time
  ) x;

  return jsonb_build_object(
    'slot_id', p_slot_id,
    'class_id', v_slot.class_id,
    'coach_id', v_slot.coach_id,
    'coach_name', (
      select coalesce(
        nullif(to_jsonb(co) ->> 'full_name', ''),
        nullif(to_jsonb(co) ->> 'name', ''),
        v_slot.coach_id
      ) from public.coaches co where co.id = v_slot.coach_id
    ),
    'slot_active', v_slot.is_active,
    'totals', jsonb_build_object(
      'sessions', (select count(*)::int from jsonb_array_elements(v_items) i),
      'assign', (select count(*)::int from jsonb_array_elements(v_items) i
                  where i ->> 'status' = 'assign'),
      'same', (select count(*)::int from jsonb_array_elements(v_items) i
                where i ->> 'status' = 'same'),
      'conflict', (select count(*)::int from jsonb_array_elements(v_items) i
                    where i ->> 'status' = 'conflict'),
      'bookings', (select coalesce(sum((i ->> 'booked')::int), 0)::int
                     from jsonb_array_elements(v_items) i)
    ),
    'items', v_items
  );
end $$;

revoke all on function public._slot_coach_plan(uuid)
  from public, anon, authenticated;

create or replace function public.admin_slot_coach_plan(p_slot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  return public._slot_coach_plan(p_slot_id);
end $$;

revoke all on function public.admin_slot_coach_plan(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_slot_coach_plan(uuid)
  to authenticated;

-- 6. Aplicar: asigna el entrenador del horario a las clases ya creadas que no
--    choquen. No toca horarios, no borra clases ni reservas.
create or replace function public.admin_apply_slot_coach(p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan jsonb;
  v_coach text;
  v_assigned integer := 0;
  v_slot record;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  select s.id, s.class_id, s.day_of_week, s.start_time, s.coach_id
    into v_slot
    from public.class_schedule_slots s
   where s.id = p_slot_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_slot.coach_id is null then raise exception 'NO_COACH'; end if;

  perform pg_advisory_xact_lock(hashtext('strong_gym_admin_sessions'));

  v_plan := public._slot_coach_plan(p_slot_id);

  update public.sessions se
     set coach_id = v_slot.coach_id,
         updated_by = auth.uid(),
         updated_at = now()
   where se.id in (
     select (i ->> 'session_id')::text
       from jsonb_array_elements(v_plan -> 'items') i
      where i ->> 'status' = 'assign'
   )
     and se.status = 'scheduled';

  get diagnostics v_assigned = row_count;
  v_coach := v_slot.coach_id;

  return jsonb_build_object(
    'ok', true,
    'coach_id', v_coach,
    'assigned', v_assigned,
    'skipped_same', coalesce((v_plan -> 'totals' ->> 'same')::int, 0),
    'skipped_conflict', coalesce((v_plan -> 'totals' ->> 'conflict')::int, 0),
    'remaining', (select count(*)::int from public.sessions
                   where class_id = v_slot.class_id
                     and status = 'scheduled'
                     and starts_at > now()
                     and coach_id is null),
    'plan', public._slot_coach_plan(p_slot_id)
  );
end $$;

revoke all on function public.admin_apply_slot_coach(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_apply_slot_coach(uuid)
  to authenticated;

-- 7. El plan de generación resuelve el entrenador igual que el generador, así
--    la previsualización muestra a quién se le va a asignar la clase y detecta
--    los choques de ese entrenador.
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
      c.slug as class_slug,
      c.name_es as class_name,
      c.is_active as class_active,
      c.sort_order,
      s.room,
      resolved.coach_id,
      resolved.coach_auto,
      coalesce(
        nullif(to_jsonb(co) ->> 'full_name', ''),
        nullif(to_jsonb(co) ->> 'name', ''),
        resolved.coach_id
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
    cross join lateral (
      -- El entrenador del horario manda; si no hay, se usa el primero activo
      -- que dicte esa disciplina (`specialties` guarda slugs de `classes`).
      select
        v.coach_id,
        (s.coach_id is null and v.coach_id is not null) as coach_auto
      from (
        select coalesce(s.coach_id, (
          select co2.id from public.coaches co2
           where co2.is_active
             and c.slug in (
               select jsonb_array_elements_text(
                 coalesce(to_jsonb(co2) -> 'specialties', '[]'::jsonb)
               )
             )
           order by co2.id
           limit 1
        )) as coach_id
      ) v
    ) resolved
    left join public.coaches co on co.id = resolved.coach_id
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
      'coach_auto', x.coach_auto,
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

-- 8. Aplicar el plan asigna el mismo entrenador que mostró la previsualización.
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

  perform pg_advisory_xact_lock(hashtext('strong_gym_schedule_generate'));

  v_plan := public._schedule_plan(v_from, p_weeks);

  for v_item in
    select value from jsonb_array_elements(v_plan)
     where value ->> 'status' = 'create'
     order by value ->> 'date', value ->> 'start_time'
  loop
    insert into public.sessions (class_id, coach_id, starts_at, ends_at, capacity, room)
    select
      s.class_id,
      nullif(v_item ->> 'coach_id', '')::text,
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
