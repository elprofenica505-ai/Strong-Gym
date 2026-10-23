-- Aplicada en Supabase (proyecto hcnuepdxmbsmlzdmvwhx) como meta_rutina_desde_calculadora tras pasar scripts/test-productos-sql.mjs (87 PASS).
-- Requiere 00039 (client_goals, client_routines) y 00045 (nutrition_submit_to_gym).
--
-- Problema: la calculadora guardaba el objetivo y la rutina en client_nutrition_plans, pero el módulo
-- de progreso (panel del entrenador y administración) lee "Meta activa" y "Rutina activa" de
-- client_goals y client_routines. Por eso aparecían vacías.
--
-- Solución: "Guardar registro en gimnasio" (nutrition_submit_to_gym) también abre la meta activa y la
-- rutina activa a partir del cálculo. Las anteriores quedan canceladas o cerradas (no se borran).
--
-- Correspondencia de objetivos (tipos de meta de 00039):
--   bajar     -> perdida
--   mantener  -> mantenimiento
--   definir   -> otra ("Definición muscular")
--   musculo   -> ganancia ("Ganar músculo")
--   peso      -> ganancia ("Ganar peso")
-- Plazo: semanas estimadas del cálculo / 4 (mínimo 1 mes, máximo 12). Mantener o sin cambio: 3 meses (revisión).
-- Rutina: los días de fuerza son días; las sesiones de cardio se agrupan en un solo día "Cardio (N sesiones)".

begin;
set local lock_timeout = '5s';

create or replace function public.nutrition_submit_to_gym()
returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_client uuid; v_plan public.client_nutrition_plans; v_measurement uuid;
  v_weight numeric; v_height numeric;
  v_today date := (now() at time zone 'America/Managua')::date;
  v_goal_label text; v_goal_type text; v_target_weight numeric; v_weeks int; v_months int; v_target_date date;
  v_days text[] := array[]::text[]; v_exercises jsonb := '[]'::jsonb; v_cardio int := 0;
  v_day jsonb; v_ex jsonb;
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

  -- 1) Medición (igual que 00045).
  insert into public.body_measurements(client_id, measured_on, weight_kg, height_cm, notes, recorded_by)
  values (v_client, v_today, v_weight, v_height,
    'Registro desde la calculadora del cliente (objetivo: ' || v_plan.goal || ')', auth.uid())
  returning id into v_measurement;

  -- 2) Meta activa (la anterior queda cancelada).
  v_goal_label := case v_plan.goal
    when 'bajar' then 'Bajar de peso' when 'definir' then 'Definición muscular'
    when 'mantener' then 'Mantener físico' when 'musculo' then 'Ganar músculo' when 'peso' then 'Ganar peso' end;
  v_goal_type := case v_plan.goal
    when 'bajar' then 'perdida' when 'mantener' then 'mantenimiento' when 'definir' then 'otra' else 'ganancia' end;
  v_target_weight := nullif(v_plan.results->>'targetWeightKg', '')::numeric;
  if v_goal_type <> 'otra' and v_target_weight is null then raise exception 'NO_TARGET'; end if;
  v_weeks := coalesce(nullif(v_plan.results->>'weeksEstimate', '')::int, 0);
  v_months := case when v_goal_type = 'mantenimiento' or v_weeks <= 0 then 3
                   else least(12, greatest(1, ceil(v_weeks / 4.0)::int)) end;
  v_target_date := (v_today + make_interval(months => v_months))::date;

  update public.client_goals set status = 'cancelada', closed_at = now()
    where client_id = v_client and status = 'activa';
  insert into public.client_goals(client_id, goal_type, other_label, starts_on, target_date, target_weight_kg, created_by)
  values (v_client, v_goal_type, case when v_goal_type = 'otra' then v_goal_label end,
          v_today, v_target_date, v_target_weight, auth.uid());

  -- 3) Rutina activa (la anterior queda cerrada).
  for v_day in select * from jsonb_array_elements(coalesce(v_plan.routine, '[]'::jsonb)) loop
    if (v_day->>'day') like 'Cardio%' then
      v_cardio := v_cardio + 1;
    else
      v_days := v_days || (v_day->>'day');
    end if;
    for v_ex in select * from jsonb_array_elements(coalesce(v_day->'exercises', '[]'::jsonb)) loop
      v_exercises := v_exercises || jsonb_build_array(jsonb_build_object(
        'ejercicio', (v_day->>'day') || ' · ' || (v_day->>'focus') || ': ' || (v_ex->>'name'),
        'series', nullif(v_ex->>'sets', '')::int,
        'reps', v_ex->>'reps',
        'descanso_s', nullif(v_ex->>'restSec', '')::int));
    end loop;
  end loop;
  if v_cardio > 0 then v_days := v_days || ('Cardio (' || v_cardio || ' sesiones)'); end if;
  if jsonb_array_length(v_exercises) = 0 or cardinality(v_days) = 0 then raise exception 'NO_ROUTINE'; end if;

  update public.client_routines set status = 'cerrada', ends_on = v_today
    where client_id = v_client and status = 'activa';
  insert into public.client_routines(client_id, name, days, exercises, starts_on, assigned_by)
  values (v_client, 'Rutina · ' || v_goal_label, v_days, v_exercises, v_today, auth.uid());

  -- 4) Marca de registro.
  update public.client_nutrition_plans
    set submitted_at = now(), submitted_measurement_id = v_measurement, updated_at = now()
    where client_id = v_client;

  return jsonb_build_object('already', false, 'measurement_id', v_measurement,
    'submitted_at', now(), 'goal_type', v_goal_type, 'target_date', v_target_date);
end;
$$;

revoke all on function public.nutrition_submit_to_gym() from public, anon;
grant execute on function public.nutrition_submit_to_gym() to authenticated;

commit;
