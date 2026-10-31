-- 00081 · FIN-02: efectivo recibido y vuelto en todos los cobros
--
-- Problema: hoy el vuelto solo existe en los abonos de deuda
-- (`finance_debt_record_with_cash`, 00029). Un cobro por servicio, un cobro con
-- productos o un cobro de plan no registran cuánto entregó la persona ni
-- cuánto se le devolvió, así que el cierre de caja no puede cuadrar el
-- efectivo físico contra lo registrado.
--
-- Decisión de esta etapa:
--   * Se agrega un parámetro opcional `p_cash_received` a los cuatro escritores
--     de cobro. Si viene vacío, todo sigue exactamente igual que antes: no se
--     inventa efectivo histórico.
--   * El efectivo recibido solo aplica a ingresos por servicio. Un gasto no
--     recibe efectivo del cliente: si llega, se rechaza.
--   * Se exige que la cuenta sea de caja (`account_type = 'caja_fuerte'`),
--     activa y de la misma moneda del cobro: el vuelto es dinero físico.
--   * El importe recibido debe ser mayor o igual al total del cobro, tener dos
--     decimales y no pasar de 99 999 999 (`INVALID_CASH_RECEIVED`).
--   * El vuelto queda guardado en el comprobante (`finance_entries.receipt`),
--     en el evento del cliente y —en los cobros con productos— en el grupo del
--     checkout, que es donde se conoce el total del servicio más los productos.
--   * Nada de esto borra o reescribe movimientos anteriores: solo completa
--     comprobantes nuevos.
--
-- Reglas compartidas en dos funciones chicas (`finance_cash_change` y
-- `finance_cash_stamp`) para no repetir la misma validación cuatro veces.

begin;
set local lock_timeout = '5s';

do $$ begin
  if public.crm_finance_layout() <> 'bank_accounts_split'
     or to_regprocedure('public.finance_record_movement(uuid,text,uuid,numeric,text,text,text,text,numeric,text)') is null
     or to_regprocedure('public.finance_record_checkout(uuid,uuid,numeric,text,text,text,text,numeric,jsonb)') is null
     or to_regprocedure('public.finance_record_movement_plan(uuid,uuid,numeric,text,text,text,text,numeric,text)') is null
     or to_regprocedure('public.finance_record_checkout_plan(uuid,uuid,numeric,text,text,text,text,numeric,jsonb,text)') is null
     or to_regclass('public.finance_entries') is null
     or to_regclass('public.bank_accounts') is null then
    raise exception 'CASH_CHANGE_PREREQUISITE_MISSING';
  end if;
end $$;

-- El escritor de checkout gana un parámetro, así que su cuerpo actual se
-- conserva con otro nombre y el nuevo lo envuelve. Se copia con
-- `pg_get_functiondef` para no reescribir a mano las validaciones de stock.
do $$ begin
  if to_regprocedure('public.finance_record_checkout_before_cash(uuid,uuid,numeric,text,text,text,text,numeric,jsonb)') is null then
    execute replace(
      pg_get_functiondef('public.finance_record_checkout(uuid,uuid,numeric,text,text,text,text,numeric,jsonb)'::regprocedure),
      'FUNCTION public.finance_record_checkout(',
      'FUNCTION public.finance_record_checkout_before_cash('
    );
  end if;
end $$;
revoke all on function public.finance_record_checkout_before_cash(uuid, uuid, numeric, text, text, text, text, numeric, jsonb)
  from public, anon, authenticated;

-- Cambiar la firma exige recrear: cada versión vieja se retira justo antes de
-- su reemplazo, así no quedan dos funciones iguales y PostgREST no duda.

-- 1. Regla única de efectivo: devuelve el vuelto o null si no hubo efectivo.
create or replace function public.finance_cash_change(
  p_amount numeric,
  p_currency text,
  p_account text,
  p_cash_received numeric
) returns numeric
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_cash_received is null then return null; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 99999999
     or p_amount <> round(p_amount, 2) then
    raise exception 'INVALID_CASH_RECEIVED';
  end if;
  if p_cash_received < p_amount or p_cash_received > 99999999
     or p_cash_received <> round(p_cash_received, 2) then
    raise exception 'INVALID_CASH_RECEIVED';
  end if;
  -- No se infiere efectivo por el nombre del método: manda la cuenta elegida.
  perform 1 from public.bank_accounts
   where id = p_account and is_active
     and account_type = 'caja_fuerte' and currency = p_currency;
  if not found then raise exception 'CASH_ACCOUNT_REQUIRED'; end if;
  return p_cash_received - p_amount;
end $$;
revoke all on function public.finance_cash_change(numeric, text, text, numeric)
  from public, anon, authenticated;

-- 2. Deja el efectivo en el comprobante y en el evento del cliente.
create or replace function public.finance_cash_stamp(
  p_transaction uuid,
  p_cash_received numeric,
  p_change numeric
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows integer;
begin
  update public.finance_entries
     set receipt = receipt || jsonb_build_object(
       'cashReceived', p_cash_received,
       'changeGiven', p_change
     )
   where transaction_id = p_transaction;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'CASH_RECEIPT_UNCONFIRMED'; end if;

  -- Puede no haber evento si el cobro no tenía ficha de cliente.
  update public.client_events
     set details = details || jsonb_build_object(
       'cash_received', p_cash_received,
       'change_given', p_change
     )
   where details->>'transaction_id' = p_transaction::text;
end $$;
revoke all on function public.finance_cash_stamp(uuid, numeric, numeric)
  from public, anon, authenticated;

-- 3. Cobro simple, con o sin plan.
drop function if exists public.finance_record_movement(uuid, text, uuid, numeric, text, text, text, text, numeric, text);

create or replace function public.finance_record_movement(
  p_request uuid, p_kind text, p_client uuid, p_amount numeric, p_currency text,
  p_method text, p_account text, p_concept text, p_fx numeric,
  p_category text default null, p_cash_received numeric default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_change numeric;
  v_id uuid;
  v_existing numeric;
  v_found boolean := false;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  if p_kind = 'expense'
     and not public.finance_permission_enabled('cashier_can_manage_expenses') then
    raise exception 'AUTH';
  end if;
  -- Un gasto no recibe efectivo del cliente.
  if p_cash_received is not null and p_kind is distinct from 'service_income' then
    raise exception 'INVALID_CASH_RECEIVED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  if exists(select 1 from public.client_debt_entries where request_id = p_request) then
    raise exception 'REQUEST_CONFLICT';
  end if;

  -- Reintento con otro efectivo declarado es otro contenido: se rechaza.
  if p_cash_received is not null then
    select (receipt->>'cashReceived')::numeric
      into v_existing
      from public.finance_entries
     where request_id = p_request;
    v_found := found;
    if v_found and coalesce(v_existing, -1) <> p_cash_received then
      raise exception 'REQUEST_CONFLICT';
    end if;
  end if;

  v_change := public.finance_cash_change(p_amount, p_currency, p_account, p_cash_received);

  v_id := public.finance_record_movement_before_debts(
    p_request, p_kind, p_client, p_amount, p_currency,
    p_method, p_account, p_concept, p_fx, p_category
  );

  if p_cash_received is not null then
    perform public.finance_cash_stamp(v_id, p_cash_received, v_change);
  end if;

  return v_id;
end $$;
revoke all on function public.finance_record_movement(uuid, text, uuid, numeric, text, text, text, text, numeric, text, numeric)
  from public, anon, authenticated;
grant execute on function public.finance_record_movement(uuid, text, uuid, numeric, text, text, text, text, numeric, text, numeric)
  to authenticated;

drop function if exists public.finance_record_movement_plan(uuid, uuid, numeric, text, text, text, text, numeric, text);

create or replace function public.finance_record_movement_plan(
  p_request uuid,
  p_client uuid,
  p_amount numeric,
  p_concept text,
  p_currency text,
  p_method text,
  p_account text,
  p_fx numeric,
  p_plan text,
  p_cash_received numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_terms jsonb;
  v_pre boolean;
  v_id uuid;
  v_plan jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_plan is null then raise exception 'PLAN_TERMS_INVALID'; end if;
  v_terms := public.plan_validity_terms(p_plan);
  if v_terms is null then raise exception 'PLAN_TERMS_INVALID'; end if;
  if (v_terms->>'amount') is null then raise exception 'PLAN_PRICE_MISSING'; end if;
  if p_currency is distinct from (v_terms->>'currency')
     or p_amount is distinct from (v_terms->>'amount')::numeric then
    raise exception 'PLAN_PRICE_MISMATCH';
  end if;

  select exists(select 1 from public.finance_entries where request_id = p_request) into v_pre;

  -- El cobro base es quien valida y guarda el efectivo.
  v_id := public.finance_record_movement(
    p_request, 'service_income', p_client, p_amount, p_currency,
    p_method, p_account, p_concept, p_fx, null, p_cash_received
  );

  if v_pre then
    -- Reintento de un cobro que ya existía: no se inventa vigencia.
    select jsonb_build_object(
      'id', s.id, 'plan_id', s.plan_id, 'access', s.access,
      'started_on', s.started_on, 'expires_on', s.expires_on,
      'days', s.expires_on - s.started_on + 1
    ) into v_plan
    from public.payment_plans s where s.request_id = p_request;
  else
    v_plan := public.plan_register_segment(p_client, p_plan, p_amount, p_currency, p_request, v_id, 'movement');
    v_plan := v_plan - 'validity';
  end if;

  return jsonb_build_object('id', v_id, 'plan', v_plan);
end $$;
revoke all on function public.finance_record_movement_plan(uuid, uuid, numeric, text, text, text, text, numeric, text, numeric)
  from public, anon, authenticated;
grant execute on function public.finance_record_movement_plan(uuid, uuid, numeric, text, text, text, text, numeric, text, numeric)
  to authenticated;

-- 4. Cobro con productos: el vuelto es del total (servicio + productos).
drop function if exists public.finance_record_checkout(uuid, uuid, numeric, text, text, text, text, numeric, jsonb);

create or replace function public.finance_record_checkout(
  p_request uuid, p_client uuid, p_service_amount numeric, p_service_concept text,
  p_currency text, p_method text, p_account text, p_fx numeric, p_items jsonb,
  p_cash_received numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_result jsonb;
  v_total numeric;
  v_change numeric;
  v_first uuid;
  v_existing numeric;
  v_found boolean := false;
begin
  -- Se mira el grupo antes de escribir para no repetir un cobro con otro efectivo.
  if p_cash_received is not null then
    -- El efectivo se guarda en `result`, no en `payload`: el escritor base
    -- compara `payload` en los reintentos y agregarle algo lo volvería un
    -- conflicto falso.
    select (result->>'cashReceived')::numeric
      into v_existing
      from public.finance_checkout_groups
     where request_id = p_request;
    v_found := found;
    if v_found and coalesce(v_existing, -1) <> p_cash_received then
      raise exception 'REQUEST_CONFLICT';
    end if;
  end if;

  v_result := public.finance_record_checkout_before_cash(
    p_request, p_client, p_service_amount, p_service_concept,
    p_currency, p_method, p_account, p_fx, p_items
  );

  if p_cash_received is null then return v_result; end if;

  v_total := (v_result->>'total')::numeric;
  v_change := public.finance_cash_change(v_total, p_currency, p_account, p_cash_received);

  v_first := coalesce(
    nullif(v_result->>'serviceTransactionId', '')::uuid,
    nullif(v_result->'transactionIds'->>0, '')::uuid
  );
  if v_first is not null then
    perform public.finance_cash_stamp(v_first, p_cash_received, v_change);
  end if;

  update public.finance_checkout_groups
     set result = result || jsonb_build_object(
           'cashReceived', p_cash_received,
           'changeGiven', v_change
         )
   where request_id = p_request;

  return v_result || jsonb_build_object(
    'cashReceived', p_cash_received,
    'changeGiven', v_change
  );
end $$;
revoke all on function public.finance_record_checkout(uuid, uuid, numeric, text, text, text, text, numeric, jsonb, numeric)
  from public, anon, authenticated;
grant execute on function public.finance_record_checkout(uuid, uuid, numeric, text, text, text, text, numeric, jsonb, numeric)
  to authenticated;

drop function if exists public.finance_record_checkout_plan(uuid, uuid, numeric, text, text, text, text, numeric, jsonb, text);

create or replace function public.finance_record_checkout_plan(
  p_request uuid, p_client uuid, p_service_amount numeric, p_service_concept text,
  p_currency text, p_method text, p_account text, p_fx numeric, p_items jsonb,
  p_plan text, p_cash_received numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_terms jsonb;
  v_pre boolean;
  v_result jsonb;
  v_tx uuid;
  v_plan jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_plan is null then raise exception 'PLAN_TERMS_INVALID'; end if;
  v_terms := public.plan_validity_terms(p_plan);
  if v_terms is null then raise exception 'PLAN_TERMS_INVALID'; end if;
  if (v_terms->>'amount') is null then raise exception 'PLAN_PRICE_MISSING'; end if;
  if (v_terms->>'access') = 'class' then raise exception 'PLAN_NOT_COMBINABLE'; end if;
  if p_currency is distinct from (v_terms->>'currency')
     or p_service_amount is distinct from (v_terms->>'amount')::numeric then
    raise exception 'PLAN_PRICE_MISMATCH';
  end if;

  select exists(select 1 from public.finance_checkout_groups where request_id = p_request) into v_pre;

  v_result := public.finance_record_checkout(
    p_request, p_client, p_service_amount, p_service_concept,
    p_currency, p_method, p_account, p_fx, p_items, p_cash_received
  );

  if v_pre then
    select jsonb_build_object(
      'id', s.id, 'plan_id', s.plan_id,
      'access', case when s.class_id is null then 'gym' else 'class' end,
      'class_id', s.class_id,
      'started_on', s.started_on, 'expires_on', s.expires_on,
      'days', s.expires_on - s.started_on + 1
    ) into v_plan
    from public.payment_plans s where s.request_id = p_request;
  elsif p_service_amount > 0 then
    v_tx := nullif(v_result->>'serviceTransactionId', '')::uuid;
    v_plan := public.plan_register_segment(
      p_client, p_plan, p_service_amount, p_currency, p_request, v_tx, 'checkout'
    );
    v_plan := v_plan - 'validity';
  end if;

  return v_result || jsonb_build_object('plan', v_plan);
end $$;
revoke all on function public.finance_record_checkout_plan(uuid, uuid, numeric, text, text, text, text, numeric, jsonb, text, numeric)
  from public, anon, authenticated;
grant execute on function public.finance_record_checkout_plan(uuid, uuid, numeric, text, text, text, text, numeric, jsonb, text, numeric)
  to authenticated;

notify pgrst, 'reload schema';
commit;
