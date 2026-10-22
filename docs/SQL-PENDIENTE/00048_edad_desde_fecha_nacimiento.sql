-- 00048 EDAD DESDE LA FECHA DE NACIMIENTO (sólo lectura, sin cambios de datos).
-- ESTADO: APLICADA EN SUPABASE (proyecto hcnuepdxmbsmlzdmvwhx) con autorización del dueño.
-- Requiere 00047.
--
-- El cliente ya no escribe su edad en la calculadora: la calcula el servidor desde gym_clients.birthdate.
-- Devuelve null si no hay fecha de nacimiento. Cliente: sólo su propia ficha. Personal: sólo si
-- progress_can_read_client(p_client) lo permite (mismo criterio que nutrition_get).

begin;
set local lock_timeout = '5s';

create or replace function public.client_age_years(p_client uuid default null)
returns integer language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_client uuid; v_bd date; v_own boolean;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if p_client is null then
    select id into v_client from public.gym_clients where profile_id = auth.uid() limit 1;
  else
    v_client := p_client;
  end if;
  if v_client is null then return null; end if;
  v_own := exists (select 1 from public.gym_clients where id = v_client and profile_id = auth.uid());
  if not (v_own or public.progress_can_read_client(v_client)) then raise exception 'AUTH'; end if;
  select birthdate into v_bd from public.gym_clients where id = v_client;
  if v_bd is null then return null; end if;
  return date_part('year', age((now() at time zone 'America/Managua')::date, v_bd))::int;
end;
$$;

revoke all on function public.client_age_years(uuid) from public, anon;
grant execute on function public.client_age_years(uuid) to authenticated;

commit;
