-- 00043 PLAN DE NUTRICIÓN Y RUTINA POR OBJETIVO + INTERRUPTOR DEL ADMINISTRADOR. ESTADO: PENDIENTE de aplicar.
-- Requiere 00039 (progress_can_read_client), 00033 (is_admin, is_cashier, is_trainer) y 00042.
--
-- Reglas:
-- - Lectura: personal con acceso al progreso del cliente y el propio cliente.
-- - Escritura (guardar cálculo, plan y rutina):
--   administrador: siempre; entrenador con acceso aprobado: sólo si el interruptor lo permite;
--   caja: sólo si el interruptor lo permite. Por defecto los interruptores están encendidos.
-- - Sólo el administrador cambia el interruptor, por cliente.
-- - Cada guardado reemplaza el plan activo (una fila por cliente). Las herramientas no son consejo médico:
--   el texto del aviso se muestra en la app y se guarda como aceptado por la versión actual.

begin;
set local lock_timeout = '5s';

create table if not exists public.client_tool_settings (
  client_id uuid primary key references public.gym_clients(id) on delete cascade,
  trainer_tools_enabled boolean not null default true,
  cashier_tools_enabled boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.client_nutrition_plans (
  client_id uuid primary key references public.gym_clients(id) on delete cascade,
  goal text not null check (goal in ('bajar', 'definir', 'mantener', 'musculo', 'peso')),
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object' and length(inputs::text) <= 4000),
  results jsonb not null check (jsonb_typeof(results) = 'object' and length(results::text) <= 20000),
  meal_plan jsonb not null check (jsonb_typeof(meal_plan) = 'array' and length(meal_plan::text) <= 60000),
  routine jsonb not null check (jsonb_typeof(routine) = 'array' and length(routine::text) <= 40000),
  disclaimer_version text not null default 'v1-2026-10',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.client_tool_settings enable row level security;
alter table public.client_nutrition_plans enable row level security;
revoke all on public.client_tool_settings, public.client_nutrition_plans from public, anon, authenticated;

-- Quién puede EDITAR las herramientas de este cliente.
create or replace function public.tools_can_edit(p_client uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin()
      or (public.is_trainer() and exists (
            select 1 from public.trainer_client_access a
            where a.trainer_id = auth.uid() and a.client_id = p_client and a.status = 'approved')
          and coalesce((select s.trainer_tools_enabled from public.client_tool_settings s where s.client_id = p_client), true))
      or (public.is_cashier()
          and coalesce((select s.cashier_tools_enabled from public.client_tool_settings s where s.client_id = p_client), true));
$$;

-- Interruptor por cliente (sólo administrador).
create or replace function public.admin_set_client_tools(p_client uuid, p_trainer boolean, p_cashier boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  perform 1 from public.gym_clients where id = p_client;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.client_tool_settings(client_id, trainer_tools_enabled, cashier_tools_enabled, updated_by, updated_at)
  values (p_client, p_trainer, p_cashier, auth.uid(), now())
  on conflict (client_id) do update set trainer_tools_enabled = excluded.trainer_tools_enabled,
    cashier_tools_enabled = excluded.cashier_tools_enabled, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('trainer', p_trainer, 'cashier', p_cashier);
end;
$$;

-- Guardar cálculo, objetivo, plan y rutina (reemplaza el activo).
create or replace function public.nutrition_save(
  p_client uuid, p_goal text, p_inputs jsonb, p_results jsonb, p_meal_plan jsonb, p_routine jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
begin
  if auth.uid() is null or not public.tools_can_edit(p_client) then raise exception 'AUTH'; end if;
  if p_goal not in ('bajar', 'definir', 'mantener', 'musculo', 'peso') then raise exception 'INVALID_GOAL'; end if;
  perform 1 from public.gym_clients where id = p_client;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.client_nutrition_plans(client_id, goal, inputs, results, meal_plan, routine, updated_by, updated_at)
  values (p_client, p_goal, p_inputs, p_results, p_meal_plan, p_routine, auth.uid(), now())
  on conflict (client_id) do update set goal = excluded.goal, inputs = excluded.inputs, results = excluded.results,
    meal_plan = excluded.meal_plan, routine = excluded.routine, updated_by = excluded.updated_by, updated_at = now();
  return p_client;
end;
$$;

-- Lectura: personal con acceso y el propio cliente. Devuelve también si el usuario puede editar.
create or replace function public.nutrition_get(p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_client uuid; v_plan public.client_nutrition_plans; v_settings public.client_tool_settings;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if p_client is null then
    select id into v_client from public.gym_clients where profile_id = auth.uid() limit 1;
  else
    v_client := p_client;
  end if;
  if v_client is null then return null; end if;
  if not (public.progress_can_read_client(v_client)
          or exists(select 1 from public.gym_clients where id = v_client and profile_id = auth.uid())) then
    return null;
  end if;
  select * into v_plan from public.client_nutrition_plans where client_id = v_client;
  if not found then v_plan := null; end if;
  select * into v_settings from public.client_tool_settings where client_id = v_client;
  if not found then v_settings := null; end if;
  -- Los interruptores son internos del personal: el cliente no los ve.
  if public.progress_can_read_client(v_client) then
    return jsonb_build_object(
      'client_id', v_client,
      'plan', case when v_plan.client_id is not null then to_jsonb(v_plan) else null end,
      'can_edit', public.tools_can_edit(v_client),
      'trainer_tools_enabled', coalesce(v_settings.trainer_tools_enabled, true),
      'cashier_tools_enabled', coalesce(v_settings.cashier_tools_enabled, true));
  end if;
  return jsonb_build_object(
    'client_id', v_client,
    'plan', case when v_plan.client_id is not null then to_jsonb(v_plan) else null end,
    'can_edit', false);
end;
$$;

revoke all on function public.tools_can_edit(uuid), public.admin_set_client_tools(uuid,boolean,boolean),
  public.nutrition_save(uuid,text,jsonb,jsonb,jsonb,jsonb), public.nutrition_get(uuid) from public, anon;
grant execute on function public.tools_can_edit(uuid), public.admin_set_client_tools(uuid,boolean,boolean),
  public.nutrition_save(uuid,text,jsonb,jsonb,jsonb,jsonb), public.nutrition_get(uuid) to authenticated;
revoke all on function public.tools_can_edit(uuid) from authenticated;

commit;
