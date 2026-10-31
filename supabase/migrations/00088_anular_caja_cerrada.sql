-- 00088 · FIN-04 (segunda parte): un movimiento de una caja ya cerrada no se anula
--
-- Qué faltaba: FIN-04 pedía cierre «con bloqueo o aviso claro para movimientos
-- de un día cerrado». La 00087 agregó abrir, contar y cerrar, pero después de
-- cerrar todavía se podía anular un cobro en efectivo de ese turno: la reversa
-- entra a la cuenta de caja y el arqueo firmado deja de significar algo. Nadie
-- se enteraba, porque la anulación es de hoy y la caja se cerró hace un rato.
--
-- Qué agrega: `finance_void_plan` gana una regla y un dato.
--   · Regla `CASH_SESSION_CLOSED`: si el movimiento es de efectivo (cuenta de
--     caja, `account_type = 'caja_fuerte'`) y ocurrió dentro de una sesión de
--     caja **ya cerrada**, no se anula. Vale para todos los roles, incluido
--     administración: el arqueo es un hecho guardado, no un borrador.
--   · El plan devuelve `closedCashSession` para que la pantalla pueda explicar
--     el motivo sin adivinar por el código.
--
-- Qué NO cambia: las demás reglas de anulación siguen igual y en el mismo
-- orden (transferencia, ya anulada, es una reversa, administración, cajero con
-- interruptor/dueño/día). Un movimiento de banco o billetera, aunque haya una
-- caja cerrada, se sigue anulando como siempre: no forma parte del arqueo.
-- Un movimiento de efectivo **posterior** al cierre también se puede anular:
-- pertenece al turno siguiente o a ninguno, no al arqueo firmado.
--
-- Reversible: volver a aplicar la definición de `finance_void_plan` de la
-- 00080 deja todo como estaba. No se borra ni se migra ningún dato.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.cash_sessions') is null
     or to_regclass('public.transactions') is null
     or to_regclass('public.bank_accounts') is null
     or to_regclass('public.finance_voids') is null
     or to_regprocedure('public.crm_is_staff()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.is_cashier()') is null
     or to_regprocedure('public.finance_permission_enabled(text)') is null
     or to_regprocedure('public.plan_local_today()') is null then
    raise exception 'VOID_CLOSED_CASH_PREREQUISITE_MISSING';
  end if;
end $$;

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
  v_closed_cash boolean;
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
  -- FIN-04: ¿este efectivo ya quedó dentro de un arqueo cerrado?
  v_closed_cash := exists (
    select 1
    from public.cash_sessions s
    join public.bank_accounts a on a.id = v_t.account_id
    where s.closed_at is not null
      and a.account_type = 'caja_fuerte'
      and v_t.occurred_at >= s.opened_at
      and v_t.occurred_at <= s.closed_at
  );

  v_code := case
    -- Una transferencia mueve las dos puntas de una misma operación: no se
    -- anula con una sola reversa. Se corrige registrando otra transferencia.
    when v_t.type::text = 'transfer' then 'NOT_VOIDABLE'
    when v_void.id is not null then 'ALREADY_VOIDED'
    when v_is_reversal then 'IS_REVERSAL'
    -- Antes de «administración puede todo»: el arqueo cerrado no se reescribe.
    when v_closed_cash then 'CASH_SESSION_CLOSED'
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
    'closedCashSession', v_closed_cash,
    'allowed', v_code = 'ALLOWED',
    'code', v_code
  );
end $$;
revoke all on function public.finance_void_plan(uuid) from public, anon, authenticated;
grant execute on function public.finance_void_plan(uuid) to authenticated;

-- Función chica y probada aparte: qué movimiento cayó dentro de una caja ya
-- cerrada. La usa el plan y la puede usar cualquier informe futuro sin copiar
-- la regla.
create or replace function public.finance_cash_session_closed(p_transaction uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.transactions t
    join public.bank_accounts a on a.id = t.account_id
    join public.cash_sessions s
      on s.closed_at is not null
     and t.occurred_at >= s.opened_at
     and t.occurred_at <= s.closed_at
    where t.id = p_transaction
      and a.account_type = 'caja_fuerte'
  );
$$;
revoke all on function public.finance_cash_session_closed(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
