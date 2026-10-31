-- 00084 · Buscar y paginar todo el historial de movimientos desde el servidor
--
-- Qué faltaba (FIN-05): la pantalla de Caja leía los **últimos 30** movimientos
-- y los filtraba en el navegador. Eso alcanza para mirar el día, pero no para
-- encontrar un cobro viejo: el movimiento existía y la pantalla no podía
-- mostrarlo. "Buscar" solo buscaba dentro de esos 30.
--
-- Qué agrega esta migración:
--   `finance_movements_page(...)` devuelve, en una sola consulta, la cantidad
--   total que cumple los filtros y **solo la página pedida** (25 por defecto).
--   Filtra por búsqueda de texto (concepto, notas, nombre del cliente y del
--   socio), tipo, estado, moneda y método de pago, y ordena siempre igual
--   (`occurred_at desc, id desc`) para que la paginación no repita ni saltee
--   filas.
--
-- Reglas de seguridad:
--   · Devuelve el mismo perfil que ya lee Caja: `crm_is_staff()` (sesión con
--     segundo factor y rol de administración o caja). Sin eso: `AUTH`.
--   · `p_hide_expenses` lo manda el servidor cuando el interruptor de gastos
--     de caja está apagado. No se confía en el navegador para ocultar egresos:
--     se excluyen en la consulta y tampoco se cuentan en el total.
--   · La búsqueda escapa `%`, `_` y `\`: escribir un comodín no cambia el
--     resultado ni permite traer todo.
--   · Es de solo lectura: no escribe, no bloquea filas y no borra nada.
--
-- Qué NO cambia: la RLS de `transactions` ni sus políticas, las funciones de
-- escritura, los comprobantes, los reportes ni las exportaciones (esas ya
-- leían por páginas). Ninguna tabla ni columna nueva.
--
-- Reversible: `drop function public.finance_movements_page(text, text, text,
-- text, text, boolean, integer, integer);` deja el sistema como estaba. No se
-- borra ni se migra ningún dato.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.transactions') is null
     or to_regclass('public.gym_clients') is null
     or to_regclass('public.finance_voids') is null
     or to_regprocedure('public.crm_is_staff()') is null then
    raise exception 'MOVEMENTS_PREREQUISITE_MISSING';
  end if;
  -- Las columnas que lee la función. Si el modelo de movimientos cambia otra
  -- vez, esto corta al aplicar el SQL y no en la cara del dueño.
  if exists (
    select 1
    from unnest(array[
      'id', 'type', 'status', 'occurred_at', 'amount', 'currency',
      'amount_nio', 'fx_used', 'method_id', 'account_id', 'member_id',
      'category_id', 'concept', 'notes', 'created_by', 'client_id'
    ]) required(column_name)
    where not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.transactions'::regclass
        and a.attname = required.column_name
        and a.attnum > 0
        and not a.attisdropped
    )
  ) then
    raise exception 'MOVEMENTS_COLUMNS_MISSING';
  end if;
end $$;

-- El historial se ordena y se pagina por fecha: el índice ya existe
-- (`transactions_occurred_idx`). Este otro acompaña el desempate por `id`,
-- que es lo que evita filas repetidas entre páginas.
create index if not exists transactions_occurred_id_idx
  on public.transactions (occurred_at desc, id desc);

create or replace function public.finance_movements_page(
  p_search text default '',
  p_direction text default '',
  p_status text default '',
  p_currency text default '',
  p_method text default 'all',
  p_hide_expenses boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := btrim(coalesce(p_search, ''));
  v_pattern text;
  v_direction text := nullif(btrim(coalesce(p_direction, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_currency text := nullif(btrim(coalesce(p_currency, '')), '');
  v_method text := nullif(btrim(coalesce(p_method, '')), '');
  v_total integer;
  v_rows jsonb;
begin
  if not public.crm_is_staff() then
    raise exception 'AUTH';
  end if;

  if char_length(v_search) > 80 then
    raise exception 'INVALID_SEARCH';
  end if;
  -- Los valores válidos se leen del enum real: si mañana se agrega un tipo de
  -- movimiento, esta función lo acepta sin tocar el código.
  if v_direction is not null
     and v_direction not in (
       select unnest(enum_range(null::public.transaction_type))::text
     ) then
    raise exception 'INVALID_DIRECTION';
  end if;
  -- `reversed` no está en el enum de la base pero sí en la lista de la
  -- pantalla (movimientos revertidos del modelo anterior): se acepta y
  -- devuelve lo que haya, en vez de un error por una opción visible.
  if v_status is not null
     and v_status <> 'reversed'
     and v_status not in (
       select unnest(enum_range(null::public.transaction_status))::text
     ) then
    raise exception 'INVALID_STATUS';
  end if;
  -- Las monedas del gimnasio son las mismas dos que elige el navegador y que
  -- acepta el cobro. Se listan acá a propósito: la columna es de texto libre,
  -- así que validarla contra el enum de otra tabla sería adivinar.
  if v_currency is not null and v_currency not in ('NIO', 'USD') then
    raise exception 'INVALID_CURRENCY';
  end if;

  -- Comodines literales: sin esto, buscar "%" traería todo el historial.
  v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- Total y página en una sola consulta: el CTE no se puede reutilizar entre
  -- dos sentencias, y contar dos veces podría dar números distintos si alguien
  -- cobra en el medio.
  with filtered as (
    select
      t.id, t.occurred_at, t.type, t.status, t.amount, t.currency,
      t.fx_used, t.amount_nio, t.method_id, t.account_id, t.member_id,
      t.category_id, t.concept, t.notes, t.created_by,
      c.full_name as client_name,
      p.full_name as member_name,
      v.reason as voided_reason
    from public.transactions t
    left join public.gym_clients c on c.id = t.client_id
    left join public.profiles p on p.id = t.member_id
    left join public.finance_voids v on v.original_id = t.id
    where (not coalesce(p_hide_expenses, false) or t.type <> 'expense')
      and (v_direction is null or t.type::text = v_direction)
      and (v_status is null or t.status::text = v_status)
      and (v_currency is null or t.currency::text = v_currency)
      and (
        v_method is null
        or v_method = 'all'
        or (v_method = 'none' and t.method_id is null)
        or t.method_id = v_method
      )
      and (
        v_search = ''
        or t.concept ilike v_pattern
        or coalesce(t.notes, '') ilike v_pattern
        or coalesce(c.full_name, '') ilike v_pattern
        or coalesce(p.full_name, '') ilike v_pattern
      )
  ), page as (
    select * from filtered
    order by occurred_at desc, id desc
    limit v_limit offset v_offset
  )
  select
    (select count(*) from filtered)::integer,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', page.id,
            'occurred_at', page.occurred_at,
            -- El panel llama «dirección» a lo que la base guarda como tipo.
            'direction', page.type,
            'status', page.status,
            'amount', page.amount,
            'currency', page.currency,
            'fx_rate', page.fx_used,
            'base_amount', page.amount_nio,
            'payment_method_id', page.method_id,
            'account_id', page.account_id,
            'member_id', page.member_id,
            'member', case
              when page.member_name is null then null
              else jsonb_build_object('full_name', page.member_name)
            end,
            'expense_category_id', page.category_id,
            'concept', page.concept,
            'notes', page.notes,
            'created_by', page.created_by,
            'client', case
              when page.client_name is null then null
              else jsonb_build_object('full_name', page.client_name)
            end,
            'voided_reason', page.voided_reason
          )
          order by page.occurred_at desc, page.id desc
        )
        from page
      ),
      '[]'::jsonb
    )
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows
  );
end $$;

revoke all on function public.finance_movements_page(text, text, text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.finance_movements_page(text, text, text, text, text, boolean, integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
