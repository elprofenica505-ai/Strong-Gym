-- 00080 · FIN-01: anulación controlada de un movimiento
--
-- Problema: un cobro o un gasto cargado por error no se podía deshacer. La
-- única salida era tocar el saldo a mano o borrar la fila, y ninguna de las dos
-- deja rastro de quién lo hizo ni por qué. El interruptor `cashier_can_void`
-- existía desde la 00033 pero no hacía nada.
--
-- Decisión de esta etapa:
--   * Anular **no borra nada**: se inserta un movimiento de reversa con el
--     signo contrario, en la misma cuenta, moneda, método y cliente, y la
--     cuenta vuelve al saldo que tenía. El movimiento original queda como está.
--   * Un original solo se puede anular **una vez**: `finance_voids.original_id`
--     es único y una reversa no se puede volver a anular.
--   * Quién puede: administración siempre; caja **solo si** el interruptor
--     `cashier_can_void` está encendido, **solo sus propios movimientos** y
--     **solo los del día en curso** (America/Managua). Si el interruptor está
--     apagado, caja no ve el botón y la base igual lo rechaza.
--   * Motivo obligatorio (5 a 300 caracteres), actor, rol y fecha quedan
--     guardados en `finance_voids`.
--   * Idempotente por `request_id`: el mismo pedido repetido devuelve el mismo
--     comprobante; un pedido con el mismo id y otro contenido se rechaza.
--   * La reversa se puede leer desde Caja como «anulada», pero no se puede
--     editar ni borrar: la tabla solo tiene `select` para el personal.
--
-- Reversión segura: eliminar `finance_void_movement`, `finance_void_plan`,
-- `finance_voids_recent` y `finance_voids`. Los movimientos de reversa ya
-- creados quedan como movimientos normales y los saldos no cambian; no se
-- borra ningún dato existente.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.transactions') is null
     or to_regclass('public.bank_accounts') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.staff_permissions') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.is_cashier()') is null
     or to_regprocedure('public.crm_is_staff()') is null
     or to_regprocedure('public.finance_writes_ready()') is null
     or to_regprocedure('public.finance_permission_enabled(text)') is null
     or to_regprocedure('public.plan_local_today()') is null then
    raise exception 'VOID_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. El interruptor nace apagado si todavía no existe (00033 lo creó; esto es
--    idempotente y no cambia una decisión ya tomada).
insert into public.staff_permissions(key, enabled)
values ('cashier_can_void', false)
on conflict (key) do nothing;

-- 2. `cashier_can_void` entra en la lista blanca del helper existente. Sin esto,
--    la pantalla nunca podría mostrar el permiso y la base lo negaría siempre.
create or replace function public.finance_permission_enabled(p_key text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_key is null or p_key not in (
      'cashier_can_view_daily_close',
      'cashier_can_view_monthly_result',
      'cashier_can_view_charts',
      'cashier_can_view_account_balances',
      'cashier_can_manage_expenses',
      'cashier_can_view_receivables',
      'cashier_can_void'
    ) then false
    when public.is_admin() then true
    when public.is_cashier() then coalesce(
      (select enabled from public.staff_permissions where key = p_key),
      false
    )
    else false
  end;
$$;
revoke all on function public.finance_permission_enabled(text) from public, anon, authenticated;

-- 3. El permiso viaja al panel junto con los demás.
create or replace function public.cashier_permissions()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'dailyClose', public.finance_permission_enabled('cashier_can_view_daily_close'),
    'monthlyResult', public.finance_permission_enabled('cashier_can_view_monthly_result'),
    'charts', public.finance_permission_enabled('cashier_can_view_charts'),
    'accountBalances', public.finance_permission_enabled('cashier_can_view_account_balances'),
    'expenses', public.finance_permission_enabled('cashier_can_manage_expenses'),
    'receivables', public.finance_permission_enabled('cashier_can_view_receivables'),
    'void', public.finance_permission_enabled('cashier_can_void')
  );
$$;
revoke all on function public.cashier_permissions() from public, anon, authenticated;
grant execute on function public.cashier_permissions() to authenticated;

-- 4. La bitácora de anulaciones.
create table if not exists public.finance_voids (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null unique,
  original_id  uuid not null unique references public.transactions (id) on delete restrict,
  reversal_id  uuid not null unique references public.transactions (id) on delete restrict,
  reason       text not null check (char_length(reason) between 5 and 300),
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_name   text,
  actor_role   text,
  payload      jsonb not null,
  receipt      jsonb not null,
  created_at   timestamptz not null default now()
);

create index if not exists finance_voids_created_idx
  on public.finance_voids (created_at desc);

alter table public.finance_voids enable row level security;
revoke all on public.finance_voids from public, anon, authenticated;
grant select on public.finance_voids to authenticated;
drop policy if exists finance_voids_staff_read on public.finance_voids;
create policy finance_voids_staff_read on public.finance_voids
  for select to authenticated using (public.crm_is_staff());

-- 5. Consulta previa: qué pasaría si se anulara, sin escribir nada. La usa la
--    pantalla antes de pedir el motivo y la vuelve a aplicar el escritor.
create or replace function public.finance_void_plan(p_transaction uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_t public.transactions;
  v_void public.finance_voids;
  v_is_reversal boolean;
  v_admin boolean;
  v_cashier boolean;
  v_today boolean;
  v_own boolean;
  v_code text;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select * into v_t from public.transactions where id = p_transaction;
  if not found then raise exception 'NOT_FOUND'; end if;

  select * into v_void from public.finance_voids where original_id = p_transaction;
  v_is_reversal := exists (
    select 1 from public.finance_voids where reversal_id = p_transaction
  );
  v_admin := public.is_admin();
  v_cashier := public.is_cashier();
  v_own := v_t.created_by is not null and v_t.created_by = auth.uid();
  v_today := (v_t.occurred_at at time zone 'America/Managua')::date
    = public.plan_local_today();

  v_code := case
    -- Una transferencia mueve las dos puntas de una misma operación: no se
    -- anula con una sola reversa. Se corrige registrando otra transferencia.
    when v_t.type::text = 'transfer' then 'NOT_VOIDABLE'
    when v_void.id is not null then 'ALREADY_VOIDED'
    when v_is_reversal then 'IS_REVERSAL'
    when v_admin then 'ALLOWED'
    when v_cashier
      and public.finance_permission_enabled('cashier_can_void')
      and v_own and v_today then 'ALLOWED'
    when not v_cashier then 'NOT_ALLOWED'
    when not public.finance_permission_enabled('cashier_can_void') then 'PERMISSION_OFF'
    when not v_own then 'NOT_YOURS'
    when not v_today then 'NOT_TODAY'
    else 'NOT_ALLOWED'
  end;

  return jsonb_build_object(
    'transactionId', v_t.id,
    'concept', v_t.concept,
    'type', v_t.type::text,
    'amount', v_t.amount,
    'currency', v_t.currency,
    'occurredAt', v_t.occurred_at,
    'accountId', v_t.account_id,
    'isReversal', v_is_reversal,
    'alreadyVoided', v_void.id is not null,
    'voidedAt', v_void.created_at,
    'allowed', v_code = 'ALLOWED',
    'code', v_code
  );
end $$;
revoke all on function public.finance_void_plan(uuid) from public, anon, authenticated;
grant execute on function public.finance_void_plan(uuid) to authenticated;

-- 6. El escritor: inserta la reversa, mueve el saldo y guarda la bitácora.
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

  -- Lock en el mismo orden que los demás escritores: cuenta al final.
  select * into v_account from public.bank_accounts where id = v_t.account_id for update;
  if not found then raise exception 'INVALID_ACCOUNT'; end if;
  if v_account.currency <> v_t.currency then raise exception 'INVALID_ACCOUNT'; end if;

  -- La reversa devuelve el efecto: si entró plata, sale; si salió, entra.
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

-- 7. Lectura para la pantalla: qué movimientos de la lista ya están anulados.
create or replace function public.finance_voids_recent(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'originalId', original_id,
      'reversalId', reversal_id,
      'reason', reason,
      'actorName', actor_name,
      'createdAt', created_at
    ) order by created_at desc)
    from (
      select original_id, reversal_id, reason, actor_name, created_at
      from public.finance_voids
      order by created_at desc
      limit v_limit
    ) v
  ), '[]'::jsonb);
end $$;
revoke all on function public.finance_voids_recent(integer) from public, anon, authenticated;
grant execute on function public.finance_voids_recent(integer) to authenticated;

notify pgrst, 'reload schema';
commit;
