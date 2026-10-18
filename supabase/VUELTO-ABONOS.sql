-- Efectivo recibido y vuelto para abonos, en la misma moneda.
-- Requiere DEUDAS-ABONOS (00028). No registra operaciones ni altera saldos al instalar.
begin;
do $$ begin
  if public.crm_finance_layout()<>'bank_accounts_split' or to_regprocedure('public.finance_debt_detail(uuid)') is null
    then raise exception 'DEBTS_SETUP_REQUIRED'; end if;
end $$;

create or replace function public.finance_debt_record_with_cash(
  p_request uuid,p_kind text,p_client uuid,p_amount numeric,p_currency text,p_concept text,
  p_method text,p_account text,p_fx numeric,p_open jsonb,p_cash_received numeric
) returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='5s' as $$
declare v_payload jsonb; v_existing public.client_debt_entries; v_receipt jsonb; v_change numeric; v_rows integer;
begin
  perform 1 from public.profiles where id=auth.uid() for share;
  if not found or not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  v_payload:=jsonb_build_object('kind',p_kind,'client',p_client,'amount',p_amount,'currency',p_currency,
    'concept',trim(p_concept),'method',p_method,'account',p_account,'fx',p_fx,'opening',p_open,'cash_received',p_cash_received);
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into v_existing from public.client_debt_entries where request_id=p_request;
  if found then
    if v_existing.payload is distinct from v_payload then raise exception 'REQUEST_CONFLICT'; end if;
    return v_existing.receipt;
  end if;
  if p_kind is distinct from 'payment' or p_open is not null or p_amount is null or p_amount<=0 or p_amount>99999999
    or p_amount<>round(p_amount,2) or p_cash_received is null or p_cash_received<p_amount or p_cash_received>99999999
    or p_cash_received<>round(p_cash_received,2) then raise exception 'INVALID_CASH_RECEIVED'; end if;
  v_change:=p_cash_received-p_amount;
  -- El escritor base valida deuda, método, FX y cuenta; ingresa sólo el abono neto.
  v_receipt:=public.finance_debt_record(p_request,p_kind,p_client,p_amount,p_currency,p_concept,p_method,p_account,p_fx,p_open);
  -- La cuenta ya está bloqueada por el escritor base: no invertir orden de locks.
  -- No se infiere efectivo por el nombre del método. El personal declara entrega
  -- física y sólo puede usar una cuenta de caja activa, en la moneda de la deuda.
  perform 1 from public.bank_accounts where id=p_account and is_active and account_type='caja_fuerte' and currency=p_currency;
  if not found then raise exception 'CASH_ACCOUNT_REQUIRED'; end if;
  v_receipt:=v_receipt||jsonb_build_object('cashReceived',p_cash_received,'changeGiven',v_change);
  update public.client_debt_entries set payload=v_payload,receipt=v_receipt where request_id=p_request;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'CASH_RECEIPT_UNCONFIRMED'; end if;
  update public.finance_entries set receipt=receipt||jsonb_build_object('cashReceived',p_cash_received,'changeGiven',v_change)
    where transaction_id=(v_receipt->>'transactionId')::uuid;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'CASH_RECEIPT_UNCONFIRMED'; end if;
  update public.client_events set details=details||jsonb_build_object('cash_received',p_cash_received,'change_given',v_change)
    where client_id=p_client and details->>'transaction_id'=v_receipt->>'transactionId';
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'CASH_RECEIPT_UNCONFIRMED'; end if;
  return v_receipt;
end $$;
revoke all on function public.finance_debt_record_with_cash(uuid,text,uuid,numeric,text,text,text,text,numeric,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.finance_debt_record_with_cash(uuid,text,uuid,numeric,text,text,text,text,numeric,jsonb,numeric) to authenticated;

-- Capacidad explícita; clientes anteriores y referencias pendientes sin efectivo
-- continúan usando la firma original, sin inventar efectivo recibido histórico.
do $$ begin
  if to_regprocedure('public.finance_debt_detail_before_cash(uuid)') is null then
    execute replace(pg_get_functiondef('public.finance_debt_detail(uuid)'::regprocedure),
      'FUNCTION public.finance_debt_detail(', 'FUNCTION public.finance_debt_detail_before_cash(');
  end if;
end $$;
revoke all on function public.finance_debt_detail_before_cash(uuid) from public,anon,authenticated;
create or replace function public.finance_debt_detail(p_client uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return public.finance_debt_detail_before_cash(p_client)||jsonb_build_object('cashProtocol','cash-v1',
    'cashAccounts',coalesce((select jsonb_agg(id order by id) from public.bank_accounts where is_active and account_type='caja_fuerte'),'[]'::jsonb));
end $$;
revoke all on function public.finance_debt_detail(uuid) from public,anon,authenticated;
grant execute on function public.finance_debt_detail(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
