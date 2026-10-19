-- 00036 PERSONAL NO ES CLIENTE. ESTADO: BORRADOR PROBADO LOCALMENTE. NO APLICADO EN SUPABASE.
-- Requiere 00034 y 00035.
-- Problema: al registrarse, crm_profile_created crea una ficha de cliente para toda cuenta
-- nueva (rol member). Si luego se asigna rol de personal, la ficha seguía activa y aparecía
-- en la lista de clientes y en la búsqueda del entrenador.
-- Regla: una cuenta de personal (entrenador, caja o administrador) no es cliente.
--   - Su ficha vinculada pasa a 'cancelled' (no se borra: queda el historial).
--   - Al asignar un rol de personal, admin_set_role cancela la ficha automáticamente.
--   - La búsqueda y la solicitud de acceso ignoran fichas de personal.
-- Si se quita el rol de personal, la ficha NO se reactiva sola: la reactiva el administrador.

begin;
set local lock_timeout = '5s';

-- 1) Fichas ya existentes de cuentas de personal.
update public.gym_clients g
   set status = 'cancelled', updated_at = now()
  from public.profiles p
 where p.id = g.profile_id
   and p.role in ('trainer', 'cashier', 'admin')
   and g.status <> 'cancelled';

-- 2) Asignación de roles: al pasar a personal, la ficha se cancela en la misma transacción.
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
  if p_role in ('trainer', 'cashier', 'admin') then
    update public.gym_clients set status = 'cancelled', updated_at = now()
     where profile_id = p_id and status <> 'cancelled';
  end if;
  insert into public.role_changes(target_id, old_role, new_role, changed_by)
    values (p_id, v_old, p_role, auth.uid());
end $$;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- 3) La búsqueda no muestra fichas de personal.
create or replace function public.trainer_search_clients(p_query text)
returns table(client_id uuid, full_name text, my_status text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := lower(coalesce(trim(p_query), ''));
begin
  if not public.is_trainer() then raise exception 'AUTH'; end if;
  if not public.trainer_request_enabled() then raise exception 'PERMISSION_DISABLED'; end if;
  if length(v_q) < 3 then raise exception 'QUERY_TOO_SHORT'; end if;
  return query
    select c.id, c.full_name,
      (select a.status from public.trainer_client_access a
         where a.trainer_id = auth.uid() and a.client_id = c.id and a.status in ('pending', 'approved')
         order by a.created_at desc limit 1)
    from public.gym_clients c
    where c.status = 'active'
      and not exists (select 1 from public.profiles p
                       where p.id = c.profile_id and p.role in ('trainer', 'cashier', 'admin'))
      and lower(c.full_name) like '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by lower(c.full_name)
    limit 10;
end $$;
revoke all on function public.trainer_search_clients(text) from public, anon;
grant execute on function public.trainer_search_clients(text) to authenticated;

-- 4) No se puede pedir acceso a una ficha de personal.
create or replace function public.request_trainer_access(p_trainer uuid, p_client uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_caller uuid := auth.uid(); v_id uuid; v_status text; v_existing record;
begin
  if not (public.is_trainer() or public.is_cashier()) then raise exception 'AUTH'; end if;
  if public.is_trainer() and p_trainer is distinct from v_caller then raise exception 'AUTH'; end if;
  if public.is_trainer() and not public.trainer_request_enabled() then raise exception 'PERMISSION_DISABLED'; end if;
  if p_trainer is null or not exists(select 1 from public.profiles where id = p_trainer and role = 'trainer') then
    raise exception 'INVALID_TRAINER';
  end if;
  if p_reason is not null and length(p_reason) > 300 then raise exception 'INVALID_REASON'; end if;

  select status into v_status from public.gym_clients where id = p_client;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status <> 'active' then raise exception 'INACTIVE_CLIENT'; end if;
  if exists (select 1 from public.gym_clients g join public.profiles p on p.id = g.profile_id
              where g.id = p_client and p.role in ('trainer', 'cashier', 'admin')) then
    raise exception 'NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_trainer::text || ':' || p_client::text, 0));
  select id, status into v_existing from public.trainer_client_access
    where trainer_id = p_trainer and client_id = p_client and status in ('pending', 'approved');
  if found then
    if v_existing.status = 'approved' then raise exception 'ALREADY_APPROVED'; end if;
    return v_existing.id;
  end if;

  insert into public.trainer_client_access(trainer_id, client_id, requested_by, requested_via, reason)
    values (p_trainer, p_client, v_caller,
            case when public.is_trainer() then 'trainer' else 'cashier' end, p_reason)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_trainer_access(uuid, uuid, text) from public, anon;
grant execute on function public.request_trainer_access(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
