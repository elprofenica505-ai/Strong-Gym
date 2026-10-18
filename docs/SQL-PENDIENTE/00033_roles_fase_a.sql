-- 00033 FASE A: APLICADA en Supabase el 2026-10-18 con autorización del usuario. Verificada en solo lectura.
-- Objetivo: base segura para roles de caja y entrenador, SIN cambiar lo que ya funciona.
--   1) Agrega los roles `cashier` y `trainer` al tipo user_role.
--   2) Tabla staff_permissions: interruptores que controla el administrador (cashier_can_void = false).
--   3) Funciones is_admin(), is_cashier(), is_trainer() exigen aal2 (MFA).
--   4) NO cambia is_staff(), crm_is_staff(), ni ninguna regla existente.
-- Efecto: un usuario con rol cashier o trainer no obtiene acceso nuevo; las reglas actuales
-- sólo reconocen admin y staff, así que siguen negándole el acceso.

-- Los valores de enum deben agregarse antes de usarlos; esta sentencia va primero.
alter type public.user_role add value if not exists 'cashier';
alter type public.user_role add value if not exists 'trainer';

begin;
set local lock_timeout = '5s';

-- 2) Permisos configurables por el administrador
create table if not exists public.staff_permissions (
  key        text primary key check (key ~ '^[a-z_]{3,60}$'),
  enabled    boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.staff_permissions (key, enabled)
values ('cashier_can_void', false)
on conflict (key) do nothing;

alter table public.staff_permissions enable row level security;

-- 3) Funciones de rol con MFA
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists(select 1 from public.profiles where id = auth.uid() and role::text = 'admin');
$$;

create or replace function public.is_cashier()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists(select 1 from public.profiles where id = auth.uid() and role::text = 'cashier');
$$;

create or replace function public.is_trainer()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists(select 1 from public.profiles where id = auth.uid() and role::text = 'trainer');
$$;

revoke all on function public.is_admin(), public.is_cashier(), public.is_trainer() from public, anon;
grant execute on function public.is_admin(), public.is_cashier(), public.is_trainer() to authenticated;

-- 2b) Acceso: sólo el administrador lee y cambia interruptores; nadie crea ni borra permisos.
revoke all on public.staff_permissions from anon, authenticated;
grant select on public.staff_permissions to authenticated;
grant update (enabled, updated_by, updated_at) on public.staff_permissions to authenticated;

drop policy if exists staff_permissions_admin_read on public.staff_permissions;
create policy staff_permissions_admin_read on public.staff_permissions
  for select to authenticated using (public.is_admin());

drop policy if exists staff_permissions_admin_update on public.staff_permissions;
create policy staff_permissions_admin_update on public.staff_permissions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
commit;

-- ROLLBACK (sólo con autorización):
-- drop table if exists public.staff_permissions;
-- drop function if exists public.is_admin(); drop function if exists public.is_cashier(); drop function if exists public.is_trainer();
-- (Los valores 'cashier' y 'trainer' del enum no se pueden quitar fácilmente; no tienen usuarios asignados.)
