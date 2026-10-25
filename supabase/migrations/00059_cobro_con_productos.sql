-- Cobro combinado de un servicio y productos desde la ficha del cliente.
--
-- Decisiones de esta tanda:
-- - El cliente siempre está seleccionado o creado con el alta rápida; no se
--   inventa un cliente genérico para ventas de mostrador.
-- - Se puede cobrar solo el servicio (flujo anterior), servicio + productos o
--   solo productos. Si hay productos, todo el cobro usa NIO, un método y una
--   cuenta, porque el catálogo de productos ya trabaja en córdobas.
-- - El servidor bloquea los productos en orden, comprueba precio y stock y
--   registra cada línea con finance_record_movement. Todo ocurre en una sola
--   transacción: si falla un producto, tampoco queda registrado el servicio.
-- - La referencia principal es idempotente. Reintentar el mismo payload
--   devuelve el mismo grupo; cambiarlo con la misma referencia es conflicto.
-- - Reversión: retirar primero el uso en la aplicación; después se pueden
--   eliminar finance_record_checkout, product_sale_catalog y la tabla de
--   grupos sin tocar transactions, finance_entries ni stock_movements.

begin;
set local lock_timeout = '5s';

create table if not exists public.finance_checkout_groups (
  request_id uuid primary key,
  client_id uuid not null references public.gym_clients(id) on delete restrict,
  payload jsonb not null,
  result jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists finance_checkout_groups_client_idx
  on public.finance_checkout_groups(client_id, created_at desc);

alter table public.finance_checkout_groups enable row level security;
revoke all on public.finance_checkout_groups from public, anon, authenticated;
grant select on public.finance_checkout_groups to authenticated;
drop policy if exists finance_checkout_groups_staff_read on public.finance_checkout_groups;
create policy finance_checkout_groups_staff_read
  on public.finance_checkout_groups for select to authenticated
  using (public.crm_is_staff());

-- La tabla nueva también debe quedar cerrada a escritura directa y sin
-- disparadores desconocidos para habilitar la escritura financiera.
create or replace function public.finance_writes_ready()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.crm_finance_layout() = 'bank_accounts_split'
    and not exists(
      select 1 from pg_trigger
      where tgrelid in (
        'public.transactions'::regclass,
        'public.bank_accounts'::regclass,
        'public.finance_entries'::regclass,
        'public.finance_checkout_groups'::regclass
      ) and not tgisinternal and tgenabled <> 'D'
    )
    and not exists(
      select 1 from unnest(array[
        'public.transactions',
        'public.bank_accounts',
        'public.finance_entries',
        'public.finance_checkout_groups'
      ]) as targets(tab)
      where has_table_privilege('authenticated', tab, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         or has_table_privilege('anon', tab, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    );
$$;
revoke all on function public.finance_writes_ready() from public, anon, authenticated;

-- Catálogo mínimo para la venta en recepción. No expone costo ni ganancia.
create or replace function public.product_sale_catalog()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  return jsonb_build_object('products', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'category', p.category,
      'subcategory', p.subcategory,
      'attributes', p.attributes,
      'price', p.price,
      'stock', s.stock,
      'low_stock', s.stock <= p.stock_min
    ) order by p.category, p.name)
    from public.products p
    cross join lateral (
      select coalesce(sum(qty), 0)::integer as stock
      from public.stock_movements sm
      where sm.product_id = p.id
    ) s
    where p.status = 'activo' and p.price > 0 and s.stock > 0
  ), '[]'::jsonb));
end;
$$;

create or replace function public.finance_record_checkout(
  p_request uuid,
  p_client uuid,
  p_service_amount numeric,
  p_service_concept text,
  p_currency text,
  p_method text,
  p_account text,
  p_fx numeric,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_actor uuid := auth.uid();
  v_payload jsonb;
  v_existing public.finance_checkout_groups;
  v_concept text := nullif(trim(coalesce(p_service_concept, '')), '');
  v_items jsonb := '[]'::jsonb;
  v_seen uuid[] := '{}';
  v_row record;
  v_product uuid;
  v_qty integer;
  v_unit_price numeric;
  v_product_name text;
  v_product_status text;
  v_product_price numeric;
  v_stock integer;
  v_line_total numeric;
  v_products_total numeric := 0;
  v_total numeric;
  v_child_request uuid;
  v_service_tx uuid;
  v_tx uuid;
  v_transaction_ids jsonb := '[]'::jsonb;
  v_receipts jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  if p_client is null then raise exception 'CLIENT_REQUIRED'; end if;
  if p_service_amount is null or p_service_amount < 0 or p_service_amount > 99999999
    or p_service_amount <> round(p_service_amount, 2)
    or p_currency is distinct from 'NIO'
    or p_method is null or length(trim(p_method)) not between 1 and 80
    or p_account is null or length(trim(p_account)) not between 1 and 80
    or p_fx is null or p_fx < 0.0001 or p_fx > 10000 or p_fx <> round(p_fx, 4) then
    raise exception 'INVALID_PAYMENT';
  end if;
  if p_service_amount > 0 and (v_concept is null or length(v_concept) not between 2 and 200) then
    raise exception 'INVALID_PAYMENT';
  end if;
  if p_service_amount = 0 then
    -- El concepto no se usa en la venta de solo productos; las líneas llevan
    -- el nombre de cada producto en su comprobante.
    v_concept := null;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'INVALID_ITEMS';
  end if;

  -- Normaliza y ordena el payload antes de bloquear productos. Ordenar por
  -- producto evita interbloqueos entre dos cobros simultáneos.
  for v_row in
    select item
    from jsonb_array_elements(p_items) as items(item)
    order by coalesce(item->>'product', '')
  loop
    if jsonb_typeof(v_row.item) <> 'object'
      or not (v_row.item ?& array['product', 'qty', 'unit_price'])
      or coalesce(v_row.item->>'product', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(v_row.item->>'qty', '') !~ '^[0-9]{1,4}$'
      or jsonb_typeof(v_row.item->'unit_price') <> 'number' then
      raise exception 'INVALID_ITEMS';
    end if;
    v_product := (v_row.item->>'product')::uuid;
    v_qty := (v_row.item->>'qty')::integer;
    v_unit_price := (v_row.item->>'unit_price')::numeric;
    if v_qty < 1 or v_qty > 1000
      or v_unit_price <= 0 or v_unit_price > 9999999
      or v_unit_price <> round(v_unit_price, 2)
      or v_product = any(v_seen) then
      raise exception 'INVALID_ITEMS';
    end if;
    v_seen := array_append(v_seen, v_product);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product', v_product,
      'qty', v_qty,
      'unit_price', v_unit_price
    ));
  end loop;

  v_payload := jsonb_build_object(
    'client', p_client,
    'service_amount', p_service_amount,
    'service_concept', v_concept,
    'currency', p_currency,
    'method', trim(p_method),
    'account', trim(p_account),
    'fx', p_fx,
    'items', v_items
  );

  perform pg_advisory_xact_lock(hashtextextended('checkout:' || p_request::text, 0));
  select * into v_existing
  from public.finance_checkout_groups
  where request_id = p_request;
  if found then
    if v_existing.payload is distinct from v_payload then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return v_existing.result;
  end if;
  if exists(select 1 from public.finance_entries where request_id = p_request) then
    raise exception 'REQUEST_CONFLICT';
  end if;
  if not public.finance_writes_ready() then
    raise exception 'FINANCE_REVIEW_REQUIRED';
  end if;

  perform 1 from public.gym_clients where id = p_client for share;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- Primero se bloquea y comprueba todo el inventario. Si algo falla, la
  -- transacción completa se revierte y no queda dinero registrado.
  for v_row in
    select item from jsonb_array_elements(v_items) as items(item)
  loop
    v_product := (v_row.item->>'product')::uuid;
    v_qty := (v_row.item->>'qty')::integer;
    v_unit_price := (v_row.item->>'unit_price')::numeric;
    select name, status, price
      into v_product_name, v_product_status, v_product_price
    from public.products
    where id = v_product
    for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_product_status <> 'activo' then raise exception 'PRODUCT_INACTIVE'; end if;
    if v_product_price <= 0 then raise exception 'INVALID_PRODUCT_PRICE'; end if;
    if v_product_price <> v_unit_price then raise exception 'PRICE_CHANGED'; end if;
    v_stock := public.product_stock_of(v_product);
    if v_stock < v_qty then raise exception 'SIN_STOCK'; end if;
    v_line_total := round(v_qty * v_product_price, 2);
    v_products_total := v_products_total + v_line_total;
    if v_products_total > 99999999 then raise exception 'INVALID_PAYMENT'; end if;
  end loop;

  v_total := p_service_amount + v_products_total;
  if v_total <= 0 or v_total > 99999999 then raise exception 'INVALID_PAYMENT'; end if;

  if p_service_amount > 0 then
    v_child_request := gen_random_uuid();
    v_service_tx := public.finance_record_movement(
      v_child_request,
      'service_income',
      p_client,
      p_service_amount,
      'NIO',
      trim(p_method),
      trim(p_account),
      v_concept,
      p_fx,
      null
    );
    v_transaction_ids := v_transaction_ids || jsonb_build_array(v_service_tx);
    v_receipts := v_receipts || jsonb_build_array(jsonb_build_object(
      'id', v_service_tx,
      'label', v_concept,
      'amount', p_service_amount
    ));
  end if;

  for v_row in
    select item from jsonb_array_elements(v_items) as items(item)
  loop
    v_product := (v_row.item->>'product')::uuid;
    v_qty := (v_row.item->>'qty')::integer;
    v_unit_price := (v_row.item->>'unit_price')::numeric;
    select name into v_product_name from public.products where id = v_product;
    v_line_total := round(v_qty * v_unit_price, 2);
    v_child_request := gen_random_uuid();
    v_tx := public.finance_record_movement(
      v_child_request,
      'service_income',
      p_client,
      v_line_total,
      'NIO',
      trim(p_method),
      trim(p_account),
      'Venta: ' || v_product_name || ' x' || v_qty,
      p_fx,
      null
    );
    insert into public.stock_movements(
      product_id, kind, qty, unit_price, client_id, transaction_id, request_id, created_by
    ) values (
      v_product, 'venta', -v_qty, v_unit_price, p_client, v_tx, v_child_request, v_actor
    );
    v_transaction_ids := v_transaction_ids || jsonb_build_array(v_tx);
    v_receipts := v_receipts || jsonb_build_array(jsonb_build_object(
      'id', v_tx,
      'label', 'Venta: ' || v_product_name || ' x' || v_qty,
      'amount', v_line_total
    ));
  end loop;

  v_result := jsonb_build_object(
    'id', coalesce(v_service_tx, (v_transaction_ids->>0)::uuid),
    'transactionIds', v_transaction_ids,
    'receipts', v_receipts,
    'serviceTransactionId', v_service_tx,
    'serviceAmount', p_service_amount,
    'productsTotal', v_products_total,
    'total', v_total,
    'currency', 'NIO'
  );

  insert into public.finance_checkout_groups(request_id, client_id, payload, result, created_by)
  values (p_request, p_client, v_payload, v_result, v_actor);

  return v_result;
end;
$$;

revoke all on function public.product_sale_catalog() from public, anon, authenticated;
revoke all on function public.finance_record_checkout(uuid, uuid, numeric, text, text, text, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.product_sale_catalog() to authenticated;
grant execute on function public.finance_record_checkout(uuid, uuid, numeric, text, text, text, text, numeric, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
commit;
