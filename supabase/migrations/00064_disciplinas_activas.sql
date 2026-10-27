-- 00064 · Activación/desactivación persistente de disciplinas (OP-03)
--
-- Problema: Operación cambiaba `classActive` solo en React. Además, Horarios
-- y `book_session()` ignoraban `classes.is_active`, así que guardar el
-- interruptor no bastaba para ocultar la oferta ni frenar reservas nuevas.
--
-- Regla aprobada:
--   * Desactivar solo cambia `classes.is_active` a false. La aplicación deja
--     de ofrecer la disciplina y sus sesiones futuras, y `book_session()`
--     rechaza reservas nuevas con `CLASS_INACTIVE`.
--   * No se cancelan sesiones ni reservas ya hechas. Quedan intactas para su
--     dueño y para el personal.
--   * Reactivar vuelve a permitir reservas nuevas en sesiones programadas.
--   * Solo administración con MFA puede cambiar el estado. Caja no escribe
--     catálogos en la Fase B.
--
-- Reversión segura: eliminar `admin_set_class_active()` y restaurar la
-- versión histórica de `book_session()` de 00001_schema.sql. No hace falta
-- tocar disciplinas, sesiones ni reservas. Volver a abrir escritura directa
-- requeriría una migración deliberada; no forma parte de la reversión.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.classes') is null
     or to_regclass('public.sessions') is null
     or to_regclass('public.bookings') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.book_session(text)') is null
     or not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'classes'
          and column_name = 'id'
          and data_type = 'text'
     )
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
     ) then
    raise exception 'CLASS_ACTIVE_PREREQUISITE_MISSING';
  end if;
end $$;

create or replace function public.admin_set_class_active(
  p_class_id text,
  p_is_active boolean,
  p_expected_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_class public.classes;
  v_previous_is_active boolean;
begin
  if not public.is_admin() then
    raise exception 'AUTH';
  end if;

  if p_class_id is null
     or p_is_active is null
     or char_length(p_class_id) < 1
     or char_length(p_class_id) > 160
     or p_class_id ~ '\s' then
    raise exception 'INVALID_ACTIVE_STATE';
  end if;

  select * into v_class
    from public.classes
   where id = p_class_id
   for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_previous_is_active := v_class.is_active;

  -- Reintento seguro: si la disciplina ya quedó en el estado pedido, se
  -- confirma sin escribir de nuevo.
  if v_previous_is_active = p_is_active then
    return jsonb_build_object(
      'id', v_class.id,
      'is_active', v_class.is_active,
      'previous_is_active', v_previous_is_active,
      'changed', false
    );
  end if;

  if p_expected_is_active is not null
     and v_previous_is_active is distinct from p_expected_is_active then
    raise exception 'STALE_ACTIVE_STATE';
  end if;

  update public.classes
     set is_active = p_is_active
   where id = v_class.id
  returning * into v_class;

  return jsonb_build_object(
    'id', v_class.id,
    'is_active', v_class.is_active,
    'previous_is_active', v_previous_is_active,
    'changed', true
  );
end;
$$;

revoke all on function public.admin_set_class_active(text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_class_active(text, boolean, boolean)
  to authenticated;

-- Reservar: misma lógica histórica, con una única guarda nueva. Primero se
-- bloquea la sesión, igual que siempre; después se toma la disciplina FOR
-- SHARE para que una desactivación concurrente no pueda colarse a mitad de
-- una reserva. La guarda corre antes de crear o revivir una reserva, pero no
-- cambia las reservas que ya existen.
create or replace function public.book_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_session  public.sessions;
  v_booking  public.bookings;
  v_existing boolean := false;
  v_booked   integer;
  v_active   integer;
  v_max      integer := 3;
  v_class_is_active boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH: tenés que iniciar sesión';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: la clase no existe';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'CANCELLED: la clase fue cancelada';
  end if;

  if v_session.starts_at <= now() then
    raise exception 'PAST: la clase ya comenzó';
  end if;

  select is_active into v_class_is_active
    from public.classes
   where id = v_session.class_id
   for share;

  if not found or v_class_is_active is distinct from true then
    raise exception 'CLASS_INACTIVE: esta disciplina está desactivada';
  end if;

  select * into v_booking
  from public.bookings
  where session_id = p_session_id and user_id = v_user_id;

  if found then
    if v_booking.status in ('confirmed', 'attended') then
      raise exception 'ALREADY_BOOKED: ya tenés una reserva en esa clase';
    end if;
    v_existing := true;
  end if;

  select count(*) into v_booked
  from public.bookings
  where session_id = p_session_id and status in ('confirmed', 'attended');

  if v_booked >= v_session.capacity then
    raise exception 'FULL: no quedan lugares';
  end if;

  select count(*) into v_active
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  where b.user_id = v_user_id
    and b.status in ('confirmed', 'attended')
    and s.starts_at > now();

  if v_active >= v_max then
    raise exception 'LIMIT: ya tenés % reservas activas a la vez', v_max;
  end if;

  if v_existing then
    update public.bookings
      set status = 'confirmed', cancelled_at = null, created_at = now()
      where id = v_booking.id
      returning * into v_booking;
  else
    insert into public.bookings (session_id, user_id, status)
    values (p_session_id, v_user_id, 'confirmed')
    returning * into v_booking;
  end if;

  return jsonb_build_object(
    'id', v_booking.id,
    'session_id', v_booking.session_id,
    'status', v_booking.status
  );
end;
$$;

revoke all on function public.book_session(text)
  from public, anon, authenticated;
grant execute on function public.book_session(text) to authenticated;

alter table public.classes enable row level security;

-- La lectura del catálogo se conserva: la aplicación filtra la oferta activa
-- y las reservas ya hechas deben seguir pudiendo resolver su disciplina.
-- La escritura directa queda cerrada; is_active cambia solo por la RPC.
drop policy if exists "clases: lectura pública" on public.classes;
drop policy if exists classes_read_public_v1 on public.classes;
create policy classes_read_public_v1
  on public.classes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "clases: el staff escribe" on public.classes;
drop policy if exists "clases: el admin escribe" on public.classes;

revoke all on table public.classes from anon, authenticated;
grant select on table public.classes to anon, authenticated;

notify pgrst, 'reload schema';
commit;
