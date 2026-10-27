-- 00063 · Alineación de mensajes leídos del personal (OP-02)
--
-- La migración 00062 ya dejó en producción las políticas y permisos
-- correctos de `public.messages`. Esta alineación acotada deja también el
-- cuerpo de `staff_set_message_read()` exactamente igual al contrato probado
-- junto con la API: error `AUTH`, una sola lectura con bloqueo de fila y
-- `lock_timeout` de 5 segundos.
--
-- No cambia mensajes, estados de lectura ni las políticas v1 ya creadas.
-- Solo elimina, si todavía existieran en una base reconstruida, las dos
-- políticas históricas de staff anteriores a la 00062.

begin;
set local lock_timeout = '5s';

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

drop policy if exists "consultas: el staff lee" on public.messages;
drop policy if exists "consultas: el staff actualiza" on public.messages;

notify pgrst, 'reload schema';
commit;
