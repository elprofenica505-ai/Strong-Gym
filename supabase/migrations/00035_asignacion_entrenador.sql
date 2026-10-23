-- 00035 ASIGNACIÓN ENTRENADOR-CLIENTE. ESTADO: APLICADO EN SUPABASE (proyecto hcnuepdxmbsmlzdmvwhx) tras prueba local 59/59.
-- Requiere 00034 (roles caja/entrenador, is_admin/is_cashier/is_trainer, is_staff sin entrenador).
--
-- Reglas:
-- - El entrenador sólo ve a los clientes con acceso APROBADO para él (trainer_roster).
-- - Pedir acceso: el entrenador para sí mismo, o caja en nombre de un entrenador.
-- - Interruptor: el administrador activa o desactiva la búsqueda y los pedidos del entrenador (desactivado por defecto).
-- - Caja NO aprueba. Sólo el administrador (con MFA) aprueba, rechaza o revoca.
-- - Todas las escrituras van por funciones; las tablas no admiten INSERT/UPDATE/DELETE directo.
-- - El entrenador busca clientes por nombre sólo para pedirlos: devuelve id, nombre y su estado. Sin contacto.

begin;
set local lock_timeout = '5s';

-- 0) Interruptor del administrador: el entrenador puede buscar y pedir clientes sólo si está activo.
--    Desactivado por defecto. Lo cambia el administrador con MFA desde staff_permissions (00033).
--    Desactivarlo NO quita los clientes ya aprobados; sólo impide nuevos pedidos y búsquedas del entrenador.
insert into public.staff_permissions(key, enabled)
values ('trainer_can_request_clients', false)
on conflict (key) do nothing;

-- 1) Tabla de accesos (una fila por pedido; estado en la fila).
create table if not exists public.trainer_client_access (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.profiles(id) on delete cascade,
  client_id    uuid not null references public.gym_clients(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_via text not null check (requested_via in ('trainer', 'cashier')),
  reason       text check (reason is null or length(reason) <= 300),
  created_at   timestamptz not null default now(),
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz
);

-- Como máximo un pedido abierto (pendiente o aprobado) por entrenador y cliente.
create unique index if not exists trainer_client_access_open_idx
  on public.trainer_client_access (trainer_id, client_id)
  where status in ('pending', 'approved');
create index if not exists trainer_client_access_trainer_idx
  on public.trainer_client_access (trainer_id, status);

alter table public.trainer_client_access enable row level security;
revoke all on public.trainer_client_access from anon, authenticated;
grant select on public.trainer_client_access to authenticated;

-- Lectura: administrador y caja ven todo; el entrenador ve sólo sus propias filas.
drop policy if exists trainer_access_read on public.trainer_client_access;
create policy trainer_access_read on public.trainer_client_access
  for select to authenticated
  using (
    public.is_admin()
    or public.is_cashier()
    or (public.is_trainer() and trainer_id = auth.uid())
  );

-- Lectura del interruptor desde funciones (el entrenador no lee staff_permissions directamente).
create or replace function public.trainer_request_enabled()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select enabled from public.staff_permissions where key = 'trainer_can_request_clients'), false);
$$;
revoke all on function public.trainer_request_enabled() from public, anon;
grant execute on function public.trainer_request_enabled() to authenticated;

-- 2) Pedir acceso: entrenador (para sí mismo) o caja (en nombre de un entrenador).
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

  perform pg_advisory_xact_lock(hashtextextended(p_trainer::text || ':' || p_client::text, 0));
  select id, status into v_existing from public.trainer_client_access
    where trainer_id = p_trainer and client_id = p_client and status in ('pending', 'approved');
  if found then
    if v_existing.status = 'approved' then raise exception 'ALREADY_APPROVED'; end if;
    return v_existing.id;  -- pedido pendiente: no se duplica
  end if;

  insert into public.trainer_client_access(trainer_id, client_id, requested_by, requested_via, reason)
    values (p_trainer, p_client, v_caller,
            case when public.is_trainer() then 'trainer' else 'cashier' end, p_reason)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_trainer_access(uuid, uuid, text) from public, anon;
grant execute on function public.request_trainer_access(uuid, uuid, text) to authenticated;

-- 3) Decisión: sólo administrador con MFA.
create or replace function public.admin_decide_trainer_access(p_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_old text;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_decision not in ('approved', 'rejected', 'revoked') then raise exception 'INVALID_DECISION'; end if;
  select status into v_old from public.trainer_client_access where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_decision in ('approved', 'rejected') and v_old <> 'pending' then raise exception 'INVALID_STATE'; end if;
  if p_decision = 'revoked' and v_old <> 'approved' then raise exception 'INVALID_STATE'; end if;
  update public.trainer_client_access
    set status = p_decision, decided_by = auth.uid(), decided_at = now()
    where id = p_id;
end $$;
revoke all on function public.admin_decide_trainer_access(uuid, text) from public, anon;
grant execute on function public.admin_decide_trainer_access(uuid, text) to authenticated;

-- 4) Lista del entrenador: sólo clientes aprobados para él. Sin teléfono, correo ni notas.
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
    from public.trainer_client_access a
    join public.gym_clients c on c.id = a.client_id
    where a.trainer_id = auth.uid() and a.status = 'approved' and c.status = 'active'
    order by lower(c.full_name);
end $$;
revoke all on function public.trainer_roster() from public, anon;
grant execute on function public.trainer_roster() to authenticated;

-- 5) Búsqueda para pedir acceso: sólo id, nombre y estado propio. Máximo 10. Sin contacto.
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
      and lower(c.full_name) like '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by lower(c.full_name)
    limit 10;
end $$;
revoke all on function public.trainer_search_clients(text) from public, anon;
grant execute on function public.trainer_search_clients(text) to authenticated;

notify pgrst, 'reload schema';
commit;
