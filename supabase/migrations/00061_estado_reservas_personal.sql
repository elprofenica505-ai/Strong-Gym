-- 00061 · Estado administrativo de reservas (OP-01)
--
-- Problema: la pantalla de Operación marcaba asistencia, inasistencia y
-- cancelación solo en React. Al recargar, la reserva volvía a su estado real.
--
-- Solución acotada:
--   * `staff_set_booking_status()` es la única vía de escritura administrativa.
--   * Solo administración o caja con MFA (`crm_is_staff()` = rol + AAL2).
--   * `cancelled` es terminal desde esta vía; un cliente puede volver a
--     reservar con `book_session()` si la sesión sigue disponible.
--   * Marcar de nuevo el mismo estado es idempotente: no reescribe la fila.
--   * `p_expected_status` evita pisar un cambio hecho por otra persona.
--   * Al pasar de `no_show` a `attended` se vuelve a comprobar el cupo,
--     bloqueando primero la sesión igual que `book_session()`.
--   * Se retiran de `bookings` los grants/políticas de escritura directa
--     heredadas; las escrituras quedan en las RPC existentes y esta RPC.
--
-- Reversión segura: eliminar solo la función nueva. No hace falta revertir
-- estados ni datos:
--   drop function if exists public.staff_set_booking_status(uuid, text, text);
-- Volver a abrir escritura directa requeriría una migración deliberada; no
-- forma parte de la reversión recomendada.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.bookings') is null
     or to_regclass('public.sessions') is null
     or to_regprocedure('public.crm_is_staff()') is null then
    raise exception 'BOOKING_STATUS_PREREQUISITE_MISSING';
  end if;
end $$;

create or replace function public.staff_set_booking_status(
  p_booking_id uuid,
  p_status text,
  p_expected_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_session_id text;
  v_session public.sessions;
  v_booking public.bookings;
  v_previous_status public.booking_status;
  v_occupied integer;
begin
  if not public.crm_is_staff() then
    raise exception 'AUTH';
  end if;

  if p_booking_id is null
     or p_status is null
     or p_status not in ('attended', 'no_show', 'cancelled')
     or (
       p_expected_status is not null
       and p_expected_status not in ('confirmed', 'cancelled', 'attended', 'no_show')
     ) then
    raise exception 'INVALID_STATUS';
  end if;

  select session_id into v_session_id
    from public.bookings
   where id = p_booking_id;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  -- Mismo orden de bloqueo que book_session(): primero la sesión y después
  -- la reserva. Así el control de cupo no compite a ciegas con una reserva.
  select * into v_session
    from public.sessions
   where id = v_session_id
   for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_previous_status := v_booking.status;

  -- Reintento seguro: una respuesta perdida o un doble clic no reescribe
  -- `cancelled_at` ni convierte el segundo intento en un error falso.
  if v_previous_status::text = p_status then
    return jsonb_build_object(
      'id', v_booking.id,
      'session_id', v_booking.session_id,
      'status', v_booking.status,
      'previous_status', v_previous_status,
      'changed', false,
      'cancelled_at', v_booking.cancelled_at
    );
  end if;

  if p_expected_status is not null
     and v_previous_status::text <> p_expected_status then
    raise exception 'STALE_STATUS';
  end if;

  if v_previous_status = 'cancelled' then
    raise exception 'INVALID_TRANSITION';
  end if;

  if v_session.status <> 'scheduled' and p_status <> 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  end if;

  -- Una sesión que ya terminó no se "cancela" hacia atrás: corresponde
  -- corregir la reserva como asistida o ausente.
  if p_status = 'cancelled' and v_session.ends_at <= now() then
    raise exception 'SESSION_ENDED';
  end if;

  -- `attended` ocupa cupo igual que `confirmed`. Solo hay que comprobarlo
  -- cuando se vuelve desde un estado que no ocupaba (`no_show`).
  if p_status = 'attended'
     and v_previous_status not in ('confirmed', 'attended') then
    select count(*)::integer into v_occupied
      from public.bookings
     where session_id = v_session.id
       and id <> v_booking.id
       and status in ('confirmed', 'attended');

    if v_occupied >= v_session.capacity then
      raise exception 'FULL';
    end if;
  end if;

  update public.bookings
     set status = p_status::public.booking_status,
         cancelled_at = case
           when p_status = 'cancelled' then now()
           else null
         end
   where id = v_booking.id
  returning * into v_booking;

  return jsonb_build_object(
    'id', v_booking.id,
    'session_id', v_booking.session_id,
    'status', v_booking.status,
    'previous_status', v_previous_status,
    'changed', true,
    'cancelled_at', v_booking.cancelled_at
  );
end;
$$;

revoke all on function public.staff_set_booking_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_booking_status(uuid, text, text)
  to authenticated;

-- La lectura sigue por la política vigente; ninguna escritura del cliente va
-- directo a la tabla. Las RPC SECURITY DEFINER no necesitan estos grants.
alter table public.bookings enable row level security;
drop policy if exists "reservas: cancelar la propia" on public.bookings;
drop policy if exists "reservas: el staff gestiona" on public.bookings;
revoke all on table public.bookings from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.bookings from authenticated;
grant select on table public.bookings to authenticated;

notify pgrst, 'reload schema';
commit;
