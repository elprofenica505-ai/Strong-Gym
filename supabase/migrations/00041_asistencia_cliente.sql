-- 00041 ASISTENCIA POR CLIENTE (día, semana y mes). ESTADO: APLICADA en Supabase (migración asistencia_cliente, 2026-10-21).
-- Requiere 00039 (progress_can_read_client) y 00040 no es necesaria.
-- Sólo agrega una función de lectura. No cambia tablas ni políticas.
--
-- Quién puede leer:
-- - Administrador y caja: cualquier cliente.
-- - Entrenador: sólo clientes con acceso aprobado (trainer_client_access).
-- - Cliente: sólo su propia asistencia (cuando p_client es null o es su ficha).
-- Sin permiso o sin ficha vinculada devuelve null; nunca datos ajenos.

begin;
set local lock_timeout = '5s';

create or replace function public.client_attendance(p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_client uuid;
  v_today date := (now() at time zone 'America/Managua')::date;
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;

  -- Cliente sin parámetro: su propia ficha.
  if p_client is null then
    select id into v_client from public.gym_clients where profile_id = auth.uid() limit 1;
  else
    v_client := p_client;
  end if;
  if v_client is null then return null; end if;

  -- Permiso: personal con acceso, o el propio cliente.
  if not (
    public.progress_can_read_client(v_client)
    or exists(select 1 from public.gym_clients where id = v_client and profile_id = auth.uid())
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'client_id', v_client,
    'today', v_today,
    'total_visits', (select count(*) from public.client_visits where client_id = v_client),
    'last_visit', (select max(local_day) from public.client_visits where client_id = v_client),
    'visits_30_days', (select count(*) from public.client_visits
                       where client_id = v_client and local_day > v_today - 30 and local_day <= v_today),
    'days', coalesce((select jsonb_agg(d order by d desc) from (
        select local_day::text as d from public.client_visits
        where client_id = v_client and local_day > v_today - 60 and local_day <= v_today
        order by local_day desc limit 60) x), '[]'::jsonb),
    -- Semanas (lunes a domingo), últimas 26.
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week_start', w.ws::text, 'visits', w.n) order by w.ws desc)
        from (select date_trunc('week', local_day)::date as ws, count(*)::int as n
              from public.client_visits
              where client_id = v_client and local_day > v_today - 182 and local_day <= v_today
              group by 1 order by 1 desc limit 26) w), '[]'::jsonb),
    -- Meses, últimos 12.
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m.mo, 'visits', m.n) order by m.mo desc)
        from (select to_char(local_day, 'YYYY-MM') as mo, count(*)::int as n
              from public.client_visits
              where client_id = v_client and local_day > v_today - 366 and local_day <= v_today
              group by 1 order by 1 desc limit 12) m), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.client_attendance(uuid) from public, anon;
grant execute on function public.client_attendance(uuid) to authenticated;

commit;
