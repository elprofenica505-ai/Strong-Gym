-- 00055 · La protección de menores también aplica a las rutas del personal
--
-- La calculadora del cliente ya exigía ser adulto y tener fecha de nacimiento.
-- Sin embargo, las funciones usadas por el administrador o el entrenador para
-- guardar y aprobar un plan no repetían ese control. Esta migración cierra ese
-- hueco en la base de datos reutilizando client_age_status():
--   - minor  => MINOR
--   - unknown => NO_BIRTHDATE
--
-- No se modifica nutrition_get(): el personal sigue pudiendo leer la ficha y
-- ver la edad del cliente. No cambian tablas, datos ni otros permisos.
--
-- Reversión: volver a ejecutar las definiciones de nutrition_save() y
-- nutrition_approve() de 00047_menores_consentimiento_aprobacion.sql.

begin;

create or replace function public.nutrition_save(
  p_client uuid, p_goal text, p_inputs jsonb, p_results jsonb, p_meal_plan jsonb, p_routine jsonb, p_guide jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_age text;
begin
  if auth.uid() is null or not public.tools_can_edit(p_client) then raise exception 'AUTH'; end if;
  v_age := public.client_age_status(p_client);
  if v_age = 'minor' then raise exception 'MINOR'; end if;
  if v_age <> 'adult' then raise exception 'NO_BIRTHDATE'; end if;
  if p_goal not in ('bajar', 'definir', 'mantener', 'musculo', 'peso') then raise exception 'INVALID_GOAL'; end if;
  perform 1 from public.gym_clients where id = p_client;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.client_nutrition_plans(client_id, goal, inputs, results, meal_plan, routine, guide,
    source, edited_by_staff, approved_at, approved_by, updated_by, updated_at)
  values (p_client, p_goal, p_inputs, p_results, p_meal_plan, p_routine, coalesce(p_guide, '[]'::jsonb),
    'entrenador', true, null, null, auth.uid(), now())
  on conflict (client_id) do update set goal = excluded.goal, inputs = excluded.inputs, results = excluded.results,
    meal_plan = excluded.meal_plan, routine = excluded.routine, guide = excluded.guide,
    source = 'entrenador', edited_by_staff = true, approved_at = null, approved_by = null,
    updated_by = excluded.updated_by, updated_at = now();
  return p_client;
end;
$$;

create or replace function public.nutrition_approve(p_client uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_plan public.client_nutrition_plans; v_age text;
begin
  if auth.uid() is null or not public.tools_can_edit(p_client) then raise exception 'AUTH'; end if;
  v_age := public.client_age_status(p_client);
  if v_age = 'minor' then raise exception 'MINOR'; end if;
  if v_age <> 'adult' then raise exception 'NO_BIRTHDATE'; end if;
  select * into v_plan from public.client_nutrition_plans where client_id = p_client for update;
  if not found then raise exception 'NO_PLAN'; end if;
  if v_plan.approved_at is not null then
    return jsonb_build_object('already', true, 'approved_at', v_plan.approved_at);
  end if;
  perform public.nutrition_apply_to_gym(p_client, v_plan);
  update public.client_nutrition_plans
    set approved_at = now(), approved_by = auth.uid(), updated_at = now()
    where client_id = p_client;
  return jsonb_build_object('already', false, 'approved_at', now());
end;
$$;

revoke all on function public.nutrition_save(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.nutrition_approve(uuid) from public, anon;
grant execute on function public.nutrition_save(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.nutrition_approve(uuid) to authenticated;

commit;
