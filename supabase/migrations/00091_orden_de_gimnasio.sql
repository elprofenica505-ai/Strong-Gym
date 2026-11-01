-- 00091 · La biblioteca abre como un gimnasio (EX-01)
--
-- Qué pasaba: el catálogo se ordenaba por nombre, así que la primera pantalla
-- mezclaba estiramientos y ejercicios de casa con la prensa y el jalón. El
-- dueño lo notó de inmediato: «casi todo se basa en movimientos que se
-- pudieran realizar en casa».
--
-- Qué cambia: el orden por defecto pone primero los ejercicios que usan equipo
-- y deja al final el trabajo sin equipo y los estiramientos. El contenido no se
-- toca: los 701 ejercicios siguen ahí y los filtros funcionan igual.
--
-- Reversible: `create or replace` con el orden de `00090` (name_es, id).
-- Aditiva: no cambia datos ni columnas.

begin;
set local lock_timeout = '5s';

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
      -- Un arreglo vacío significa «sin equipo» (peso corporal), no «sin filtro»:
      -- es lo que manda el chip «Peso corporal» de la pantalla.
      and (p_equipment is null
           or (cardinality(p_equipment) = 0 and e.equipment is null)
           or e.equipment = any (p_equipment))
      and (coalesce(p_difficulty, '') = '' or e.difficulty = p_difficulty)
      and (coalesce(p_category, '') = '' or e.category = p_category)
  ), page as (
    select * from filtered
    -- Orden de gimnasio: primero lo que se hace con equipo (máquina, polea,
    -- barra, mancuerna) y al final el trabajo sin equipo y los estiramientos.
    -- Así la primera pantalla se parece a la sala, no a una rutina de casa.
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

notify pgrst, 'reload schema';

commit;
