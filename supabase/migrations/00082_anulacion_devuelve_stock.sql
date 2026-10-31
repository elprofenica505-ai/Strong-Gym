-- 00082 · FIN-08: al anular una venta, devolver el stock
--
-- Problema: FIN-01 anula el cobro y devuelve el dinero, pero la venta había
-- descontado stock y la anulación no lo reponía. El inventario quedaba corto
-- para siempre y la única salida era un ajuste manual sin rastro.
--
-- Decisión de esta etapa:
--   * La devolución ocurre en la misma transacción que la anulación: si algo
--     falla, no queda ni dinero revertido ni stock devuelto a medias.
--   * Se repone exactamente lo que esa venta descontó: una fila por cada
--     movimiento `venta` de la transacción original. No se borra ni se edita
--     ningún movimiento de stock anterior; se agrega una entrada nueva.
--   * La entrada lleva `note = 'Anulación de venta'`, la transacción de la
--     reversa y el precio unitario de la venta, para rastrear de dónde salió.
--   * Un solo tope: no se repone dos veces. Si la reversa ya tiene su entrada,
--     la función devuelve lo registrado y no agrega nada.
--   * Si el cobro no tenía productos, no hace nada y el comprobante no cambia.
--
-- El cuerpo de `finance_void_movement` es el de la 00080 con una línea nueva:
-- la llamada a la devolución. Las reglas de FIN-01 no cambian.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regprocedure('public.finance_void_movement(uuid,uuid,text)') is null
     or to_regclass('public.stock_movements') is null
     or to_regclass('public.products') is null then
    raise exception 'VOID_STOCK_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. Devolución de stock: función chica, una sola regla.
create or replace function public.finance_void_stock_restore(
  p_original uuid,
  p_reversal uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_line record;
  v_name text;
begin
  -- Idempotencia: si la reversa ya tiene su entrada de stock, se devuelve eso.
  if exists (
    select 1 from public.stock_movements where transaction_id = p_reversal
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'productId', s.product_id, 'name', p.name, 'qty', s.qty
           ) order by p.name), '[]'::jsonb)
      into v_rows
      from public.stock_movements s
      join public.products p on p.id = s.product_id
     where s.transaction_id = p_reversal;
    return v_rows;
  end if;

  for v_line in
    select s.product_id, s.qty, s.unit_price, s.client_id
      from public.stock_movements s
     where s.transaction_id = p_original
       and s.kind = 'venta'
       and s.qty < 0
     order by s.product_id
  loop
    insert into public.stock_movements(
      product_id, kind, qty, unit_price, client_id, transaction_id,
      request_id, note, created_by
    ) values (
      v_line.product_id, 'entrada', -v_line.qty, v_line.unit_price,
      v_line.client_id, p_reversal, gen_random_uuid(),
      'Anulación de venta', auth.uid()
    );
    select name into v_name from public.products where id = v_line.product_id;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'productId', v_line.product_id, 'name', v_name, 'qty', -v_line.qty
    ));
  end loop;

  return v_rows;
end $$;
revoke all on function public.finance_void_stock_restore(uuid, uuid)
  from public, anon, authenticated;

-- 2. Anulación: mismo cuerpo de la 00080, con la devolución adentro.

create or replace function public.finance_void_movement(
  p_request uuid,
  p_transaction uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
set lock_timeout = '5s' as $$
declare
  v_t public.transactions;
  v_account public.bank_accounts;
  v_plan jsonb;
  v_existing public.finance_voids;
  v_payload jsonb;
  v_reason text := trim(coalesce(p_reason, ''));
  v_reversal uuid;
  v_actor_name text;
  v_actor_role text;
  v_after numeric;
  v_delta numeric;
  v_at timestamptz := clock_timestamp();
  v_receipt jsonb;
  v_void_id uuid;
  v_stock jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  if p_transaction is null then raise exception 'NOT_FOUND'; end if;
  if char_length(v_reason) not between 5 and 300 then
    raise exception 'INVALID_REASON';
  end if;

  v_payload := jsonb_build_object(
    'transaction', p_transaction,
    'reason', v_reason
  );

  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  select * into v_existing from public.finance_voids where request_id = p_request;
  if found then
    if v_existing.payload is distinct from v_payload then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return v_existing.receipt;
  end if;

  if not public.finance_writes_ready() then raise exception 'FINANCE_REVIEW_REQUIRED'; end if;

  select * into v_t from public.transactions where id = p_transaction for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  v_plan := public.finance_void_plan(p_transaction);
  if not coalesce((v_plan ->> 'allowed')::boolean, false) then
    raise exception '%', coalesce(v_plan ->> 'code', 'NOT_ALLOWED');
  end if;

  select full_name into v_actor_name from public.profiles where id = auth.uid() for share;
  if not found then raise exception 'AUTH'; end if;
  select role::text into v_actor_role from public.profiles where id = auth.uid();

  select * into v_account from public.bank_accounts where id = v_t.account_id for update;
  if not found then raise exception 'INVALID_ACCOUNT'; end if;
  if v_account.currency <> v_t.currency then raise exception 'INVALID_ACCOUNT'; end if;

  v_delta := case when v_t.type::text = 'expense' then v_t.amount else -v_t.amount end;
  v_after := v_account.balance + v_delta;
  if abs(v_after) > 9999999999.99 then raise exception 'INVALID_PAYMENT'; end if;

  insert into public.transactions(
    type, status, occurred_at, account_id, method_id, category_id, member_id,
    client_id, crm_request_id, amount, currency, amount_nio, amount_usd,
    fx_used, concept, created_by, created_at, updated_at
  ) values (
    case when v_t.type::text = 'expense'
      then 'income'::public.transaction_type
      else 'expense'::public.transaction_type end,
    'completed', v_at, v_t.account_id, v_t.method_id, v_t.category_id,
    v_t.member_id, v_t.client_id, p_request, v_t.amount, v_t.currency,
    v_t.amount_nio, v_t.amount_usd, v_t.fx_used,
    left('Anulación: ' || v_t.concept, 200), auth.uid(), v_at, v_at
  ) returning id into v_reversal;

  update public.bank_accounts set balance = v_after where id = v_t.account_id;

  -- FIN-08: la venta había descontado stock; la anulación lo devuelve.
  v_stock := public.finance_void_stock_restore(v_t.id, v_reversal);

  v_receipt := jsonb_build_object(
    'id', v_reversal,
    'reference', 'SG-' || v_reversal::text,
    'requestId', p_request,
    'kind', 'void',
    'originalId', v_t.id,
    'reversalId', v_reversal,
    'reason', v_reason,
    'occurredAt', v_at,
    'amount', v_t.amount,
    'currency', v_t.currency,
    'amountNio', v_t.amount_nio,
    'amountUsd', v_t.amount_usd,
    'originalConcept', v_t.concept,
    'concept', left('Anulación: ' || v_t.concept, 200),
    'clientId', v_t.client_id,
    'accountId', v_t.account_id,
    'accountName', v_account.name,
    'accountBefore', v_account.balance,
    'accountAfter', v_after,
    'stockRestored', v_stock,
    'actorId', auth.uid(),
    'actorName', v_actor_name
  );

  insert into public.finance_voids(
    request_id, original_id, reversal_id, reason, actor_id, actor_name,
    actor_role, payload, receipt
  ) values (
    p_request, v_t.id, v_reversal, v_reason, auth.uid(), v_actor_name,
    v_actor_role, v_payload, v_receipt
  ) returning id into v_void_id;


  if v_t.client_id is not null then
    insert into public.client_events(client_id, action, details, actor_id)
    values (
      v_t.client_id,
      'payment_void',
      jsonb_build_object(
        'transaction_id', v_t.id,
        'reversal_id', v_reversal,
        'void_id', v_void_id,
        'amount', v_t.amount,
        'currency', v_t.currency,
        'reason', v_reason
      ),
      auth.uid()
    );
  end if;

  return v_receipt;
end $$;
revoke all on function public.finance_void_movement(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finance_void_movement(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
