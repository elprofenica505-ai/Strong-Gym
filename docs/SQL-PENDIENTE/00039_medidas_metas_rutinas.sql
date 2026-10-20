-- 00039 MEDIDAS, METAS Y RUTINAS POR CLIENTE. ESTADO: PENDIENTE (no aplicada en Supabase).
-- Requiere 00033 (is_admin/is_cashier/is_trainer), 00035 (trainer_client_access) y 00036.
-- Las reglas de negocio están en src/lib/progress/rules.ts; aquí van como restricciones duras.
--
-- Reglas:
-- - Medidas: ocho circunferencias ISAK opcionales. Vacío = no tomada, nunca cero.
--   Las medidas no se editan ni se borran; una corrección es una medición nueva.
-- - Quién registra medidas: administrador, caja (aal2) y entrenador con acceso APROBADO al cliente.
-- - Metas y rutinas: administrador y entrenador con acceso aprobado. Caja sólo lee.
-- - Metas: un tipo (pérdida, ganancia, mantenimiento, otra), plazo máximo de 12 meses.
--   Una sola meta activa por cliente; al cambiarla, la anterior queda cancelada (no se borra).
-- - Rutinas: una sola activa por cliente; al cambiarla, la anterior queda cerrada (no se borra).
-- - Todas las escrituras van por funciones. Las tablas no admiten INSERT/UPDATE/DELETE directo.
-- - Clientes sin acceso del personal: no ven estos datos (esta fase no da lectura al cliente).

begin;
set local lock_timeout = '5s';

-- 1) Función de lectura por cliente: administrador, caja, o entrenador con acceso aprobado.
create or replace function public.progress_can_read_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin()
      or public.is_cashier()
      or (public.is_trainer() and exists (
            select 1 from public.trainer_client_access a
            where a.trainer_id = auth.uid() and a.client_id = p_client and a.status = 'approved'));
$$;

-- Escritura de metas y rutinas: administrador, o entrenador con acceso aprobado (caja NO).
create or replace function public.progress_can_manage_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin()
      or (public.is_trainer() and exists (
            select 1 from public.trainer_client_access a
            where a.trainer_id = auth.uid() and a.client_id = p_client and a.status = 'approved'));
$$;

-- 2) Medidas corporales.
create table if not exists public.body_measurements (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.gym_clients(id) on delete restrict,
  measured_on          date not null,
  weight_kg            numeric(6,2) not null check (weight_kg > 0 and weight_kg <= 500),
  height_cm            numeric(5,1) check (height_cm is null or (height_cm > 0 and height_cm <= 250)),
  cintura_cm           numeric(5,1) check (cintura_cm is null or (cintura_cm > 0 and cintura_cm <= 300)),
  pecho_cm             numeric(5,1) check (pecho_cm is null or (pecho_cm > 0 and pecho_cm <= 300)),
  biceps_relajado_cm   numeric(5,1) check (biceps_relajado_cm is null or (biceps_relajado_cm > 0 and biceps_relajado_cm <= 300)),
  biceps_contraido_cm  numeric(5,1) check (biceps_contraido_cm is null or (biceps_contraido_cm > 0 and biceps_contraido_cm <= 300)),
  antebrazo_cm         numeric(5,1) check (antebrazo_cm is null or (antebrazo_cm > 0 and antebrazo_cm <= 300)),
  gluteo_cm            numeric(5,1) check (gluteo_cm is null or (gluteo_cm > 0 and gluteo_cm <= 300)),
  muslo_cm             numeric(5,1) check (muslo_cm is null or (muslo_cm > 0 and muslo_cm <= 300)),
  pantorrilla_cm       numeric(5,1) check (pantorrilla_cm is null or (pantorrilla_cm > 0 and pantorrilla_cm <= 300)),
  notes                text check (notes is null or length(notes) <= 300),
  recorded_by          uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now()
);
-- No se puede medir en el futuro (día de Managua).
alter table public.body_measurements drop constraint if exists body_measurements_not_future;
alter table public.body_measurements add constraint body_measurements_not_future
  check (measured_on <= (now() at time zone 'America/Managua')::date);
create index if not exists body_measurements_client_idx on public.body_measurements (client_id, measured_on);

-- Solo se agregan filas: se bloquea UPDATE y DELETE también para el dueño de la base.
create or replace function public.body_measurements_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'Las mediciones no se editan ni se borran; registra una nueva medición.';
end;
$$;
drop trigger if exists body_measurements_no_update on public.body_measurements;
create trigger body_measurements_no_update before update or delete on public.body_measurements
  for each row execute function public.body_measurements_append_only();

-- 3) Metas.
create table if not exists public.client_goals (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.gym_clients(id) on delete restrict,
  goal_type       text not null check (goal_type in ('perdida', 'ganancia', 'mantenimiento', 'otra')),
  other_label     text check (other_label is null or length(trim(other_label)) between 3 and 120),
  starts_on       date not null,
  target_date     date not null,
  target_weight_kg numeric(6,2) check (target_weight_kg is null or (target_weight_kg > 0 and target_weight_kg <= 500)),
  status          text not null default 'activa' check (status in ('activa', 'cumplida', 'cancelada')),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  closed_at       timestamptz,
  constraint client_goals_dates check (target_date > starts_on
    and target_date <= (starts_on + interval '12 months')::date),
  constraint client_goals_weight_required check (goal_type = 'otra' or target_weight_kg is not null),
  constraint client_goals_other_required check (goal_type <> 'otra' or other_label is not null)
);
create unique index if not exists client_goals_one_active_idx
  on public.client_goals (client_id) where status = 'activa';

-- 4) Rutinas.
create table if not exists public.client_routines (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.gym_clients(id) on delete restrict,
  name         text not null check (length(trim(name)) between 2 and 80),
  days         text[] not null check (cardinality(days) between 1 and 7),
  exercises    jsonb not null check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) between 1 and 40),
  status       text not null default 'activa' check (status in ('activa', 'cerrada')),
  starts_on    date not null,
  ends_on      date,
  assigned_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint client_routines_ends check (ends_on is null or ends_on >= starts_on)
);
create unique index if not exists client_routines_one_active_idx
  on public.client_routines (client_id) where status = 'activa';

-- 5) Permisos de tablas y RLS.
alter table public.body_measurements enable row level security;
alter table public.client_goals enable row level security;
alter table public.client_routines enable row level security;
revoke all on public.body_measurements, public.client_goals, public.client_routines from anon, authenticated;
grant select on public.body_measurements, public.client_goals, public.client_routines to authenticated;

drop policy if exists body_measurements_read on public.body_measurements;
create policy body_measurements_read on public.body_measurements
  for select to authenticated using (public.progress_can_read_client(client_id));
drop policy if exists client_goals_read on public.client_goals;
create policy client_goals_read on public.client_goals
  for select to authenticated using (public.progress_can_read_client(client_id));
drop policy if exists client_routines_read on public.client_routines;
create policy client_routines_read on public.client_routines
  for select to authenticated using (public.progress_can_read_client(client_id));

-- 6) Funciones de escritura.

-- Registrar una medición. p_values lleva las claves de las ocho medidas; las que faltan quedan vacías.
create or replace function public.record_body_measurement(
  p_client uuid, p_measured_on date, p_weight numeric, p_height numeric, p_values jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.progress_can_read_client(p_client) then raise exception 'AUTH'; end if;
  if not (public.is_admin() or public.is_cashier() or public.is_trainer()) then raise exception 'AUTH'; end if;
  if p_values is not null and jsonb_typeof(p_values) <> 'object' then raise exception 'VALUES_INVALID'; end if;

  insert into public.body_measurements(client_id, measured_on, weight_kg, height_cm,
    cintura_cm, pecho_cm, biceps_relajado_cm, biceps_contraido_cm, antebrazo_cm, gluteo_cm, muslo_cm, pantorrilla_cm,
    notes, recorded_by)
  values (p_client, p_measured_on, p_weight, p_height,
    nullif(p_values->>'cintura_cm','')::numeric, nullif(p_values->>'pecho_cm','')::numeric,
    nullif(p_values->>'biceps_relajado_cm','')::numeric, nullif(p_values->>'biceps_contraido_cm','')::numeric,
    nullif(p_values->>'antebrazo_cm','')::numeric, nullif(p_values->>'gluteo_cm','')::numeric,
    nullif(p_values->>'muslo_cm','')::numeric, nullif(p_values->>'pantorrilla_cm','')::numeric,
    nullif(trim(coalesce(p_notes,'')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Cambiar la meta activa: la anterior queda cancelada (no se borra).
create or replace function public.set_client_goal(
  p_client uuid, p_goal_type text, p_other_label text, p_starts_on date, p_target_date date, p_target_weight numeric)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.progress_can_manage_client(p_client) then raise exception 'AUTH'; end if;
  update public.client_goals set status = 'cancelada', closed_at = now()
    where client_id = p_client and status = 'activa';
  insert into public.client_goals(client_id, goal_type, other_label, starts_on, target_date, target_weight_kg, created_by)
  values (p_client, p_goal_type, nullif(trim(coalesce(p_other_label,'')), ''), p_starts_on, p_target_date, p_target_weight, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Cambiar la rutina activa: la anterior queda cerrada (no se borra).
create or replace function public.set_client_routine(
  p_client uuid, p_name text, p_days text[], p_exercises jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_today date := (now() at time zone 'America/Managua')::date;
begin
  if not public.progress_can_manage_client(p_client) then raise exception 'AUTH'; end if;
  update public.client_routines set status = 'cerrada', ends_on = v_today
    where client_id = p_client and status = 'activa';
  insert into public.client_routines(client_id, name, days, exercises, starts_on, assigned_by)
  values (p_client, trim(p_name), p_days, p_exercises, v_today, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.progress_can_read_client(uuid), public.progress_can_manage_client(uuid) from public, anon;
grant execute on function public.progress_can_read_client(uuid), public.progress_can_manage_client(uuid) to authenticated;
revoke all on function public.record_body_measurement(uuid, date, numeric, numeric, jsonb, text) from public, anon;
revoke all on function public.set_client_goal(uuid, text, text, date, date, numeric) from public, anon;
revoke all on function public.set_client_routine(uuid, text, text[], jsonb) from public, anon;
grant execute on function public.record_body_measurement(uuid, date, numeric, numeric, jsonb, text) to authenticated;
grant execute on function public.set_client_goal(uuid, text, text, date, date, numeric) to authenticated;
grant execute on function public.set_client_routine(uuid, text, text[], jsonb) to authenticated;

commit;
