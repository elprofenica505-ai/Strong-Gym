-- 00053 · Corrección de la altura de la ficha (solo administrador)
--
-- La altura de la ficha (gym_clients.height_cm, ver 00052) no se cambia desde las mediciones.
-- Esta función es la única vía para corregirla:
--  - Solo el administrador con sesión verificada (is_admin: admin + aal2).
--  - Exige un motivo de al menos 5 caracteres.
--  - Registra el cambio en client_events (acción 'height_corrected') con valor anterior, nuevo y motivo.
--  - No modifica mediciones anteriores (son de solo lectura).
--
-- Reversión (copiar y pegar si hiciera falta):
--   drop function if exists public.admin_corregir_altura(uuid, numeric, text);

begin;

create or replace function public.admin_corregir_altura(p_client uuid, p_height numeric, p_motivo text)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old numeric;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_height is null or p_height <= 0 or p_height > 250 then raise exception 'ALTURA_INVALIDA'; end if;
  if v_motivo is null or length(v_motivo) < 5 then raise exception 'MOTIVO_REQUERIDO'; end if;

  select height_cm into v_old from public.gym_clients where id = p_client for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old = p_height then return v_old; end if;

  update public.gym_clients set height_cm = p_height where id = p_client;
  insert into public.client_events(client_id, action, details, actor_id)
    values (p_client, 'height_corrected',
            jsonb_build_object('from', v_old, 'to', p_height, 'reason', v_motivo),
            auth.uid());
  return p_height;
end $$;

revoke all on function public.admin_corregir_altura(uuid, numeric, text) from public, anon;
grant execute on function public.admin_corregir_altura(uuid, numeric, text) to authenticated;

commit;
