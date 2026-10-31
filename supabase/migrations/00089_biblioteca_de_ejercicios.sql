-- 00089 · Biblioteca de ejercicios y rutina del cliente (EX-01)
--
-- Qué faltaba: el cliente tenía su progreso, su asistencia y su rutina asignada
-- por el entrenador, pero **no había ninguna biblioteca de ejercicios**: no se
-- podía consultar cómo se hace un press de banca, qué músculos trabaja ni
-- guardar una lista propia para la sesión.
--
-- Qué agrega esta migración:
--   · `public.exercises` — el catálogo, en **una sola tabla**: instrucciones y
--     tips como arreglos de texto, porque siempre se leen junto al ejercicio y
--     nunca se consultan sueltos. Nada de tablas hijas de pasos.
--   · `admin_import_exercises(jsonb)` — carga idempotente (upsert por `id`) del
--     JSON oficial. Se puede correr dos veces sin duplicar y se puede cortar a
--     la mitad sin dejar basura: cada fila es completa.
--   · `exercise_catalog(...)`, `exercise_facets()`, `exercise_detail(text)` —
--     lectura para cualquier persona con sesión iniciada (cliente, entrenador,
--     caja o administración), con búsqueda sin acentos, filtros por zona del
--     cuerpo, equipo, dificultad y categoría, y paginado.
--   · `client_exercise_routine` — «Mi rutina»: los ejercicios que el cliente
--     guarda con series, repeticiones y descanso. **No toca** `client_routines`
--     (la que asigna el entrenador): son dos cosas distintas y se ven distinto.
--
-- Origen de los datos: dataset público RepDB (repdb.co), uso comercial dentro
-- de la aplicación con atribución visible. El archivo **no** se copia al
-- repositorio: se importa a la base y se muestra con «Exercise data by RepDB
-- (repdb.co)», que la pantalla de la biblioteca exige ver.
--
-- Reglas de seguridad:
--   · El catálogo se lee sólo con sesión (`auth.uid()`); `anon` no tiene nada.
--   · Nadie escribe la tabla directamente: sin `insert/update/delete` para
--     `authenticated`, y la importación pasa por una función que exige
--     administración.
--   · «Mi rutina» es de cada cliente: se resuelve por `gym_clients.profile_id`,
--     no por un id que mande el navegador, y se escribe sólo por funciones.
--
-- Reversible: `drop table public.client_exercise_routine, public.exercises
-- cascade;` y las funciones. No se borra ni se migra ningún dato existente.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.gym_clients') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'EXERCISES_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1) El catálogo.
create table if not exists public.exercises (
  id                 text primary key,
  name_es            text not null,
  name_en            text not null,
  description_es     text,
  description_en     text,
  instructions_es    text[] not null default '{}',
  instructions_en    text[] not null default '{}',
  tips_es            text[] not null default '{}',
  tips_en            text[] not null default '{}',
  category           text not null default 'strength',
  force_type         text,
  mechanic           text,
  difficulty         text not null default 'beginner',
  body_part          text not null default 'full_body',
  equipment          text,
  primary_muscles    text[] not null default '{}',
  secondary_muscles  text[] not null default '{}',
  goals              text[] not null default '{}',
  tags               text[] not null default '{}',
  met                numeric(4,1),
  is_unilateral      boolean not null default false,
  is_bodyweight      boolean not null default true,
  image_start        text,
  image_peak         text,
  image_main         text,
  -- Texto listo para buscar: minúsculas y sin acentos, calculado al importar.
  -- Incluye las etiquetas en español que arma la web (`search_extra`), porque
  -- los identificadores del dataset son en inglés y el socio busca «glúteo».
  search_text        text not null default '',
  search_extra       text not null default '',
  source             text not null default 'repdb',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.exercises is
  'Catálogo de ejercicios (RepDB, con atribución visible). Una sola tabla: pasos y tips como arreglos.';
comment on column public.exercises.image_start is
  'Ruta relativa del dataset (images/flat/...). Se sirve por /api/exercises/image, nunca se copia al repo.';

create index if not exists exercises_body_part_idx on public.exercises (body_part);
create index if not exists exercises_category_idx on public.exercises (category);
create index if not exists exercises_difficulty_idx on public.exercises (difficulty);
create index if not exists exercises_equipment_idx on public.exercises (equipment);
create index if not exists exercises_primary_muscles_idx on public.exercises using gin (primary_muscles);
create index if not exists exercises_tags_idx on public.exercises using gin (tags);
create index if not exists exercises_search_idx on public.exercises (search_text);

alter table public.exercises enable row level security;
revoke all on public.exercises from anon, authenticated;
grant select on public.exercises to authenticated;

drop policy if exists exercises_read on public.exercises;
create policy exercises_read on public.exercises
  for select to authenticated using (auth.uid() is not null);

-- 2) «Mi rutina» del cliente: lo que guarda para su sesión.
create table if not exists public.client_exercise_routine (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.gym_clients(id) on delete cascade,
  exercise_id  text not null references public.exercises(id) on delete cascade,
  position     integer not null default 0,
  sets         integer check (sets is null or sets between 1 and 20),
  reps         text check (reps is null or length(trim(reps)) between 1 and 20),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 900),
  note         text check (note is null or length(note) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, exercise_id)
);
create index if not exists client_exercise_routine_client_idx
  on public.client_exercise_routine (client_id, position);

comment on table public.client_exercise_routine is
  'Ejercicios que el cliente guarda para sí. Distinta de client_routines (la que asigna el entrenador).';

alter table public.client_exercise_routine enable row level security;
revoke all on public.client_exercise_routine from anon, authenticated;

-- 3) Normalización para buscar: «prensa», «Prensa» y «PRÉNSA» son lo mismo.
create or replace function public.exercise_search_norm(p_text text)
returns text
language sql
immutable
as $$
  select lower(translate(
    coalesce(p_text, ''),
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  ));
$$;

-- 4) Importación idempotente.
create or replace function public.admin_import_exercises(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
  v_count integer;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_payload is null then raise exception 'INVALID_PAYLOAD'; end if;

  v_rows := coalesce(p_payload -> 'exercises', p_payload);
  if jsonb_typeof(v_rows) <> 'array' then raise exception 'INVALID_PAYLOAD'; end if;

  insert into public.exercises (
    id, name_es, name_en, description_es, description_en,
    instructions_es, instructions_en, tips_es, tips_en,
    category, force_type, mechanic, difficulty, body_part, equipment,
    primary_muscles, secondary_muscles, goals, tags, met,
    is_unilateral, is_bodyweight, image_start, image_peak, image_main,
    search_text, search_extra, source, updated_at
  )
  select
    r.id,
    coalesce(nullif(btrim(r.name_es), ''), r.id),
    coalesce(nullif(btrim(r.name_en), ''), r.id),
    r.description_es,
    r.description_en,
    coalesce(r.instructions_es, '{}'),
    coalesce(r.instructions_en, '{}'),
    coalesce(r.tips_es, '{}'),
    coalesce(r.tips_en, '{}'),
    coalesce(nullif(r.category, ''), 'strength'),
    nullif(r.force_type, ''),
    nullif(r.mechanic, ''),
    coalesce(nullif(r.difficulty, ''), 'beginner'),
    coalesce(nullif(r.body_part, ''), 'full_body'),
    nullif(r.equipment, ''),
    coalesce(r.primary_muscles, '{}'),
    coalesce(r.secondary_muscles, '{}'),
    coalesce(r.goals, '{}'),
    coalesce(r.tags, '{}'),
    r.met,
    coalesce(r.is_unilateral, false),
    coalesce(r.is_bodyweight, true),
    nullif(r.image_start, ''),
    nullif(r.image_peak, ''),
    nullif(r.image_main, ''),
    public.exercise_search_norm(
      concat_ws(' ',
        coalesce(nullif(btrim(r.name_es), ''), r.id),
        r.name_en,
        r.body_part,
        r.equipment,
        array_to_string(coalesce(r.primary_muscles, '{}'), ' '),
        array_to_string(coalesce(r.secondary_muscles, '{}'), ' '),
        r.search_extra
      )
    ),
    coalesce(r.search_extra, ''),
    coalesce(nullif(r.source, ''), 'repdb'),
    now()
  from jsonb_to_recordset(v_rows) as r(
    id text, name_es text, name_en text, description_es text, description_en text,
    instructions_es text[], instructions_en text[], tips_es text[], tips_en text[],
    category text, force_type text, mechanic text, difficulty text, body_part text,
    equipment text, primary_muscles text[], secondary_muscles text[], goals text[],
    tags text[], met numeric, is_unilateral boolean, is_bodyweight boolean,
    image_start text, image_peak text, image_main text, search_extra text, source text
  )
  where r.id is not null and btrim(r.id) <> ''
  on conflict (id) do update set
    name_es = excluded.name_es,
    name_en = excluded.name_en,
    description_es = excluded.description_es,
    description_en = excluded.description_en,
    instructions_es = excluded.instructions_es,
    instructions_en = excluded.instructions_en,
    tips_es = excluded.tips_es,
    tips_en = excluded.tips_en,
    category = excluded.category,
    force_type = excluded.force_type,
    mechanic = excluded.mechanic,
    difficulty = excluded.difficulty,
    body_part = excluded.body_part,
    equipment = excluded.equipment,
    primary_muscles = excluded.primary_muscles,
    secondary_muscles = excluded.secondary_muscles,
    goals = excluded.goals,
    tags = excluded.tags,
    met = excluded.met,
    is_unilateral = excluded.is_unilateral,
    is_bodyweight = excluded.is_bodyweight,
    image_start = excluded.image_start,
    image_peak = excluded.image_peak,
    image_main = excluded.image_main,
    search_text = excluded.search_text,
    search_extra = excluded.search_extra,
    source = excluded.source,
    updated_at = now();

  get diagnostics v_count = row_count;
  return jsonb_build_object(
    'imported', v_count,
    'total', (select count(*) from public.exercises)
  );
end $$;

revoke all on function public.admin_import_exercises(jsonb) from public, anon;
grant execute on function public.admin_import_exercises(jsonb) to authenticated;

-- 5) Lectura: catálogo con filtros y paginado.
-- `p_equipment` es una lista porque «máquinas» no es un valor del dataset: la
-- pantalla manda los slugs que agrupa (prensa, hack squat, polea…).
create or replace function public.exercise_catalog(
  p_search text default '',
  p_body_part text default '',
  p_equipment text[] default null,
  p_difficulty text default '',
  p_category text default '',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := public.exercise_search_norm(btrim(coalesce(p_search, '')));
  v_total integer;
  v_rows jsonb;
begin
  -- Cualquier persona con sesión ve la biblioteca; sin sesión, nada.
  if auth.uid() is null then raise exception 'AUTH'; end if;

  with filtered as (
    select e.*
    from public.exercises e
    where (v_search = '' or e.search_text like '%' || v_search || '%')
      and (coalesce(p_body_part, '') = '' or e.body_part = p_body_part)
      and (p_equipment is null or e.equipment = any (p_equipment))
      and (coalesce(p_difficulty, '') = '' or e.difficulty = p_difficulty)
      and (coalesce(p_category, '') = '' or e.category = p_category)
  ), page as (
    select * from filtered
    order by name_es, id
    limit v_limit offset v_offset
  )
  select
    (select count(*) from filtered)::integer,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'nameEs', page.name_es,
        'nameEn', page.name_en,
        'category', page.category,
        'difficulty', page.difficulty,
        'bodyPart', page.body_part,
        'equipment', page.equipment,
        'primaryMuscles', page.primary_muscles,
        'isBodyweight', page.is_bodyweight,
        'met', page.met,
        'imageStart', page.image_start,
        'imagePeak', page.image_peak,
        'imageMain', page.image_main
      ) order by page.name_es, page.id)
      from page
    ), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows
  );
end $$;

revoke all on function public.exercise_catalog(text, text, text[], text, text, integer, integer)
  from public, anon;
grant execute on function public.exercise_catalog(text, text, text[], text, text, integer, integer)
  to authenticated;

-- 6) Facetas con conteos reales: nunca una lista fija en el código.
create or replace function public.exercise_facets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.exercises),
    'bodyParts', coalesce((
      select jsonb_object_agg(body_part, n)
      from (select body_part, count(*)::integer as n from public.exercises group by body_part) s
    ), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equipment, n)
      from (
        select equipment, count(*)::integer as n
        from public.exercises where equipment is not null group by equipment
      ) s
    ), '{}'::jsonb),
    'difficulty', coalesce((
      select jsonb_object_agg(difficulty, n)
      from (select difficulty, count(*)::integer as n from public.exercises group by difficulty) s
    ), '{}'::jsonb),
    'category', coalesce((
      select jsonb_object_agg(category, n)
      from (select category, count(*)::integer as n from public.exercises group by category) s
    ), '{}'::jsonb)
  );
end $$;

revoke all on function public.exercise_facets() from public, anon;
grant execute on function public.exercise_facets() to authenticated;

-- 7) Detalle de un ejercicio, con lo que el cliente ya guardó.
create or replace function public.exercise_detail(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_e public.exercises;
  v_client uuid;
  v_saved public.client_exercise_routine;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select * into v_e from public.exercises where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  select id into v_client from public.gym_clients where profile_id = auth.uid();
  if v_client is not null then
    select * into v_saved
    from public.client_exercise_routine
    where client_id = v_client and exercise_id = p_id;
  end if;

  return jsonb_build_object(
    'id', v_e.id,
    'nameEs', v_e.name_es,
    'nameEn', v_e.name_en,
    'descriptionEs', v_e.description_es,
    'descriptionEn', v_e.description_en,
    'instructionsEs', v_e.instructions_es,
    'instructionsEn', v_e.instructions_en,
    'tipsEs', v_e.tips_es,
    'tipsEn', v_e.tips_en,
    'category', v_e.category,
    'forceType', v_e.force_type,
    'mechanic', v_e.mechanic,
    'difficulty', v_e.difficulty,
    'bodyPart', v_e.body_part,
    'equipment', v_e.equipment,
    'primaryMuscles', v_e.primary_muscles,
    'secondaryMuscles', v_e.secondary_muscles,
    'goals', v_e.goals,
    'tags', v_e.tags,
    'met', v_e.met,
    'isUnilateral', v_e.is_unilateral,
    'isBodyweight', v_e.is_bodyweight,
    'imageStart', v_e.image_start,
    'imagePeak', v_e.image_peak,
    'imageMain', v_e.image_main,
    'saved', case when v_saved.id is null then null else jsonb_build_object(
      'sets', v_saved.sets,
      'reps', v_saved.reps,
      'restSeconds', v_saved.rest_seconds,
      'note', v_saved.note
    ) end
  );
end $$;

revoke all on function public.exercise_detail(text) from public, anon;
grant execute on function public.exercise_detail(text) to authenticated;

-- 8) «Mi rutina»: guardar, listar y quitar. Siempre sobre el cliente dueño de
-- la sesión; el navegador nunca manda un `client_id`.
create or replace function public.exercise_routine_client()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.gym_clients where profile_id = auth.uid();
$$;
revoke all on function public.exercise_routine_client() from public, anon, authenticated;

create or replace function public.client_routine_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_client uuid := public.exercise_routine_client();
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if v_client is null then raise exception 'NO_CLIENT'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'exerciseId', r.exercise_id,
      'position', r.position,
      'sets', r.sets,
      'reps', r.reps,
      'restSeconds', r.rest_seconds,
      'note', r.note,
      'nameEs', e.name_es,
      'bodyPart', e.body_part,
      'equipment', e.equipment,
      'difficulty', e.difficulty,
      'imageStart', e.image_start,
      'imagePeak', e.image_peak,
      'imageMain', e.image_main
    ) order by r.position, r.created_at)
    from public.client_exercise_routine r
    join public.exercises e on e.id = r.exercise_id
    where r.client_id = v_client
  ), '[]'::jsonb);
end $$;

create or replace function public.client_routine_save(
  p_exercise text,
  p_sets integer default null,
  p_reps text default null,
  p_rest integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client uuid := public.exercise_routine_client();
  v_next integer;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if v_client is null then raise exception 'NO_CLIENT'; end if;
  if not exists (select 1 from public.exercises where id = p_exercise) then
    raise exception 'NOT_FOUND';
  end if;

  select coalesce(max(position), 0) + 1 into v_next
  from public.client_exercise_routine where client_id = v_client;

  insert into public.client_exercise_routine (
    client_id, exercise_id, position, sets, reps, rest_seconds, note
  ) values (
    v_client, p_exercise, v_next,
    case when p_sets is null then null else least(greatest(p_sets, 1), 20) end,
    nullif(btrim(coalesce(p_reps, '')), ''),
    case when p_rest is null then null
         else least(greatest(p_rest, 0), 900) end,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  on conflict (client_id, exercise_id) do update set
    sets = coalesce(excluded.sets, public.client_exercise_routine.sets),
    reps = coalesce(excluded.reps, public.client_exercise_routine.reps),
    rest_seconds = coalesce(excluded.rest_seconds, public.client_exercise_routine.rest_seconds),
    note = coalesce(excluded.note, public.client_exercise_routine.note),
    updated_at = now();

  return jsonb_build_object('exerciseId', p_exercise, 'saved', true);
end $$;

create or replace function public.client_routine_remove(p_exercise text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client uuid := public.exercise_routine_client();
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if v_client is null then raise exception 'NO_CLIENT'; end if;
  delete from public.client_exercise_routine
  where client_id = v_client and exercise_id = p_exercise;
  return jsonb_build_object('exerciseId', p_exercise, 'saved', false);
end $$;

revoke all on function public.client_routine_list() from public, anon;
revoke all on function public.client_routine_save(text, integer, text, integer, text) from public, anon;
revoke all on function public.client_routine_remove(text) from public, anon;
grant execute on function public.client_routine_list() to authenticated;
grant execute on function public.client_routine_save(text, integer, text, integer, text) to authenticated;
grant execute on function public.client_routine_remove(text) to authenticated;

notify pgrst, 'reload schema';

commit;
