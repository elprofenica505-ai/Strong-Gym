-- 00062 · Mensajes leídos/no leídos del personal (OP-02)
--
-- Problema: Operación cambiaba `readMessages` solo en React. Además, en
-- producción `public.messages` conserva la política pública de INSERT, pero
-- no tiene una política de SELECT para el personal ni una vía acotada para
-- actualizar `is_read`.
--
-- Solución acotada:
--   * `staff_set_message_read()` es la única vía para cambiar `is_read`.
--   * Solo administración o caja con MFA (`crm_is_staff()` = rol + AAL2).
--   * Marcar el estado que ya tiene el mensaje es idempotente.
--   * `p_expected_is_read` evita pisar un cambio hecho por otra persona.
--   * Se restablece la lectura para administración/caja y el formulario
--     público sigue pudiendo insertar, siempre como mensaje no leído.
--   * No se abren UPDATE ni DELETE directos sobre la tabla.
--
-- Reversión segura: eliminar solo la función nueva. No hace falta tocar los
-- mensajes ni revertir estados:
--   drop function if exists public.staff_set_message_read(uuid, boolean, boolean);
-- Volver a abrir escritura directa requeriría una migración deliberada; no
-- forma parte de la reversión recomendada.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.messages') is null
     or to_regprocedure('public.crm_is_staff()') is null
     or not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'messages'
          and column_name = 'is_read'
          and data_type = 'boolean'
     ) then
    raise exception 'MESSAGE_READ_PREREQUISITE_MISSING';
  end if;
end $$;

create or replace function public.staff_set_message_read(
  p_message_id uuid,
  p_is_read boolean,
  p_expected_is_read boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_message public.messages;
  v_previous_is_read boolean;
begin
  if not public.crm_is_staff() then
    raise exception 'AUTH';
  end if;

  if p_message_id is null or p_is_read is null then
    raise exception 'INVALID_READ_STATE';
  end if;

  select * into v_message
    from public.messages
   where id = p_message_id
   for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_previous_is_read := v_message.is_read;

  -- Reintento seguro: si el mensaje ya quedó en el estado pedido, la
  -- respuesta es éxito sin volver a escribir la fila.
  if v_previous_is_read = p_is_read then
    return jsonb_build_object(
      'id', v_message.id,
      'is_read', v_message.is_read,
      'previous_is_read', v_previous_is_read,
      'changed', false
    );
  end if;

  if p_expected_is_read is not null
     and v_previous_is_read is distinct from p_expected_is_read then
    raise exception 'STALE_READ_STATE';
  end if;

  update public.messages
     set is_read = p_is_read
   where id = v_message.id
  returning * into v_message;

  return jsonb_build_object(
    'id', v_message.id,
    'is_read', v_message.is_read,
    'previous_is_read', v_previous_is_read,
    'changed', true
  );
end;
$$;

revoke all on function public.staff_set_message_read(uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.staff_set_message_read(uuid, boolean, boolean)
  to authenticated;

alter table public.messages enable row level security;

-- El formulario público sigue insertando, pero nunca puede nacer como
-- mensaje ya leído. La validación completa del contenido sigue en la API.
drop policy if exists "consultas: cualquiera puede escribir" on public.messages;
drop policy if exists messages_insert_public_v1 on public.messages;
create policy messages_insert_public_v1
  on public.messages
  for insert
  to anon, authenticated
  with check (is_read = false);

-- Operación vuelve a leer las consultas, solo administración/caja con MFA.
drop policy if exists "consultas: el staff lee" on public.messages;
drop policy if exists messages_read_staff_v1 on public.messages;
create policy messages_read_staff_v1
  on public.messages
  for select
  to authenticated
  using (public.crm_is_staff());

-- Sin actualización ni borrado directos: `is_read` cambia solo por la RPC.
drop policy if exists "consultas: el staff actualiza" on public.messages;

revoke all on table public.messages from anon, authenticated;
grant insert on table public.messages to anon, authenticated;
grant select on table public.messages to authenticated;

notify pgrst, 'reload schema';
commit;
