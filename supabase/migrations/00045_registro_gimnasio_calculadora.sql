-- Aplicada en Supabase (proyecto hcnuepdxmbsmlzdmvwhx) el 2026-10-21 tras pasar scripts/test-productos-sql.mjs.
-- Requiere 00039 (body_measurements) y 00044 (nutrición del cliente).
--
-- Reglas:
-- - "Guardar registro en gimnasio" (nutrition_submit_to_gym) sólo lo ejecuta el propio cliente.
--   Agrega una fila a body_measurements con el peso y la altura del cálculo. Así la ficha de
--   progreso del administrador, caja y entrenador muestra el dato nuevo.
-- - Una vez registrado, no se repite: devuelve already=true y no duplica la medición.
-- - Recalcular (nutrition_self_calculate) quita la marca de registro, para poder volver a registrar.
-- - Los planes de administrador/entrenador no crean medición automática.

begin;
set local lock_timeout = '5s';

alter table public.client_nutrition_plans
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_measurement_id uuid references public.body_measurements(id) on delete set null;

-- Recalcular: el plan nuevo queda sin registrar hasta que el cliente lo guarde en el gimnasio.
create or replace function public.nutrition_self_calculate(
  p_goal text, p_inputs jsonb, p_results jsonb, p_meal_plan jsonb, p_routine jsonb, p_guide jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select id into v_client from public.gym_clients where profile_id = auth.uid() limit 1;
  if v_client is null then raise exception 'NOT_FOUND'; end if;
  if p_goal not in ('bajar', 'definir', 'mantener', 'musculo', 'peso') then raise exception 'INVALID_GOAL'; end if;
  if exists (select 1 from public.client_nutrition_plans where client_id = v_client and edited_by_staff) then
    raise exception 'LOCKED_BY_STAFF';
  end if;
  insert into public.client_nutrition_plans(client_id, goal, inputs, results, meal_plan, routine, guide,
    source, edited_by_staff, submitted_at, submitted_measurement_id, updated_by, updated_at)
  values (v_client, p_goal, p_inputs, p_results, p_meal_plan, p_routine, coalesce(p_guide, '[]'::jsonb),
    'cliente', false, null, null, auth.uid(), now())
  on conflict (client_id) do update set goal = excluded.goal, inputs = excluded.inputs, results = excluded.results,
    meal_plan = excluded.meal_plan, routine = excluded.routine, guide = excluded.guide,
    source = 'cliente', edited_by_staff = false, submitted_at = null, submitted_measurement_id = null,
    updated_by = excluded.updated_by, updated_at = now();
  return v_client;
end;
$$;

-- Guardar registro en el gimnasio: crea la medición de peso y altura del cálculo (una vez).
create or replace function public.nutrition_submit_to_gym()
returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_client uuid; v_plan public.client_nutrition_plans; v_measurement uuid; v_weight numeric; v_height numeric;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select id into v_client from public.gym_clients where profile_id = auth.uid() limit 1;
  if v_client is null then raise exception 'NOT_FOUND'; end if;
  select * into v_plan from public.client_nutrition_plans where client_id = v_client for update;
  if not found then raise exception 'NO_PLAN'; end if;
  if v_plan.submitted_at is not null then
    return jsonb_build_object('already', true, 'submitted_at', v_plan.submitted_at,
      'measurement_id', v_plan.submitted_measurement_id);
  end if;
  v_weight := nullif(v_plan.inputs->>'weightKg', '')::numeric;
  v_height := nullif(v_plan.inputs->>'heightCm', '')::numeric;
  if v_weight is null or v_weight <= 0 then raise exception 'NO_WEIGHT'; end if;
  insert into public.body_measurements(client_id, measured_on, weight_kg, height_cm, notes, recorded_by)
  values (v_client, (now() at time zone 'America/Managua')::date, v_weight, v_height,
    'Registro desde la calculadora del cliente (objetivo: ' || v_plan.goal || ')', auth.uid())
  returning id into v_measurement;
  update public.client_nutrition_plans
    set submitted_at = now(), submitted_measurement_id = v_measurement, updated_at = now()
    where client_id = v_client;
  return jsonb_build_object('already', false, 'measurement_id', v_measurement,
    'submitted_at', now());
end;
$$;

revoke all on function public.nutrition_self_calculate(text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.nutrition_submit_to_gym() from public, anon;
grant execute on function public.nutrition_self_calculate(text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.nutrition_submit_to_gym() to authenticated;

commit;
