-- 00065 · Generar sesiones futuras desde Operación (OP-04)
--
-- Problema: `generate_week_sessions()` ya crea la grilla de una semana sin
-- duplicar y respeta `classes.is_active`, pero después del endurecimiento de
-- accesos quedó reservada a mantenimiento SQL. Operación no tenía ninguna
-- acción para extender el calendario y las sesiones futuras terminaban el
-- 5 de noviembre de 2026.
--
-- Regla de esta tanda:
--   * Solo administración con MFA puede generar sesiones desde la app.
--   * Se reutiliza la plantilla existente; no se crea una segunda grilla.
--   * Se generan semanas completas desde el próximo lunes, sin crear
--     sesiones pasadas ni duplicar las que ya existen.
--   * Un candado por transacción ordena dos generaciones simultáneas.
--   * No se cancelan ni modifican sesiones o reservas ya existentes.
--
-- Reversión segura: eliminar `admin_generate_future_sessions()`. Las
-- sesiones ya generadas se conservan y `generate_week_sessions()` sigue
-- disponible solo para mantenimiento autorizado fuera de la API.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.classes') is null
     or to_regclass('public.sessions') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.generate_week_sessions(date)') is null
     or not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'classes'
          and column_name = 'is_active'
          and data_type = 'boolean'
     )
     or not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'sessions'
          and column_name = 'class_id'
          and data_type = 'text'
     )
     or not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'sessions'
          and column_name = 'starts_at'
          and data_type = 'timestamp with time zone'
     )
     or not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'sessions'
          and column_name = 'status'
     ) then
    raise exception 'FUTURE_SESSIONS_PREREQUISITE_MISSING';
  end if;
end $$;

create or replace function public.admin_generate_future_sessions(
  p_weeks integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_today date := (now() at time zone 'America/Managua')::date;
  v_first_monday date;
  v_last_sunday date;
  v_created integer := 0;
  v_week_created integer;
  v_scheduled integer;
  v_offset integer;
begin
  if not public.is_admin() then
    raise exception 'AUTH';
  end if;

  if p_weeks is null or p_weeks < 1 or p_weeks > 8 then
    raise exception 'INVALID_FUTURE_WEEKS';
  end if;

  -- Dos administraciones pueden tocar el botón a la vez. La segunda espera
  -- a la primera y luego encuentra las sesiones ya creadas, sin duplicar.
  perform pg_advisory_xact_lock(
    hashtext('strong_gym_admin_generate_future_sessions')
  );

  -- Solo semanas completas futuras: la semana actual ya debió quedar
  -- generada en el ciclo anterior y así nunca se inventan sesiones pasadas.
  v_first_monday := date_trunc('week', v_today::timestamp)::date + 7;
  v_last_sunday := v_first_monday + (p_weeks * 7 - 1);

  for v_offset in 0..p_weeks - 1 loop
    v_week_created := public.generate_week_sessions(
      v_first_monday + (v_offset * 7)
    );
    v_created := v_created + coalesce(v_week_created, 0);
  end loop;

  select count(*)::int into v_scheduled
    from public.sessions
   where status = 'scheduled'
     and starts_at >= (
       v_first_monday::timestamp at time zone 'America/Managua'
     )
     and starts_at < (
       (v_last_sunday + 1)::timestamp at time zone 'America/Managua'
     );

  return jsonb_build_object(
    'weeks', p_weeks,
    'first_monday', v_first_monday,
    'last_sunday', v_last_sunday,
    'created_count', v_created,
    'scheduled_count', v_scheduled
  );
end;
$$;

revoke all on function public.admin_generate_future_sessions(integer)
  from public, anon, authenticated;
grant execute on function public.admin_generate_future_sessions(integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;
