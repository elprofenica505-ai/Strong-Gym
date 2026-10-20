-- 00040 MI PROGRESO PARA EL CLIENTE. ESTADO: PENDIENTE (no aplicada en Supabase).
-- Requiere 00039. Sólo agrega una función de lectura; no cambia las tablas ni las políticas existentes.
--
-- Reglas:
-- - Un cliente con cuenta (gym_clients.profile_id = su usuario) lee SOLO sus propios datos.
-- - No incluye notas del personal, ni el nombre de quien registró o asignó.
-- - Sin cuenta vinculada devuelve null (no es un error y no muestra datos ajenos).
-- - El personal no usa esta función para ver clientes ajenos: para eso están las políticas de 00039.

begin;
set local lock_timeout = '5s';

create or replace function public.my_progress()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_client uuid;
  v_name text;
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;

  select id, full_name into v_client, v_name
    from public.gym_clients
    where profile_id = auth.uid()
    limit 1;
  if v_client is null then return null; end if;

  select jsonb_build_object(
    'client_name', v_name,
    'measurements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'measured_on', m.measured_on,
        'weight_kg', m.weight_kg,
        'height_cm', m.height_cm,
        'values', jsonb_build_object(
          'cintura_cm', m.cintura_cm, 'pecho_cm', m.pecho_cm,
          'biceps_relajado_cm', m.biceps_relajado_cm, 'biceps_contraido_cm', m.biceps_contraido_cm,
          'antebrazo_cm', m.antebrazo_cm, 'gluteo_cm', m.gluteo_cm,
          'muslo_cm', m.muslo_cm, 'pantorrilla_cm', m.pantorrilla_cm))
        order by m.measured_on desc, m.created_at desc)
      from (select * from public.body_measurements where client_id = v_client
            order by measured_on desc, created_at desc limit 200) m
    ), '[]'::jsonb),
    'goal', (select jsonb_build_object(
        'goal_type', g.goal_type, 'other_label', g.other_label,
        'starts_on', g.starts_on, 'target_date', g.target_date, 'target_weight_kg', g.target_weight_kg)
      from public.client_goals g where g.client_id = v_client and g.status = 'activa' limit 1),
    'routine', (select jsonb_build_object(
        'name', r.name, 'days', r.days, 'exercises', r.exercises, 'starts_on', r.starts_on)
      from public.client_routines r where r.client_id = v_client and r.status = 'activa' limit 1)
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.my_progress() from public, anon;
grant execute on function public.my_progress() to authenticated;

commit;
