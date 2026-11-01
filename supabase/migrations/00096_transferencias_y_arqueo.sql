-- ============================================================
--  00096 — Transferencias entre cuentas y arqueo que las cuenta
--  (FIN-03, parte 2)
-- ============================================================
--  Pasar plata de una cuenta a otra sin que cuente como ingreso ni gasto, y
--  anularla con contra-asiento. Una transferencia es UNA fila de `transactions`
--  con `type='transfer'`, origen en `account_id` y destino en
--  `destination_account_id` (el modelo ya existía sin usar).
--
--  Además corrige el arqueo: si sale efectivo de la caja fuerte, «debería
--  haber» baja; si entra, sube. Sin esto, cerrar la caja después de una
--  transferencia inventaría un faltante.
--
--  Requiere 00095 (bitácora) y las funciones de caja de 00087.
-- ============================================================

begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.finance_settings_audit') is null
     or to_regclass('public.finance_voids') is null
     or to_regclass('public.cash_sessions') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.finance_cash_row_json(uuid)') is null
     or to_regprocedure('public.finance_cash_close(uuid,uuid,numeric,numeric,text)') is null
     or to_regprocedure('public.finance_cash_movements(timestamptz,timestamptz)') is null then
    raise exception 'TRANSFER_PREREQUISITE_MISSING';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Transferencia entre cuentas (no es ingreso ni gasto)
-- ---------------------------------------------------------------------------
create or replace function public.finance_transfer_create(
  p_request uuid,
  p_from text,
  p_to text,
  p_amount numeric,
  p_fx numeric,
  p_concept text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_from public.bank_accounts;
  v_to public.bank_accounts;
  v_existing public.finance_entries;
  v_payload jsonb;
  v_concept text := btrim(coalesce(p_concept, ''));
  v_amount_in numeric;
  v_amount_nio numeric;
  v_amount_usd numeric;
  v_from_after numeric;
  v_to_after numeric;
  v_id uuid;
  v_at timestamptz := clock_timestamp();
  v_actor_name text;
  v_receipt jsonb;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 99999999
     or p_amount <> round(p_amount, 2) then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_fx is null or p_fx < 0.0001 or p_fx > 10000 or p_fx <> round(p_fx, 4) then
    raise exception 'INVALID_FX';
  end if;
  if char_length(v_concept) not between 2 and 200 then raise exception 'INVALID_CONCEPT'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'INVALID_ACCOUNTS'; end if;

  v_payload := jsonb_build_object(
    'kind', 'transfer',
    'from', p_from,
    'to', p_to,
    'amount', p_amount,
    'fx', p_fx,
    'concept', v_concept
  );

  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  select * into v_existing from public.finance_entries where request_id = p_request;
  if found then
    if v_existing.payload is distinct from v_payload then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return v_existing.receipt;
  end if;

  -- Siempre en el mismo orden para que dos transferencias cruzadas no se
  -- queden esperando la una a la otra.
  perform 1 from public.bank_accounts where id in (p_from, p_to) order by id for update;

  select * into v_from from public.bank_accounts where id = p_from;
  if not found or not v_from.is_active then raise exception 'INVALID_ACCOUNT'; end if;
  select * into v_to from public.bank_accounts where id = p_to;
  if not found or not v_to.is_active then raise exception 'INVALID_ACCOUNT'; end if;

  -- Igual que un gasto en efectivo, una transferencia puede dejar la cuenta
  -- en negativo: la app muestra el saldo antes y después, y el dueño decide.
  -- No se bloquea acá para no inventar una regla que el resto del dinero no
  -- tiene (un gasto sí puede dejar saldo negativo).
  if v_from.currency = v_to.currency then
    v_amount_in := p_amount;
    v_amount_nio := case when v_from.currency = 'NIO' then p_amount else round(p_amount * p_fx, 2) end;
    v_amount_usd := case when v_from.currency = 'USD' then p_amount else round(p_amount / p_fx, 4) end;
  elsif v_from.currency = 'NIO' then
    -- Córdobas → dólares: se entrega lo que compra la tasa.
    v_amount_in := round(p_amount / p_fx, 2);
    v_amount_nio := p_amount;
    v_amount_usd := round(p_amount / p_fx, 4);
  else
    -- Dólares → córdobas: se entrega lo que vale la tasa.
    v_amount_in := round(p_amount * p_fx, 2);
    v_amount_nio := v_amount_in;
    v_amount_usd := p_amount;
  end if;

  if v_amount_in <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  v_from_after := v_from.balance - p_amount;
  v_to_after := v_to.balance + v_amount_in;
  if abs(v_from_after) > 9999999999.99 or abs(v_to_after) > 9999999999.99 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select full_name into v_actor_name from public.profiles where id = auth.uid();

  insert into public.transactions (
    type, status, occurred_at, account_id, destination_account_id,
    amount, currency, amount_nio, amount_usd, fx_used,
    concept, notes, crm_request_id, created_by, created_at, updated_at
  ) values (
    'transfer', 'completed', v_at, p_from, p_to,
    p_amount, v_from.currency, v_amount_nio, v_amount_usd, p_fx,
    'Transferencia · ' || v_concept,
    v_from.name || ' → ' || v_to.name,
    p_request, auth.uid(), v_at, v_at
  ) returning id into v_id;

  update public.bank_accounts set balance = v_from_after where id = p_from;
  update public.bank_accounts set balance = v_to_after where id = p_to;

  insert into public.finance_entries (transaction_id, request_id, payload, receipt)
  values (
    v_id,
    p_request,
    v_payload,
    jsonb_build_object(
      'id', v_id,
      'reference', 'SG-' || v_id::text,
      'requestId', p_request,
      'kind', 'transfer',
      'occurredAt', v_at,
      'fromId', p_from,
      'fromName', v_from.name,
      'toId', p_to,
      'toName', v_to.name,
      'amount', p_amount,
      'currency', v_from.currency,
      'amountIn', v_amount_in,
      'currencyIn', v_to.currency,
      'fx', p_fx,
      'amountNio', v_amount_nio,
      'amountUsd', v_amount_usd,
      'concept', v_concept,
      'actorId', auth.uid(),
      'actorName', v_actor_name,
      'fromBefore', v_from.balance,
      'fromAfter', v_from_after,
      'toBefore', v_to.balance,
      'toAfter', v_to_after
    )
  );

  insert into public.finance_settings_audit (actor_id, action, target, details)
  values (
    auth.uid(), 'transfer_create', v_id::text,
    jsonb_build_object(
      'from', p_from, 'to', p_to,
      'amount', p_amount, 'currency', v_from.currency,
      'amountIn', v_amount_in, 'currencyIn', v_to.currency,
      'fx', p_fx, 'concept', v_concept,
      'fromBefore', v_from.balance, 'fromAfter', v_from_after,
      'toBefore', v_to.balance, 'toAfter', v_to_after
    )
  );

  select receipt into v_receipt from public.finance_entries where transaction_id = v_id;
  return v_receipt;
end $$;

revoke all on function public.finance_transfer_create(uuid, text, text, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.finance_transfer_create(uuid, text, text, numeric, numeric, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Anular una transferencia: contra-asiento, nunca borrar
-- ---------------------------------------------------------------------------
create or replace function public.finance_transfer_void(
  p_request uuid,
  p_transfer uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_t public.transactions;
  v_from public.bank_accounts;
  v_to public.bank_accounts;
  v_existing public.finance_voids;
  v_payload jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_amount_in numeric;
  v_reversal uuid;
  v_at timestamptz := clock_timestamp();
  v_from_after numeric;
  v_to_after numeric;
  v_receipt jsonb;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  if p_transfer is null then raise exception 'NOT_FOUND'; end if;
  if char_length(v_reason) not between 5 and 300 then raise exception 'INVALID_REASON'; end if;

  v_payload := jsonb_build_object('transfer', p_transfer, 'reason', v_reason);

  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  select * into v_existing from public.finance_voids where request_id = p_request;
  if found then
    if v_existing.payload is distinct from v_payload then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return v_existing.receipt;
  end if;

  select * into v_t from public.transactions where id = p_transfer for update;
  if not found or v_t.type <> 'transfer' then raise exception 'NOT_FOUND'; end if;
  if v_t.status <> 'completed' then raise exception 'NOT_ALLOWED'; end if;
  if exists (select 1 from public.finance_voids where original_id = p_transfer) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_t.destination_account_id is null then raise exception 'NOT_FOUND'; end if;

  perform 1 from public.bank_accounts
    where id in (v_t.account_id, v_t.destination_account_id)
    order by id for update;

  select * into v_from from public.bank_accounts where id = v_t.account_id;
  if not found then raise exception 'INVALID_ACCOUNT'; end if;
  select * into v_to from public.bank_accounts where id = v_t.destination_account_id;
  if not found then raise exception 'INVALID_ACCOUNT'; end if;

  v_amount_in := case
    when v_to.currency = 'NIO' then round(v_t.amount_nio, 2)
    else round(v_t.amount_usd, 2)
  end;

  v_from_after := v_from.balance + v_t.amount;
  v_to_after := v_to.balance - v_amount_in;
  if abs(v_from_after) > 9999999999.99 or abs(v_to_after) > 9999999999.99 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- El contra-asiento es la transferencia al revés.
  insert into public.transactions (
    type, status, occurred_at, account_id, destination_account_id,
    amount, currency, amount_nio, amount_usd, fx_used,
    concept, notes, crm_request_id, created_by, created_at, updated_at
  ) values (
    'transfer', 'completed', v_at, v_to.id, v_from.id,
    v_amount_in, v_to.currency, v_t.amount_nio, v_t.amount_usd, v_t.fx_used,
    left('Anulación: ' || v_t.concept, 200),
    v_to.name || ' → ' || v_from.name,
    p_request, auth.uid(), v_at, v_at
  ) returning id into v_reversal;

  update public.bank_accounts set balance = v_from_after where id = v_from.id;
  update public.bank_accounts set balance = v_to_after where id = v_to.id;

  v_receipt := jsonb_build_object(
    'id', v_reversal,
    'reference', 'SG-' || v_reversal::text,
    'requestId', p_request,
    'kind', 'transfer_void',
    'originalId', v_t.id,
    'reversalId', v_reversal,
    'reason', v_reason,
    'occurredAt', v_at,
    'fromId', v_to.id,
    'toId', v_from.id,
    'amount', v_amount_in,
    'currency', v_to.currency
  );

  insert into public.finance_voids (
    original_id, reversal_id, reason, request_id, payload, receipt, actor_id, created_at
  ) values (
    v_t.id, v_reversal, v_reason, p_request, v_payload, v_receipt, auth.uid(), v_at
  );

  insert into public.finance_settings_audit (actor_id, action, target, details)
  values (
    auth.uid(), 'transfer_void', v_t.id::text,
    jsonb_build_object(
      'reason', v_reason,
      'reversalId', v_reversal,
      'amount', v_t.amount, 'amountIn', v_amount_in
    )
  );

  return v_receipt;
end $$;

revoke all on function public.finance_transfer_void(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.finance_transfer_void(uuid, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Los desplegables de cobro y gasto sólo ofrecen lo que está encendido
-- ---------------------------------------------------------------------------
create or replace function public.finance_options()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  v := public.crm_options();
  return (v - 'payments_enabled' - 'payment_block_reason') || jsonb_build_object(
    'protocol', 'service-v1',
    'writes_enabled', public.finance_writes_ready(),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by display_order, name)
      from public.expense_categories
      where is_active
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.finance_options() from public, anon, authenticated;
grant execute on function public.finance_options() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. El arqueo de caja tiene que ver las transferencias
-- ---------------------------------------------------------------------------
-- Si alguien pasa efectivo de la caja fuerte al banco, la caja tiene menos
-- plata. Sin esta corrección, cerrar la caja inventaría un faltante.
create or replace function public.finance_cash_movements(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cash_accounts as (
    select id, currency from public.bank_accounts where account_type = 'caja_fuerte'
  ), cash as (
    select
      t.amount,
      t.currency::text as currency,
      t.type::text as type,
      t.account_id
    from public.transactions t
    join cash_accounts a on a.id = t.account_id
    where t.status::text = 'completed'
      and t.type::text in ('income', 'expense')
      and t.occurred_at >= p_from
      and t.occurred_at <= p_to
  ), transfers_out as (
    select
      t.amount,
      t.currency::text as currency,
      t.occurred_at
    from public.transactions t
    join cash_accounts a on a.id = t.account_id
    where t.type::text = 'transfer'
      and t.status::text = 'completed'
      and t.occurred_at >= p_from
      and t.occurred_at <= p_to
  ), transfers_in as (
    select
      case when a.currency = 'NIO' then t.amount_nio else round(t.amount_usd, 2) end as amount,
      a.currency::text as currency
    from public.transactions t
    join cash_accounts a on a.id = t.destination_account_id
    where t.type::text = 'transfer'
      and t.status::text = 'completed'
      and t.occurred_at >= p_from
      and t.occurred_at <= p_to
  ), totals as (
    select
      coalesce((select sum(amount) from cash where type = 'income' and currency = 'NIO'), 0) as income_nio,
      coalesce((select sum(amount) from cash where type = 'income' and currency = 'USD'), 0) as income_usd,
      coalesce((select sum(amount) from cash where type = 'expense' and currency = 'NIO'), 0) as expense_nio,
      coalesce((select sum(amount) from cash where type = 'expense' and currency = 'USD'), 0) as expense_usd,
      coalesce((select sum(amount) from transfers_in where currency = 'NIO'), 0) as transfer_in_nio,
      coalesce((select sum(amount) from transfers_in where currency = 'USD'), 0) as transfer_in_usd,
      coalesce((select sum(amount) from transfers_out where currency = 'NIO'), 0) as transfer_out_nio,
      coalesce((select sum(amount) from transfers_out where currency = 'USD'), 0) as transfer_out_usd,
      (select count(*) from cash)
        + (select count(*) from transfers_out)
        + (select count(*) from transfers_in) as movements
  )
  select jsonb_build_object(
    'incomeNio', totals.income_nio,
    'incomeUsd', totals.income_usd,
    'expenseNio', totals.expense_nio,
    'expenseUsd', totals.expense_usd,
    'transferInNio', totals.transfer_in_nio,
    'transferInUsd', totals.transfer_in_usd,
    'transferOutNio', totals.transfer_out_nio,
    'transferOutUsd', totals.transfer_out_usd,
    'count', totals.movements,
    'accounts', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'accountId', by_account.account_id,
            'currency', by_account.currency,
            'income', by_account.income,
            'expense', by_account.expense,
            'transferIn', by_account.transfer_in,
            'transferOut', by_account.transfer_out
          )
          order by by_account.account_id
        )
        from (
          select
            base.account_id,
            base.currency,
            coalesce(sum(base.income), 0) as income,
            coalesce(sum(base.expense), 0) as expense,
            coalesce(sum(base.transfer_in), 0) as transfer_in,
            coalesce(sum(base.transfer_out), 0) as transfer_out
          from (
            select account_id, currency, amount as income, 0::numeric as expense,
                   0::numeric as transfer_in, 0::numeric as transfer_out
            from cash where type = 'income'
            union all
            select account_id, currency, 0::numeric, amount, 0::numeric, 0::numeric
            from cash where type = 'expense'
            union all
            select t.account_id, t.currency::text, 0::numeric, 0::numeric, 0::numeric, t.amount
            from public.transactions t
            join cash_accounts a on a.id = t.account_id
            where t.type::text = 'transfer' and t.status::text = 'completed'
              and t.occurred_at >= p_from and t.occurred_at <= p_to
            union all
            select t.destination_account_id, a.currency::text, 0::numeric, 0::numeric,
                   case when a.currency = 'NIO' then t.amount_nio else round(t.amount_usd, 2) end,
                   0::numeric
            from public.transactions t
            join cash_accounts a on a.id = t.destination_account_id
            where t.type::text = 'transfer' and t.status::text = 'completed'
              and t.occurred_at >= p_from and t.occurred_at <= p_to
          ) base
          group by base.account_id, base.currency
        ) by_account
      ),
      '[]'::jsonb
    )
  )
  from totals;
$$;

revoke all on function public.finance_cash_movements(timestamptz, timestamptz)
  from public, anon, authenticated;

-- `finance_cash_row_json`: el «debería haber» suma lo que entró por
-- transferencia y resta lo que salió.
create or replace function public.finance_cash_row_json(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.cash_sessions;
  v_movements jsonb;
  v_expected_nio numeric;
  v_expected_usd numeric;
begin
  select * into v_session from public.cash_sessions where id = p_id;
  if not found then return null; end if;

  v_movements := public.finance_cash_movements(
    v_session.opened_at,
    coalesce(v_session.closed_at, now())
  );
  v_expected_nio := v_session.opening_balance_nio
    + coalesce((v_movements ->> 'incomeNio')::numeric, 0)
    - coalesce((v_movements ->> 'expenseNio')::numeric, 0)
    + coalesce((v_movements ->> 'transferInNio')::numeric, 0)
    - coalesce((v_movements ->> 'transferOutNio')::numeric, 0);
  v_expected_usd := v_session.opening_balance_usd
    + coalesce((v_movements ->> 'incomeUsd')::numeric, 0)
    - coalesce((v_movements ->> 'expenseUsd')::numeric, 0)
    + coalesce((v_movements ->> 'transferInUsd')::numeric, 0)
    - coalesce((v_movements ->> 'transferOutUsd')::numeric, 0);

  return jsonb_build_object(
    'id', v_session.id,
    'open', v_session.closed_at is null,
    'openedAt', v_session.opened_at,
    'openedById', v_session.opened_by,
    'openedByName', (select full_name from public.profiles where id = v_session.opened_by),
    'openingNio', v_session.opening_balance_nio,
    'openingUsd', v_session.opening_balance_usd,
    'closedAt', v_session.closed_at,
    'closedById', v_session.closed_by,
    'closedByName', (select full_name from public.profiles where id = v_session.closed_by),
    'countedNio', v_session.closing_balance_nio,
    'countedUsd', v_session.closing_balance_usd,
    'expectedNio', case
      when v_session.closed_at is null then v_expected_nio
      else v_session.expected_balance_nio
    end,
    'expectedUsd', case
      when v_session.closed_at is null then v_expected_usd
      else v_session.expected_balance_usd
    end,
    'differenceNio', v_session.difference_nio,
    'differenceUsd', v_session.difference_usd,
    'notes', v_session.notes,
    'closeNotes', v_session.close_notes,
    'movements', v_movements
  );
end $$;

revoke all on function public.finance_cash_row_json(uuid)
  from public, anon, authenticated;

-- `finance_cash_close` guarda el mismo «debería haber» que muestra la pantalla.
create or replace function public.finance_cash_close(
  p_request uuid,
  p_session uuid,
  p_counted_nio numeric,
  p_counted_usd numeric,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_session public.cash_sessions;
  v_existing uuid;
  v_movements jsonb;
  v_expected_nio numeric;
  v_expected_usd numeric;
  v_difference_nio numeric;
  v_difference_usd numeric;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null or p_session is null then raise exception 'INVALID_REQUEST'; end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'INVALID_NOTES';
  end if;
  if p_counted_nio is null or p_counted_usd is null
     or p_counted_nio < 0 or p_counted_usd < 0
     or p_counted_nio > 99999999 or p_counted_usd > 99999999
     or p_counted_nio <> round(p_counted_nio, 2)
     or p_counted_usd <> round(p_counted_usd, 2) then
    raise exception 'INVALID_AMOUNT';
  end if;

  select id into v_existing
  from public.cash_sessions
  where close_request_id = p_request;
  if found then return public.finance_cash_row_json(v_existing); end if;

  select * into v_session from public.cash_sessions where id = p_session for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_session.closed_at is not null then raise exception 'CASH_ALREADY_CLOSED'; end if;
  if v_session.opened_by <> auth.uid() and not public.is_admin() then
    raise exception 'CASH_NOT_YOURS';
  end if;

  v_movements := public.finance_cash_movements(v_session.opened_at, now());
  v_expected_nio := v_session.opening_balance_nio
    + coalesce((v_movements ->> 'incomeNio')::numeric, 0)
    - coalesce((v_movements ->> 'expenseNio')::numeric, 0)
    + coalesce((v_movements ->> 'transferInNio')::numeric, 0)
    - coalesce((v_movements ->> 'transferOutNio')::numeric, 0);
  v_expected_usd := v_session.opening_balance_usd
    + coalesce((v_movements ->> 'incomeUsd')::numeric, 0)
    - coalesce((v_movements ->> 'expenseUsd')::numeric, 0)
    + coalesce((v_movements ->> 'transferInUsd')::numeric, 0)
    - coalesce((v_movements ->> 'transferOutUsd')::numeric, 0);

  if abs(v_expected_nio) > 999999999.99 or abs(v_expected_usd) > 999999999.99 then
    raise exception 'INVALID_AMOUNT';
  end if;

  v_difference_nio := round(p_counted_nio - v_expected_nio, 2);
  v_difference_usd := round(p_counted_usd - v_expected_usd, 2);

  if v_notes is null and (v_difference_nio <> 0 or v_difference_usd <> 0) then
    raise exception 'CASH_DIFFERENCE_REASON_REQUIRED';
  end if;

  update public.cash_sessions set
    closed_by = auth.uid(),
    closed_at = now(),
    closing_balance_nio = p_counted_nio,
    closing_balance_usd = p_counted_usd,
    expected_balance_nio = v_expected_nio,
    expected_balance_usd = v_expected_usd,
    difference_nio = v_difference_nio,
    difference_usd = v_difference_usd,
    close_notes = v_notes,
    close_request_id = p_request
  where id = v_session.id;

  return public.finance_cash_row_json(v_session.id);
end $$;

revoke all on function public.finance_cash_close(uuid, uuid, numeric, numeric, text)
  from public, anon;
grant execute on function public.finance_cash_close(uuid, uuid, numeric, numeric, text)
  to authenticated;

-- La regla escrita que la pantalla de arqueo muestra al usuario.
create or replace function public.finance_cash_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_open_id uuid;
  v_history jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;

  select id into v_open_id
  from public.cash_sessions
  where closed_at is null
  order by opened_at desc, id
  limit 1;

  select coalesce(
    jsonb_agg(public.finance_cash_row_json(recent.id) order by recent.closed_at desc),
    '[]'::jsonb
  ) into v_history
  from (
    select id, closed_at
    from public.cash_sessions
    where closed_at is not null
    order by closed_at desc
    limit 20
  ) recent;

  return jsonb_build_object(
    'open', case when v_open_id is null then null
                 else public.finance_cash_row_json(v_open_id) end,
    'history', v_history,
    'cashRule', 'Cuenta de caja (caja_fuerte): apertura + ingresos − egresos ± transferencias con otras cuentas.'
  );
end $$;

revoke all on function public.finance_cash_state() from public, anon;
grant execute on function public.finance_cash_state() to authenticated;


notify pgrst, 'reload schema';

commit;
