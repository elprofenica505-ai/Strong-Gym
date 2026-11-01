-- 00092 · La biblioteca muestra lo que es de gimnasio (EX-01)
--
-- Qué pedía el dueño: «quiero la barra y el banco, press de banca, sentadillas
-- con barra, todo lo que tenga que ver con cosas del gym; lo que no quiero son
-- ejercicios de peso libre que se puedan hacer en casa».
--
-- Qué hace esta migración:
--   · Agrega `exercises.visible`. No se borra ni se oculta con filtros de
--     pantalla: el ejercicio sigue en la base y se puede volver a mostrar.
--   · `exercise_is_gym(equipo, categoría)` decide, en un solo lugar, qué cuenta
--     como equipo de sala: máquinas, poleas, barra, mancuerna, pesa rusa, banco,
--     discos, Smith, jalón y las máquinas de cardio. Quedan fuera el peso
--     corporal y los accesorios de casa (bandas, balones, cajón, cuerdas), y
--     todo lo que sea estiramiento, aunque use un accesorio.
--   · `exercise_catalog` y `exercise_facets` cuentan y listan **sólo lo
--     visible**, así los chips y los números dicen la verdad de lo que se ve.
--   · Dos funciones de administración: recalcular todo con el criterio anterior
--     o mostrar/ocultar un ejercicio puntual. Ninguna borra datos.
--
-- Reversible: `alter table public.exercises drop column visible;` y volver a
-- crear `exercise_catalog`/`exercise_facets` como en la 00091. Aditiva.

begin;
set local lock_timeout = '5s';

-- 1) La marca de visibilidad. Todo entra visible; el criterio se aplica abajo.
alter table public.exercises
  add column if not exists visible boolean not null default true;

comment on column public.exercises.visible is
  'Lo que se muestra en la biblioteca del socio. Oculto no es borrado: se puede volver a mostrar.';

create index if not exists exercises_visible_idx
  on public.exercises (visible, body_part);

-- 2) Un solo lugar decide qué es equipo de gimnasio.
create or replace function public.exercise_is_gym(p_equipment text, p_category text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_category, '') <> 'stretching'
     and coalesce(p_equipment, '') = any (array[
       -- máquinas de sala
       'machine', 'ab_crunch_machine', 'assisted_pullup_machine',
       'back_extension_machine', 'bicep_curl_machine', 'chest_fly_machine',
       'chest_press_machine', 'dip_machine', 'donkey_calf_raise_machine',
       'glute_ham_developer', 'hack_squat', 'hip_abduction_machine',
       'hip_adduction_machine', 'hip_thrust_machine', 'lat_pulldown_machine',
       'leg_curl', 'leg_extension', 'leg_press', 'pec_deck',
       'plate_loaded_dip_machine', 'plate_loaded_lateral_raise_machine',
       'preacher_curl_machine', 'reverse_fly_machine', 'seated_calf_raise_machine',
       'seated_row_machine', 'shoulder_press_machine', 'shrug_machine',
       'smith_machine', 'standing_calf_raise_machine', 'tricep_extension_machine',
       -- poleas
       'cable',
       -- peso libre de sala
       'barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'trap_bar', 'plates',
       'flat_bench',
       -- aparatos de peso corporal que sólo existen en un gimnasio
       'pull_up_bar', 'dip_station',
       -- cardio de máquina
       'treadmill', 'stationary_bike', 'elliptical', 'rower', 'stair_climber',
       'air_bike', 'ski_erg'
     ]);
$$;

comment on function public.exercise_is_gym(text, text) is
  'Verdadero si el ejercicio usa equipo de sala. Fuera: peso corporal, bandas, balones y estiramientos.';

-- 3) Se aplica a todo el catálogo. Nada se borra: sólo se deja de listar.
update public.exercises
   set visible = public.exercise_is_gym(equipment, category)
 where visible is distinct from public.exercise_is_gym(equipment, category);

-- 4) Catálogo: sólo lo visible.
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
  if auth.uid() is null then raise exception 'AUTH'; end if;

  with filtered as (
    select e.*
    from public.exercises e
    where e.visible
      and (v_search = '' or e.search_text like '%' || v_search || '%')
      and (coalesce(p_body_part, '') = '' or e.body_part = p_body_part)
      -- Un arreglo vacío significa «sin equipo» (peso corporal), no «sin filtro».
      and (p_equipment is null
           or (cardinality(p_equipment) = 0 and e.equipment is null)
           or e.equipment = any (p_equipment))
      and (coalesce(p_difficulty, '') = '' or e.difficulty = p_difficulty)
      and (coalesce(p_category, '') = '' or e.category = p_category)
  ), page as (
    select * from filtered
    -- Orden de gimnasio: primero lo que usa equipo; el trabajo sin equipo y los
    -- estiramientos, al final.
    order by (equipment is null), (category = 'stretching'), name_es, id
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
      ) order by (page.equipment is null), (page.category = 'stretching'), page.name_es, page.id)
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

-- 5) Facetas: cuentan lo visible, para que los chips digan la verdad.
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
    'total', (select count(*) from public.exercises where visible),
    'bodyParts', coalesce((
      select jsonb_object_agg(body_part, n)
      from (
        select body_part, count(*)::integer as n
        from public.exercises where visible group by body_part
      ) s
    ), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equipment, n)
      from (
        select equipment, count(*)::integer as n
        from public.exercises where visible and equipment is not null group by equipment
      ) s
    ), '{}'::jsonb),
    'difficulty', coalesce((
      select jsonb_object_agg(difficulty, n)
      from (
        select difficulty, count(*)::integer as n
        from public.exercises where visible group by difficulty
      ) s
    ), '{}'::jsonb),
    'category', coalesce((
      select jsonb_object_agg(category, n)
      from (
        select category, count(*)::integer as n
        from public.exercises where visible group by category
      ) s
    ), '{}'::jsonb)
  );
end $$;

revoke all on function public.exercise_facets() from public, anon;
grant execute on function public.exercise_facets() to authenticated;

-- 6) Administración: recalcular todo o cambiar uno. Nunca borra.
create or replace function public.admin_reset_library_visibility()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visibles integer;
  v_ocultos integer;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  update public.exercises
     set visible = public.exercise_is_gym(equipment, category),
         updated_at = now()
   where visible is distinct from public.exercise_is_gym(equipment, category);

  select count(*) filter (where visible), count(*) filter (where not visible)
    into v_visibles, v_ocultos
    from public.exercises;

  return jsonb_build_object('visible', v_visibles, 'hidden', v_ocultos, 'total', v_visibles + v_ocultos);
end $$;

create or replace function public.admin_set_exercise_visible(p_id text, p_visible boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_id is null or btrim(p_id) = '' then raise exception 'INVALID_PAYLOAD'; end if;

  update public.exercises
     set visible = coalesce(p_visible, true), updated_at = now()
   where id = btrim(p_id);
  if not found then raise exception 'NOT_FOUND'; end if;

  return jsonb_build_object('id', btrim(p_id), 'visible', coalesce(p_visible, true));
end $$;

revoke all on function public.admin_reset_library_visibility() from public, anon;
revoke all on function public.admin_set_exercise_visible(text, boolean) from public, anon;
grant execute on function public.admin_reset_library_visibility() to authenticated;
grant execute on function public.admin_set_exercise_visible(text, boolean) to authenticated;

-- 7) La importación deja cada fila con el criterio aplicado, así un catálogo
--    nuevo entra ya filtrado sin que nadie toque un interruptor a mano.
create or replace function public.exercise_apply_visibility_defaults()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.exercises
     set visible = public.exercise_is_gym(equipment, category)
   where visible is distinct from public.exercise_is_gym(equipment, category);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.exercise_apply_visibility_defaults() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
