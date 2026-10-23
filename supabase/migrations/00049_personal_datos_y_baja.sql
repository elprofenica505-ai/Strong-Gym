-- 00049 PERSONAL: DATOS FORMALES, ALTA, EDICIÓN Y BAJA (sólo administrador con verificación en dos pasos).
-- ESTADO: APLICADA en producción (hcnuepdxmbsmlzdmvwhx) con autorización del dueño. Verificada: tablas, RLS, funciones y permisos.
-- Requiere 00033 (is_admin), 00034 (admin_set_role, role_changes) y 00036 (personal no es cliente).
--
-- Reglas:
-- - Sólo is_admin() (rol admin + aal2) lee o cambia datos del personal. Nadie escribe directo: sólo funciones.
-- - Alta/edición: staff_save(). Si la persona no tiene rol de personal, lo asigna con admin_set_role (bitácora de roles).
-- - Baja: staff_set_status(false, motivo). Marca la ficha como inactiva y bloquea el inicio de sesión
--   (auth.users.banned_until). No cambia el rol. Reactivar revierte ambas cosas.
-- - Auditoría (staff_audit): guarda quién, cuándo, qué acción y los NOMBRES de los campos cambiados, nunca sus valores.
-- - No se crean cuentas nuevas: la persona crea su cuenta primero y el administrador la da de alta.
--
-- Nota: banned_until existe en auth.users de Supabase. Una sesión ya abierta sigue válida hasta que vence su token
-- (normalmente una hora); no puede renovarla.

begin;
set local lock_timeout = '5s';

-- 1) Ficha formal del personal.
create table if not exists public.staff_members (
  profile_id         uuid primary key references public.profiles(id) on delete restrict,
  full_name          text not null check (char_length(btrim(full_name)) between 3 and 120),
  national_id        text not null check (national_id ~ '^[0-9]{3}-[0-9]{6}-[0-9]{4}[A-Z]$'),
  birth_date         date not null,
  phone              text not null check (char_length(btrim(phone)) between 8 and 20),
  address            text not null check (char_length(btrim(address)) between 5 and 250),
  emergency_name     text not null check (char_length(btrim(emergency_name)) between 3 and 120),
  emergency_phone    text not null check (char_length(btrim(emergency_phone)) between 8 and 20),
  position_title     text not null check (char_length(btrim(position_title)) between 2 and 80),
  hired_on           date not null,
  responsibilities   text check (responsibilities is null or char_length(responsibilities) <= 800),
  internal_notes     text check (internal_notes is null or char_length(internal_notes) <= 800),
  status             text not null default 'activo' check (status in ('activo', 'inactivo')),
  deactivated_on     date,
  deactivation_reason text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles(id) on delete set null,
  updated_at         timestamptz not null default now(),
  constraint staff_deactivation_consistent check (
    (status = 'activo' and deactivated_on is null and deactivation_reason is null)
    or (status = 'inactivo' and deactivated_on is not null and char_length(btrim(deactivation_reason)) >= 5)
  )
);

alter table public.staff_members enable row level security;
revoke all on public.staff_members from anon, authenticated;
grant select on public.staff_members to authenticated;
drop policy if exists staff_members_admin_read on public.staff_members;
create policy staff_members_admin_read on public.staff_members
  for select to authenticated using (public.is_admin());

-- 2) Auditoría sin valores sensibles.
create table if not exists public.staff_audit (
  id             bigint generated always as identity primary key,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  action         text not null check (action in ('alta', 'edicion', 'baja', 'reactivacion')),
  changed_fields text[] not null default '{}',
  changed_by     uuid references public.profiles(id) on delete set null,
  changed_at     timestamptz not null default now()
);
alter table public.staff_audit enable row level security;
revoke all on public.staff_audit from anon, authenticated;
grant select on public.staff_audit to authenticated;
drop policy if exists staff_audit_admin_read on public.staff_audit;
create policy staff_audit_admin_read on public.staff_audit
  for select to authenticated using (public.is_admin());

-- 3) Alta y edición.
create or replace function public.staff_save(p_profile uuid, p_role text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_today date := (now() at time zone 'America/Managua')::date;
  v_old public.staff_members;
  v_new public.staff_members;
  v_fields text[] := '{}';
  v_action text;
  v_name text; v_nid text; v_birth date; v_phone text; v_addr text; v_en text; v_ep text;
  v_pos text; v_hired date; v_resp text; v_notes text;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_profile is null or p_profile = auth.uid() then raise exception 'SELF_STAFF_CHANGE'; end if;
  if p_role not in ('trainer', 'cashier', 'admin') then raise exception 'INVALID_ROLE'; end if;
  if not exists (select 1 from public.profiles where id = p_profile) then raise exception 'NOT_FOUND'; end if;

  v_name  := btrim(coalesce(p_data->>'fullName', ''));
  v_nid   := btrim(coalesce(p_data->>'nationalId', ''));
  v_phone := btrim(coalesce(p_data->>'phone', ''));
  v_addr  := btrim(coalesce(p_data->>'address', ''));
  v_en    := btrim(coalesce(p_data->>'emergencyName', ''));
  v_ep    := btrim(coalesce(p_data->>'emergencyPhone', ''));
  v_pos   := btrim(coalesce(p_data->>'positionTitle', ''));
  v_resp  := nullif(btrim(coalesce(p_data->>'responsibilities', '')), '');
  v_notes := nullif(btrim(coalesce(p_data->>'internalNotes', '')), '');

  if char_length(v_name) < 3 or char_length(v_name) > 120 then raise exception 'NAME_INVALID'; end if;
  if v_nid !~ '^[0-9]{3}-[0-9]{6}-[0-9]{4}[A-Z]$' then raise exception 'NATIONAL_ID_INVALID'; end if;
  begin
    v_birth := (p_data->>'birthDate')::date;
    v_hired := (p_data->>'hiredOn')::date;
  exception when others then
    raise exception 'DATE_INVALID';
  end;
  if v_birth < date '1920-01-01' or v_birth > v_today - interval '18 years' then raise exception 'BIRTH_INVALID'; end if;
  if v_hired > v_today or v_hired < date '2000-01-01' then raise exception 'HIRE_DATE_INVALID'; end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 20 then raise exception 'PHONE_INVALID'; end if;
  if char_length(v_addr) < 5 or char_length(v_addr) > 250 then raise exception 'ADDRESS_INVALID'; end if;
  if char_length(v_en) < 3 or char_length(v_en) > 120 then raise exception 'EMERGENCY_NAME_INVALID'; end if;
  if char_length(v_ep) < 8 or char_length(v_ep) > 20 then raise exception 'EMERGENCY_PHONE_INVALID'; end if;
  if char_length(v_pos) < 2 or char_length(v_pos) > 80 then raise exception 'POSITION_INVALID'; end if;
  if v_resp is not null and char_length(v_resp) > 800 then raise exception 'RESPONSIBILITIES_TOO_LONG'; end if;
  if v_notes is not null and char_length(v_notes) > 800 then raise exception 'NOTES_TOO_LONG'; end if;

  -- Rol de personal: usa la misma regla y bitácora que el cambio de rol.
  if (select role::text from public.profiles where id = p_profile) is distinct from p_role then
    perform public.admin_set_role(p_profile, p_role);
  end if;

  select * into v_old from public.staff_members where profile_id = p_profile for update;
  if not found then
    v_action := 'alta';
    insert into public.staff_members(profile_id, full_name, national_id, birth_date, phone, address,
      emergency_name, emergency_phone, position_title, hired_on, responsibilities, internal_notes,
      created_by, updated_by)
    values (p_profile, v_name, v_nid, v_birth, v_phone, v_addr, v_en, v_ep, v_pos, v_hired, v_resp, v_notes,
      auth.uid(), auth.uid())
    returning * into v_new;
    v_fields := array['fullName','nationalId','birthDate','phone','address','emergencyName','emergencyPhone','positionTitle','hiredOn','responsibilities','internalNotes','role'];
  else
    v_action := 'edicion';
    update public.staff_members set
      full_name = v_name, national_id = v_nid, birth_date = v_birth, phone = v_phone, address = v_addr,
      emergency_name = v_en, emergency_phone = v_ep, position_title = v_pos, hired_on = v_hired,
      responsibilities = v_resp, internal_notes = v_notes, updated_by = auth.uid(), updated_at = now()
    where profile_id = p_profile
    returning * into v_new;
    if v_old.full_name is distinct from v_new.full_name then v_fields := array_append(v_fields, 'fullName'); end if;
    if v_old.national_id is distinct from v_new.national_id then v_fields := array_append(v_fields, 'nationalId'); end if;
    if v_old.birth_date is distinct from v_new.birth_date then v_fields := array_append(v_fields, 'birthDate'); end if;
    if v_old.phone is distinct from v_new.phone then v_fields := array_append(v_fields, 'phone'); end if;
    if v_old.address is distinct from v_new.address then v_fields := array_append(v_fields, 'address'); end if;
    if v_old.emergency_name is distinct from v_new.emergency_name then v_fields := array_append(v_fields, 'emergencyName'); end if;
    if v_old.emergency_phone is distinct from v_new.emergency_phone then v_fields := array_append(v_fields, 'emergencyPhone'); end if;
    if v_old.position_title is distinct from v_new.position_title then v_fields := array_append(v_fields, 'positionTitle'); end if;
    if v_old.hired_on is distinct from v_new.hired_on then v_fields := array_append(v_fields, 'hiredOn'); end if;
    if v_old.responsibilities is distinct from v_new.responsibilities then v_fields := array_append(v_fields, 'responsibilities'); end if;
    if v_old.internal_notes is distinct from v_new.internal_notes then v_fields := array_append(v_fields, 'internalNotes'); end if;
  end if;

  -- Nombre y teléfono visibles en el directorio.
  update public.profiles set full_name = v_name, phone = v_phone, updated_at = now() where id = p_profile;

  if v_action = 'edicion' and cardinality(v_fields) = 0 then
    return p_profile; -- sin cambios: no se escribe bitácora vacía
  end if;
  insert into public.staff_audit(profile_id, action, changed_fields, changed_by)
    values (p_profile, v_action, v_fields, auth.uid());
  return p_profile;
end;
$$;

-- 4) Baja y reactivación.
create or replace function public.staff_set_status(p_profile uuid, p_active boolean, p_reason text default null)
returns text language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_today date := (now() at time zone 'America/Managua')::date;
  v_role text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_admins integer;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_profile is null or p_profile = auth.uid() then raise exception 'SELF_STAFF_CHANGE'; end if;
  if not exists (select 1 from public.staff_members where profile_id = p_profile) then raise exception 'NOT_FOUND'; end if;
  select role::text into v_role from public.profiles where id = p_profile for update;

  if p_active then
    update public.staff_members set status = 'activo', deactivated_on = null, deactivation_reason = null,
      updated_by = auth.uid(), updated_at = now()
      where profile_id = p_profile;
    update auth.users set banned_until = null where id = p_profile;
    insert into public.staff_audit(profile_id, action, changed_fields, changed_by)
      values (p_profile, 'reactivacion', '{}', auth.uid());
    return 'activo';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then raise exception 'REASON_REQUIRED'; end if;
  if v_role = 'admin' then
    select count(*) into v_admins from public.profiles p
      join public.staff_members s on s.profile_id = p.id
      where p.role = 'admin' and s.status = 'activo';
    if v_admins <= 1 then raise exception 'LAST_ADMIN'; end if;
  end if;

  update public.staff_members set status = 'inactivo', deactivated_on = v_today, deactivation_reason = v_reason,
    updated_by = auth.uid(), updated_at = now()
    where profile_id = p_profile;
  update auth.users set banned_until = 'infinity'::timestamptz where id = p_profile;
  insert into public.staff_audit(profile_id, action, changed_fields, changed_by)
    values (p_profile, 'baja', '{status}', auth.uid());
  return 'inactivo';
end;
$$;

revoke all on function public.staff_save(uuid, text, jsonb), public.staff_set_status(uuid, boolean, text)
  from public, anon;
grant execute on function public.staff_save(uuid, text, jsonb), public.staff_set_status(uuid, boolean, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
