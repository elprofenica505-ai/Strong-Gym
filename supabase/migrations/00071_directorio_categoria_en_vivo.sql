-- CLI-02: el directorio calcula la categoría cuando todavía no se guardó.
--
-- Problema que corrige: `client_category_apply()` deja `category_auto` guardada,
-- pero un cliente creado después del último recálculo no tiene ese valor. Su
-- fila mostraba la etiqueta histórica y no aparecía al filtrar por la categoría
-- real, aunque su vigencia fuera correcta. Ahora el directorio evalúa la
-- categoría en el momento solo para esas filas; el valor guardado manda.
--
-- Reversión: volver a la versión anterior de `crm_directory`; no se borran
-- datos ni se cambia ninguna columna.

create or replace function public.crm_directory(
  p_search text default '', p_category text default '', p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.plan_local_today();
  v_calc boolean;
  result jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  v_calc := coalesce(p_category, '') in ('strong_gym', 'familia', 'amigo', 'comun');

  with base as (
    select c.*, p.name_es as plan_name,
      coalesce(
        c.category_override,
        c.category_auto,
        public.client_category_eval(c.id, v_today)->>'category'
      ) as category_calc,
      case when c.category_override is null then 'auto' else 'manual' end as category_source,
      c.category_auto is not null as category_saved,
      (select count(*)::int from public.client_visits v
        where v.client_id = c.id and v.local_day >= v_today - 29) as visits_30,
      (select max(v.visited_at) from public.client_visits v where v.client_id = c.id) as last_visit,
      public.plan_validity_summary(c.id) as plan_validity
    from public.gym_clients c
    left join public.plans p on p.id = c.plan_id
    where not public.is_staff_profile(c.profile_id)
      and (p_search = ''
        or c.full_name ilike '%' || p_search || '%'
        or coalesce(c.phone, '') ilike '%' || p_search || '%'
        or c.client_number::text = p_search)
  ), filtered as (
    select * from base
    where coalesce(p_category, '') = ''
      or (v_calc and category_calc = p_category)
      or (not v_calc and category = p_category)
  ), page as (
    select * from filtered
    order by full_name, id
    limit 30 offset greatest(0, least(coalesce(p_offset, 0), 1000000))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name, p.id) from page p), '[]'::jsonb)
  ) into result;

  return result;
end $$;
revoke all on function public.crm_directory(text, text, integer) from public, anon;
grant execute on function public.crm_directory(text, text, integer) to authenticated;

notify pgrst, 'reload schema';
