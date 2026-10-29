-- 00073 · La grilla lee el nombre del entrenador del esquema real
--
-- Problema detectado al probar la pantalla en producción: la tabla `coaches`
-- productiva no tiene la columna `name` (nació con `full_name`), así que
-- `admin_schedule_board()` fallaba con «column co.name does not exist» y la
-- pantalla mostraba «No pudimos confirmar estos datos».
--
-- Corrección: el nombre se lee con `to_jsonb(co)`, que no depende de que la
-- columna exista con un nombre u otro. Se prefiere `full_name` y, si no hay,
-- se usa `name`; en ningún caso se inventa un nombre: si ambos faltan se
-- devuelve el identificador.
--
-- Reversión segura: volver a la definición de 00072. No se tocan datos ni
-- columnas.

begin;
set local lock_timeout = '5s';

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
        -- `coaches` no tiene las mismas columnas en todas las bases: la
        -- productiva usa `full_name`, la de las migraciones usa `name`.
        'coach_name', coalesce(
          nullif(to_jsonb(co) ->> 'full_name', ''),
          nullif(to_jsonb(co) ->> 'name', ''),
          s.coach_id
        ),
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
      select jsonb_agg(jsonb_build_object(
        'id', co.id,
        'name', coalesce(
          nullif(to_jsonb(co) ->> 'full_name', ''),
          nullif(to_jsonb(co) ->> 'name', ''),
          co.id
        ),
        'specialties', to_jsonb(co) -> 'specialties'
      ) order by co.id)
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

notify pgrst, 'reload schema';
commit;
