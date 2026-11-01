-- 00097 — Venta particular: vender un producto a quien no está registrado.
--
-- El problema real: `product_sell` exigía un cliente de `gym_clients` y la tabla
-- tenía `stock_sale_client check (kind <> 'venta' or client_id is not null)`.
-- Quien entra sólo a comprar una camiseta o un suplemento porque le dijeron que
-- ahí sale más barato no tiene ficha, y caja no podía cobrarle sin inventarle
-- una cuenta de cliente —o sin negarle la venta—.
--
-- Qué cambia (sólo agrega; no borra movimientos):
--   · `stock_movements.customer_name`: nombre de quien compra sin registro, si
--     caja lo escribe. Es opcional para no frenar la venta en el mostrador.
--   · Se retira la restricción `stock_sale_client`: una venta puede no tener
--     cliente registrado.
--   · `finance_record_movement_before_debts` deja de exigir ficha de cliente
--     para un ingreso (`service_income`): sin eso, la venta particular no podía
--     entrar a la caja ni al arqueo. Un ingreso sin cliente sigue siendo un
--     ingreso normal: mueve la cuenta, se ve en Caja y cuenta en el arqueo; lo
--     único que no hace es anotarse en la ficha de nadie (`client_events`) ni
--     contar para la categoría de un cliente.
--   · `product_sell` acepta `p_customer_name` y devuelve `particular`.
--     El ingreso es el mismo de siempre (`service_income`), en la misma cuenta y
--     con el mismo método: sólo deja de tener ficha de cliente. No se crea un
--     cliente de mentira, no se toca `gym_clients` y la categoría del cliente
--     (`client_category`) no cuenta estas ventas para nadie.
--
-- Reversión: recrear el `product_sell` de la 00042 y volver a agregar
-- `stock_sale_client`. Ojo: esa restricción falla si ya hay ventas particulares
-- guardadas; primero habría que asignarles una ficha. La columna nueva puede
-- quedarse sin uso, así que no hace falta borrarla.

begin;

-- 1. Nombre de quien compra sin ficha (opcional).
alter table public.stock_movements
  add column if not exists customer_name text
  check (customer_name is null or length(btrim(customer_name)) between 2 and 80);

comment on column public.stock_movements.customer_name is
  'Nombre de quien compró sin estar registrado (venta particular). NULL si la venta tiene ficha o si no se preguntó el nombre.';

-- 2. Una venta ya no necesita cliente registrado.
alter table public.stock_movements drop constraint if exists stock_sale_client;

-- 3. Un ingreso ya no exige ficha de cliente.
--
-- Se reemplaza la misma función, con la misma firma y el mismo trabajo: sólo
-- deja de rechazar `service_income` sin cliente y no escribe en `client_events`
-- cuando no hay ficha. Todo lo demás (candado del pedido, validaciones, cuenta,
-- método, comprobante y saldo) queda igual, para no abrir un segundo camino de
-- dinero.
create or replace function public.finance_record_movement_before_debts(
  p_request uuid, p_kind text, p_client uuid, p_amount numeric, p_currency text,
  p_method text, p_account text, p_concept text, p_fx numeric, p_category text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp set lock_timeout='5s' as $$
declare
  v_payload jsonb; v_existing public.finance_entries; v_id uuid; v_actor uuid:=auth.uid();
  v_name text; v_actor_name text; v_profile uuid; v_method text; v_category text; v_account public.bank_accounts;
  v_nio numeric; v_usd numeric; v_delta numeric; v_after numeric; v_at timestamptz:=clock_timestamp();
  v_receipt jsonb;
begin
  select full_name into v_actor_name from public.profiles where id=v_actor for share;
  if not found or not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  v_payload:=jsonb_build_object('kind',p_kind,'client',p_client,'amount',p_amount,'currency',p_currency,
    'method',p_method,'account',p_account,'concept',trim(p_concept),'fx',p_fx,'category',p_category);
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into v_existing from public.finance_entries where request_id=p_request;
  if found then
    if v_existing.payload is distinct from v_payload then raise exception 'REQUEST_CONFLICT'; end if;
    return v_existing.transaction_id;
  end if;
  if not public.finance_writes_ready() then raise exception 'FINANCE_REVIEW_REQUIRED'; end if;
  -- Cambio de la 00097: un ingreso puede no tener ficha (venta particular).
  if p_kind is null or p_kind not in ('service_income','expense')
    or p_amount is null or p_amount<=0 or p_amount>99999999 or p_amount<>round(p_amount,2)
    or p_currency is null or p_currency not in ('NIO','USD')
    or p_fx is null or p_fx<0.0001 or p_fx>10000 or p_fx<>round(p_fx,4)
    or p_concept is null or length(trim(p_concept)) not between 2 and 200
    or (p_kind='service_income' and p_category is not null)
    or (p_kind='expense' and (p_client is not null or p_category is null)) then raise exception 'INVALID_PAYMENT'; end if;
  if p_kind='service_income' and p_client is not null then
    select full_name,profile_id into v_name,v_profile from public.gym_clients where id=p_client for share;
    if not found then raise exception 'NOT_FOUND'; end if;
  elsif p_kind='expense' then
    select name into v_category from public.expense_categories where id=p_category for share;
    if not found then raise exception 'INVALID_CATEGORY'; end if;
  end if;
  select name into v_method from public.payment_methods where id=p_method and is_active
    and currency in (p_currency,'BOTH') for share;
  if not found then raise exception 'INVALID_METHOD'; end if;
  select * into v_account from public.bank_accounts where id=p_account and is_active and currency=p_currency for update;
  if not found then raise exception 'INVALID_ACCOUNT'; end if;
  v_nio:=case when p_currency='NIO' then p_amount else round(p_amount*p_fx,2) end;
  v_usd:=case when p_currency='USD' then p_amount else round(p_amount/p_fx,4) end;
  v_delta:=case when p_kind='expense' then -p_amount else p_amount end;
  v_after:=v_account.balance+v_delta;
  if v_nio>9999999999.99 or v_usd>99999999.9999 or abs(v_after)>9999999999.99 then raise exception 'INVALID_PAYMENT'; end if;
  insert into public.transactions(type,status,occurred_at,account_id,method_id,category_id,member_id,
    client_id,crm_request_id,amount,currency,amount_nio,amount_usd,fx_used,concept,created_by,created_at,updated_at)
  values(case when p_kind='expense' then 'expense'::public.transaction_type else 'income'::public.transaction_type end,
    'completed',v_at,p_account,p_method,p_category,v_profile,p_client,p_request,p_amount,p_currency,v_nio,v_usd,p_fx,trim(p_concept),v_actor,v_at,v_at)
  returning id into v_id;
  update public.bank_accounts set balance=v_after where id=p_account;
  v_receipt:=jsonb_build_object('id',v_id,'reference','SG-'||v_id::text,'requestId',p_request,'kind',p_kind,
    'occurredAt',v_at,'amount',p_amount,'currency',p_currency,'amountNio',v_nio,'amountUsd',v_usd,'fx',p_fx,
    'concept',trim(p_concept),'clientId',p_client,'clientName',v_name,'categoryName',v_category,
    'accountId',p_account,'accountName',v_account.name,'methodName',v_method,'actorId',v_actor,
    'actorName',v_actor_name,
    'accountBefore',v_account.balance,'accountAfter',v_after);
  insert into public.finance_entries(transaction_id,request_id,payload,receipt) values(v_id,p_request,v_payload,v_receipt);
  -- Sólo hay evento del cliente cuando hay ficha.
  if p_kind='service_income' and p_client is not null then
    insert into public.client_events(client_id,action,details,actor_id)
      values(p_client,'payment',jsonb_build_object('transaction_id',v_id,'kind',p_kind),v_actor);
  end if;
  return v_id;
end $$;
revoke all on function public.finance_record_movement_before_debts(uuid,text,uuid,numeric,text,text,text,text,numeric,text)
  from public,anon,authenticated;

-- 4. La función de venta: mismo trabajo, con la venta particular permitida.
drop function if exists public.product_sell(uuid, uuid, integer, uuid, text, text);

create or replace function public.product_sell(
  p_request uuid,
  p_product uuid,
  p_qty integer,
  p_client uuid default null,
  p_method text default null,
  p_account text default null,
  p_customer_name text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_name text; v_status text; v_price numeric; v_stock integer; v_total numeric; v_tx uuid;
  v_existing public.stock_movements;
  v_customer text;
  v_concept text;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  select * into v_existing from public.stock_movements where request_id = p_request;
  if found then
    return jsonb_build_object(
      'transaction_id', v_existing.transaction_id, 'already', true,
      'stock', public.product_stock_of(p_product),
      'particular', v_existing.client_id is null,
      'customer_name', v_existing.customer_name);
  end if;

  if p_method is null or btrim(p_method) = '' then raise exception 'INVALID_METHOD'; end if;
  if p_account is null or btrim(p_account) = '' then raise exception 'INVALID_ACCOUNT'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000 then raise exception 'INVALID_QTY'; end if;

  -- Con ficha manda la ficha; sin ficha, el nombre escrito (o ninguno).
  v_customer := nullif(btrim(coalesce(p_customer_name, '')), '');
  if v_customer is not null and char_length(v_customer) > 80 then
    raise exception 'INVALID_CUSTOMER';
  end if;
  if p_client is not null then
    v_customer := null;
    if not exists (select 1 from public.gym_clients where id = p_client) then
      raise exception 'INVALID_CLIENT';
    end if;
  end if;

  select name, status, price into v_name, v_status, v_price
    from public.products where id = p_product for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status <> 'activo' then raise exception 'PRODUCT_INACTIVE'; end if;

  v_stock := public.product_stock_of(p_product);
  if v_stock < p_qty then raise exception 'SIN_STOCK'; end if;
  v_total := round(p_qty * v_price, 2);

  v_concept := case
    when p_client is null and v_customer is not null
      then 'Venta particular (' || v_customer || '): ' || v_name || ' x' || p_qty
    when p_client is null
      then 'Venta particular: ' || v_name || ' x' || p_qty
    else 'Venta: ' || v_name || ' x' || p_qty
  end;
  -- El concepto de una transacción no lleva más de 200 letras (00022).
  v_concept := left(v_concept, 200);

  v_tx := public.finance_record_movement(
    p_request, 'service_income', p_client, v_total, 'NIO', p_method, p_account, v_concept, 1, null);

  insert into public.stock_movements(
    product_id, kind, qty, unit_price, client_id, customer_name, transaction_id, request_id, note, created_by)
  values (
    p_product, 'venta', -p_qty, v_price, p_client, v_customer, v_tx, p_request,
    case when p_client is null then 'Venta particular' else null end, auth.uid());

  return jsonb_build_object(
    'transaction_id', v_tx, 'already', false, 'stock', v_stock - p_qty,
    'total', v_total, 'particular', p_client is null, 'customer_name', v_customer);
end $$;

-- 5. Permisos: sólo sesión iniciada con rol de caja o administración.
revoke all on function public.product_sell(uuid, uuid, integer, uuid, text, text, text)
  from public, anon;
grant execute on function public.product_sell(uuid, uuid, integer, uuid, text, text, text)
  to authenticated;

commit;
