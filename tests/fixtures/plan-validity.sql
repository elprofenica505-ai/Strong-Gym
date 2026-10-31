-- Fixture mínimo para probar las vigencias (00085) sin Supabase.
-- Solo las columnas y funciones que tocan las funciones de vigencias.

create schema if not exists auth;
create table if not exists auth.current_user (id uuid);
create or replace function auth.uid() returns uuid language sql stable as
$$ select id from auth.current_user limit 1 $$;

create role anon nologin;
create role authenticated nologin;

create table if not exists public.gym_clients (
  id uuid primary key default gen_random_uuid(),
  full_name text
);

create table if not exists public.profiles (
  id uuid primary key,
  full_name text,
  role text
);

create table if not exists public.classes (
  id text primary key,
  slug text,
  name_es text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.plans (
  id text primary key,
  slug text,
  name_es text not null,
  name_en text,
  period text default 'month',
  price numeric(10, 2),
  price_nio numeric(12, 2),
  is_active boolean not null default true,
  access_kind text default 'gym',
  class_id text,
  duration_days integer,
  validity_currency text,
  validity_amount numeric(12, 2),
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

create table if not exists public.category_rules (
  id uuid primary key default gen_random_uuid(),
  category text,
  is_active boolean not null default true,
  is_fallback boolean not null default false,
  sort_order integer not null default 0,
  requires_validity boolean not null default false,
  validity_days_min integer not null default 0,
  forbids_validity boolean not null default false,
  requires_purchase_window_days integer,
  visits_min integer not null default 0,
  visits_window_days integer not null default 30
);

create table if not exists public.client_visits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  local_day date
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  kind text,
  created_at timestamptz not null default now()
);

-- Doble modelo, igual que producción: legado + nuevo.
create table if not exists public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid,
  plan_id text not null,
  started_at timestamptz,
  expires_at timestamptz,
  price_paid numeric(12, 2),
  currency text not null default 'NIO',
  is_active boolean default true,
  notes text,
  created_at timestamptz not null default now(),
  client_id uuid not null,
  access text not null default 'gym',
  started_on date not null,
  expires_on date not null,
  request_id uuid not null default gen_random_uuid(),
  transaction_id uuid,
  source text not null default 'movement',
  created_by uuid,
  class_id text
);

create table if not exists public.finance_voids (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  original_id uuid not null,
  reversal_id uuid,
  reason text,
  actor_id uuid,
  actor_name text,
  actor_role text,
  payload jsonb,
  receipt jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer as $$
  select exists(select 1 from auth.current_user)
$$;

create or replace function public.crm_is_staff() returns boolean
language sql stable security definer as $$
  select exists(select 1 from auth.current_user)
$$;

create or replace function public.plan_local_today() returns date
language sql stable as $$
  select (now() at time zone 'America/Managua')::date
$$;

create or replace function public.plan_validity_terms(p_plan text) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'amount', 560, 'currency', 'NIO', 'days', 30, 'access', 'gym', 'class_id', ''
  ) where exists (select 1 from public.plans where id = p_plan)
$$;
