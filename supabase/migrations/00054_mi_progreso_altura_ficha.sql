-- 00054 · «Mi progreso» devuelve la altura guardada en la ficha
--
-- Desde 00052 la altura vive una sola vez en gym_clients.height_cm (el
-- administrador puede corregirla con bitácora, 00053), y el panel la lee de
-- ahí. La vista del propio cliente usaba la altura y el IMC con la última
-- medición, porque la función my_progress (00040) no incluía la de la ficha:
-- si el administrador corregía la altura, el cliente seguía viendo la vieja
-- hasta su próxima medición.
--
-- Este cambio solo agrega 'ficha_height_cm' a la respuesta JSON, con el valor
-- de gym_clients.height_cm de la PROPIA ficha del que llama (misma fila que ya
-- se resolvía por profile_id = auth.uid()). No cambia permisos ni expone
-- datos de terceros: las mediciones históricas conservan su height_cm.
--
-- Reversión: re-aplicar la definición de supabase/migrations/00040_mi_progreso_cliente.sql.

begin;

create or replace function public.my_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_client uuid := (select id from public.gym_clients where profile_id = auth.uid());
begin
  if v_client is null then
    return null;
  end if;

  return jsonb_build_object(
    'client_name', (select full_name from public.gym_clients where id = v_client),
    'ficha_height_cm', (select height_cm from public.gym_clients where id = v_client),
    'measurements', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', m.id,
                 'measured_on', m.measured_on,
                 'weight_kg', m.weight_kg,
                 'height_cm', m.height_cm,
                 'values', jsonb_build_object(
                   'cintura_cm', m.cintura_cm,
                   'pecho_cm', m.pecho_cm,
                   'biceps_relajado_cm', m.biceps_relajado_cm,
                   'biceps_contraido_cm', m.biceps_contraido_cm,
                   'antebrazo_cm', m.antebrazo_cm,
                   'gluteo_cm', m.gluteo_cm,
                   'muslo_cm', m.muslo_cm,
                   'pantorrilla_cm', m.pantorrilla_cm
                 )
               )
               order by m.measured_on desc, m.created_at desc)
        from public.body_measurements m
       where m.client_id = v_client
    ), '[]'::jsonb),
    'goal', (
      select jsonb_build_object(
               'id', g.id,
               'goal_type', g.goal_type,
               'other_label', g.other_label,
               'starts_on', g.starts_on,
               'target_date', g.target_date,
               'target_weight_kg', g.target_weight_kg)
        from public.client_goals g
       where g.client_id = v_client and g.status = 'activa'
       limit 1
    ),
    'routine', (
      select jsonb_build_object(
               'id', r.id,
               'name', r.name,
               'days', r.days,
               'exercises', r.exercises,
               'starts_on', r.starts_on)
        from public.client_routines r
       where r.client_id = v_client and r.status = 'activa'
       limit 1
    )
  );
end;
$$;

revoke all on function public.my_progress() from public, anon;
grant execute on function public.my_progress() to authenticated;

commit;
