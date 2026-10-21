-- Aplicada en Supabase (proyecto hcnuepdxmbsmlzdmvwhx) el 2026-10-21 tras pasar scripts/test-productos-sql.mjs.
-- Requiere 00043 (client_nutrition_plans, client_tool_settings, nutrition_save, nutrition_get).
--
-- Reglas:
-- - El cliente calcula su propio plan desde Mi cuenta (nutrition_self_calculate). Queda como source='cliente'.
-- - Si el personal edita o recalcula el plan, queda edited_by_staff=true y el cliente ya no puede recalcularlo.
-- - Editar y recalcular: sólo administrador, o entrenador con acceso aprobado y el interruptor encendido.
-- - La caja ya no edita planes (sólo lectura).
-- - El interruptor del administrador es sólo para el entrenador. La columna cashier_tools_enabled queda sin uso.

begin;
set local lock_timeout = '5s';

alter table public.client_nutrition_plans
  add column if not exists source text not null default 'entrenador' check (source in ('cliente', 'entrenador')),
  add column if not exists edited_by_staff boolean not null default false,
  add column if not exists guide jsonb not null default '[]'::jsonb check (jsonb_typeof(guide) = 'array' and length(guide::text) <= 4000);

-- Sólo administrador o entrenador con acceso e interruptor encendido.
create or replace function public.tools_can_edit(p_client uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin()
      or (public.is_trainer() and exists (
            select 1 from public.trainer_client_access a
            where a.trainer_id = auth.uid() and a.client_id = p_client and a.status = 'approved')
          and coalesce((select s.trainer_tools_enabled from public.client_tool_settings s where s.client_id = p_client), true));
$$;

drop function if exists public.admin_set_client_tools(uuid, boolean, boolean);
create or replace function public.admin_set_client_tools(p_client uuid, p_trainer boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  perform 1 from public.gym_clients where id = p_client;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.client_tool_settings(client_id, trainer_tools_enabled, updated_by, updated_at)
  values (p_client, p_trainer, auth.uid(), now())
  on conflict (client_id) do update set trainer_tools_enabled = excluded.trainer_tools_enabled,
    updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('trainer', p_trainer);
end;
$$;

-- Guardado del personal (entrenador o admin).
drop function if exists public.nutrition_save(uuid, text, jsonb, jsonb, jsonb, jsonb);
create or replace function public.nutrition_save(
  p_client uuid, p_goal text, p_inputs jsonb, p_results jsonb, p_meal_plan jsonb, p_routine jsonb, p_guide jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
begin
  if auth.uid() is null or not public.tools_can_edit(p_client) then raise exception 'AUTH'; end if;
  if p_goal not in ('bajar', 'definir', 'mantener', 'musculo', 'peso') then raise exception 'INVALID_GOAL'; end if;
  perform 1 from public.gym_clients where id = p_client;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.client_nutrition_plans(client_id, goal, inputs, results, meal_plan, routine, guide,
    source, edited_by_staff, updated_by, updated_at)
  values (p_client, p_goal, p_inputs, p_results, p_meal_plan, p_routine, coalesce(p_guide, '[]'::jsonb),
    'entrenador', true, auth.uid(), now())
  on conflict (client_id) do update set goal = excluded.goal, inputs = excluded.inputs, results = excluded.results,
    meal_plan = excluded.meal_plan, routine = excluded.routine, guide = excluded.guide,
    source = 'entrenador', edited_by_staff = true, updated_by = excluded.updated_by, updated_at = now();
  return p_client;
end;
$$;

-- Cálculo del propio cliente desde Mi cuenta.
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
    source, edited_by_staff, updated_by, updated_at)
  values (v_client, p_goal, p_inputs, p_results, p_meal_plan, p_routine, coalesce(p_guide, '[]'::jsonb),
    'cliente', false, auth.uid(), now())
  on conflict (client_id) do update set goal = excluded.goal, inputs = excluded.inputs, results = excluded.results,
    meal_plan = excluded.meal_plan, routine = excluded.routine, guide = excluded.guide,
    source = 'cliente', edited_by_staff = false, updated_by = excluded.updated_by, updated_at = now();
  return v_client;
end;
$$;

-- Lectura: el cliente ve su plan; el personal con acceso ve el plan y los permisos.
create or replace function public.nutrition_get(p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_client uuid; v_name text; v_plan public.client_nutrition_plans; v_settings public.client_tool_settings;
  v_own boolean; v_staff boolean;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if p_client is null then
    select id, full_name into v_client, v_name from public.gym_clients where profile_id = auth.uid() limit 1;
  else
    select id, full_name into v_client, v_name from public.gym_clients where id = p_client;
  end if;
  if v_client is null then return null; end if;
  v_own := exists (select 1 from public.gym_clients where id = v_client and profile_id = auth.uid());
  v_staff := public.progress_can_read_client(v_client);
  if not (v_own or v_staff) then return null; end if;
  select * into v_plan from public.client_nutrition_plans where client_id = v_client;
  if not found then v_plan := null; end if;
  select * into v_settings from public.client_tool_settings where client_id = v_client;
  if not found then v_settings := null; end if;
  if v_staff then
    return jsonb_build_object(
      'client_id', v_client, 'client_name', v_name,
      'plan', case when v_plan.client_id is not null then to_jsonb(v_plan) else null end,
      'can_edit', public.tools_can_edit(v_client),
      'can_self_calculate', false,
      'trainer_tools_enabled', coalesce(v_settings.trainer_tools_enabled, true));
  end if;
  return jsonb_build_object(
    'client_id', v_client, 'client_name', v_name,
    'plan', case when v_plan.client_id is not null then to_jsonb(v_plan) else null end,
    'can_edit', false,
    'can_self_calculate', not coalesce(v_plan.edited_by_staff, false));
end;
$$;

revoke all on function public.tools_can_edit(uuid), public.admin_set_client_tools(uuid, boolean),
  public.nutrition_save(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.nutrition_self_calculate(text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.nutrition_get(uuid) from public, anon;
grant execute on function public.admin_set_client_tools(uuid, boolean),
  public.nutrition_save(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.nutrition_self_calculate(text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.nutrition_get(uuid) to authenticated;

commit;
