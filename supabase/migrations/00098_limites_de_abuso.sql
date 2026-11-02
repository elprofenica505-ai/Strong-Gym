-- 00098 — Límites de abuso compartidos (SEG-07).
--
-- El problema real: el antispam de los formularios públicos llevaba el conteo
-- **en la memoria de cada instancia** del servidor. Con dos o más instancias
-- (o después de cada despliegue, que arranca procesos nuevos) el contador
-- volvía a cero: bastaba repartir el ataque entre instancias para que el
-- límite nunca se alcanzara. Además, cualquier ruta que escribe quedaba
-- expuesta a que la martillaran, porque el único freno era por IP y en memoria.
--
-- Qué agrega (sólo suma; no toca datos del gimnasio):
--   · `public.rate_limits`: un contador por `(scope, key)`. `key` **no** es una
--     IP ni un correo: es un hash SHA-256 calculado en el servidor, así que la
--     tabla no guarda datos personales.
--   · `public.rate_limit_hit(scope, key, limit, ventana)`: una sola sentencia
--     atómica que cuenta y responde si el pedido pasa. Con dos pedidos al mismo
--     tiempo, uno gana y el otro ve el conteo real (nada de carreras).
--   · RLS activo y **sin políticas**: nadie lee ni escribe la tabla directo;
--     sólo se llega por la función.
--
-- Reversión: `drop function public.rate_limit_hit(text,text,integer,integer);`
-- y `drop table public.rate_limits;`. La app vuelve sola al contador en memoria
-- cuando la función no existe, así que retirarla no tumba nada (los límites
-- pasan a ser por instancia, como antes).

begin;

create table if not exists public.rate_limits (
  scope text not null,
  key text not null,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  primary key (scope, key)
);

comment on table public.rate_limits is
  'Contadores de límite de abuso por (scope, key). La key es un hash: no guarda IPs ni correos.';

comment on column public.rate_limits.window_start is
  'Inicio de la ventana vigente. Al vencer, el conteo vuelve a 1.';

-- Nadie entra directo: sólo por la función.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

/**
 * Cuenta un pedido y dice si pasa.
 *
 * `p_key` tiene que venir ya hasheada desde el servidor: la función no sabe
 * (ni quiere saber) de quién se trata.
 *
 * Devuelve:
 *   allowed            → si el pedido puede seguir
 *   count              → cuántos van en esta ventana (incluido éste)
 *   limit              → el tope aplicado
 *   remaining          → cuántos quedan
 *   retry_after_seconds→ cuánto falta para que la ventana vuelva a cero
 */
create or replace function public.rate_limit_hit(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '3s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_row public.rate_limits;
begin
  -- Validaciones baratas: nada de ventanas absurdas ni claves gigantes.
  if p_scope is null or btrim(p_scope) = '' or length(p_scope) > 60 then
    raise exception 'rate_limit_hit: scope inválido' using errcode = '22023';
  end if;
  if p_key is null or btrim(p_key) = '' or length(p_key) > 120 then
    raise exception 'rate_limit_hit: key inválida' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'rate_limit_hit: límite fuera de rango' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'rate_limit_hit: ventana fuera de rango' using errcode = '22023';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  -- Una sola sentencia: cuenta e informa sin ventana de carrera.
  insert into public.rate_limits as rl (scope, key, window_start, count)
  values (p_scope, p_key, v_now, 1)
  on conflict (scope, key) do update
    set count = case when rl.window_start <= v_now - v_window then 1 else rl.count + 1 end,
        window_start = case when rl.window_start <= v_now - v_window then v_now else rl.window_start end
  returning * into v_row;

  -- Limpieza oportunista: 1 de cada 100 llamadas barre lo que ya venció hace
  -- más de un día, para que la tabla no crezca sin fin. No bloquea el pedido.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < v_now - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_row.count <= p_limit,
    'count', v_row.count,
    'limit', p_limit,
    'remaining', greatest(p_limit - v_row.count, 0),
    'retry_after_seconds',
      greatest(ceil(extract(epoch from (v_row.window_start + v_window - v_now)))::integer, 1)
  );
end;
$$;

comment on function public.rate_limit_hit(text, text, integer, integer) is
  'Cuenta un pedido por (scope, hash) y responde si pasa. Atómica: sirve con varias instancias del servidor.';

-- La app llama con la llave pública del proyecto y la sesión del usuario, así
-- que la función tiene que ser ejecutable por `anon` y `authenticated`. Lo que
-- no puede nadie es leer ni escribir la tabla: sólo esta función escribe.
revoke all on function public.rate_limit_hit(text, text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to anon, authenticated;

commit;
