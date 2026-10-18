-- 00034 FASE B: separar permisos por función (caja, entrenador, administrador).
-- ESTADO: APLICADO EN SUPABASE (proyecto hcnuepdxmbsmlzdmvwhx). Incluye quitar la política antigua 'Staff can write coaches' tras detectar que caja podía escribir entrenadores.
-- Requiere: 00030, 00031 (crm_is_staff), 00032 (aal2) y 00033 (roles cashier/trainer, is_admin, is_cashier, is_trainer).
-- Aplicar sólo con autorización expresa. Una sentencia por llamada si se usa execute_query.
--
-- Reglas de la fase:
-- - "Personal" con acceso a datos (is_staff / crm_is_staff) = administrador o caja, siempre con MFA (aal2).
--   El entrenador NO entra en esas reglas: no ve teléfono, correo, saldos ni cobros.
-- - Planes, clases, entrenadores, horarios e importación = sólo administrador.
-- - Cuentas que tenían rol 'staff' pasan a 'trainer' (decisión del dueño). Pierden acceso a caja.
-- - El administrador asigna roles con admin_set_role(), queda bitácora en role_changes.
--   No puede cambiar su propio rol ni quitar al último administrador.
-- - Lista del entrenador sin datos de contacto: trainer_roster().

begin;
set local lock_timeout = '5s';

-- 1) Cuentas 'staff' existentes pasan a entrenador (decisión del dueño).
update public.profiles set role = 'trainer' where role = 'staff';

-- 2) Guardias de datos: administrador o caja, con MFA. El entrenador queda fuera.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists(select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'cashier'));
$$;

create or replace function public.crm_is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists(select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'cashier'));
$$;

-- 3) Sólo administrador: planes, clases, entrenadores y horarios.
drop policy if exists "planes: el staff escribe" on public.plans;
create policy "planes: el admin escribe" on public.plans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "clases: el staff escribe" on public.classes;
create policy "clases: el admin escribe" on public.classes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Staff can write coaches" on public.coaches;
drop policy if exists "profes: el staff escribe" on public.coaches;
create policy "profes: el admin escribe" on public.coaches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "horarios: el staff escribe" on public.sessions;
create policy "horarios: el admin escribe" on public.sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4) Sólo administrador: reporte de deudas e importación masiva de clientes.
create or replace function public.finance_debt_report(p_section text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_section not in ('summary', 'receivables') or p_section is null then raise exception 'INVALID_FINANCE_SECTION'; end if;
  return public.finance_read(p_section, 30);
end $$;
revoke all on function public.finance_debt_report(text) from public, anon, authenticated;
grant execute on function public.finance_debt_report(text) to authenticated;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.crm_import_client(jsonb)'::regprocedure);
  if position('if not public.crm_is_staff() then' in v_def) = 0 then
    raise exception 'CRM_IMPORT_GUARD_NOT_FOUND';
  end if;
  execute replace(v_def, 'if not public.crm_is_staff() then', 'if not public.is_admin() then');
end $$;

-- 5) Entrenador: lista de sus clientes activos con nombre y asistencia. Sin teléfono, correo ni notas.
create or replace function public.trainer_roster()
returns table(client_id uuid, full_name text, visits_30d integer, visited_today boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_today date := (now() at time zone 'America/Managua')::date;
begin
  if not public.is_trainer() then raise exception 'AUTH'; end if;
  return query
    select c.id, c.full_name,
      (select count(*)::int from public.client_visits v
         where v.client_id = c.id and v.local_day > v_today - 30 and v.local_day <= v_today),
      exists(select 1 from public.client_visits v where v.client_id = c.id and v.local_day = v_today)
    from public.gym_clients c
    where c.status = 'active'
    order by lower(c.full_name);
end $$;
revoke all on function public.trainer_roster() from public, anon;
grant execute on function public.trainer_roster() to authenticated;

-- 6) Bitácora de cambios de rol (sólo administrador lee).
create table if not exists public.role_changes (
  id bigint generated always as identity primary key,
  target_id uuid not null references public.profiles(id) on delete cascade,
  old_role text not null,
  new_role text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.role_changes enable row level security;
revoke all on public.role_changes from anon, authenticated;
grant select on public.role_changes to authenticated;
drop policy if exists role_changes_admin_read on public.role_changes;
create policy role_changes_admin_read on public.role_changes
  for select to authenticated using (public.is_admin());

-- 7) Asignación de roles desde el panel del administrador.
create or replace function public.admin_set_role(p_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_old text; v_admins integer;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_role not in ('member', 'cashier', 'trainer', 'admin') then raise exception 'INVALID_ROLE'; end if;
  if p_id is null or p_id = auth.uid() then raise exception 'SELF_ROLE_CHANGE'; end if;
  select role::text into v_old from public.profiles where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old = p_role then return; end if;
  if v_old = 'admin' then
    select count(*) into v_admins from public.profiles where role = 'admin';
    if v_admins <= 1 then raise exception 'LAST_ADMIN'; end if;
  end if;
  update public.profiles set role = p_role::public.user_role where id = p_id;
  insert into public.role_changes(target_id, old_role, new_role, changed_by)
    values (p_id, v_old, p_role, auth.uid());
end $$;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
