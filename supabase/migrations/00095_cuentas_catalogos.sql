-- ============================================================
--  00095 — Cuentas de caja/banco, métodos y categorías (FIN-03, parte 1)
-- ============================================================
--  Poder administrar desde la app las cuentas donde entra la plata, los
--  métodos de pago y las categorías de gasto. Antes sólo existían en la base.
--
--  Reglas:
--    · Escribir exige administrador con segundo factor (`is_admin()`).
--      Leer exige personal con segundo factor (`crm_is_staff()`).
--    · Los saldos sólo se ven con el interruptor de saldos o siendo admin.
--    · Nada se borra: se apaga (`is_active`). No se apaga una caja con turno
--      abierto ni se le cambia la moneda a una cuenta con movimientos.
--    · Todo queda en `finance_settings_audit`: quién, cuándo, antes y después.
--
--  Aditiva: una tabla nueva, una columna con valor por omisión y funciones
--  nuevas. No toca datos existentes ni crea movimientos.
-- ============================================================

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Comprobaciones de lo que ya tiene que existir
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.bank_accounts') is null
     or to_regclass('public.payment_methods') is null
     or to_regclass('public.expense_categories') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.crm_is_staff()') is null
     or to_regprocedure('public.finance_permission_enabled(text)') is null
     or to_regprocedure('public.crm_options()') is null
     or to_regprocedure('public.finance_writes_ready()') is null then
    raise exception 'CUENTAS_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. Bitácora de los cambios de configuración del dinero
-- ---------------------------------------------------------------------------
create table if not exists public.finance_settings_audit (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  actor_id  uuid references public.profiles (id) on delete set null,
  action    text not null check (action in (
              'account_save', 'method_save', 'category_save',
              'transfer_create', 'transfer_void'
            )),
  target    text,
  details   jsonb not null default '{}'::jsonb
);

create index if not exists finance_settings_audit_at_idx
  on public.finance_settings_audit (at desc);

alter table public.finance_settings_audit enable row level security;
-- Nadie escribe ni lee esta tabla directamente: la escriben las funciones de
-- abajo (security definer) y la lee `finance_accounts_state` para el panel.
revoke all on public.finance_settings_audit from public, anon, authenticated;

-- Una categoría de gasto también se apaga en vez de borrarse. Los gastos
-- viejos siguen apuntando a su categoría.
alter table public.expense_categories
  add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Una sola lectura para la pantalla de cuentas
-- ---------------------------------------------------------------------------
create or replace function public.finance_accounts_state(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_can_manage boolean := public.is_admin();
  v_balances boolean := public.is_admin()
    or public.finance_permission_enabled('cashier_can_view_account_balances');
  v_accounts jsonb;
  v_methods jsonb;
  v_categories jsonb;
  v_transfers jsonb;
  v_audit jsonb;
begin
  if not public.crm_is_staff() then
    raise exception 'AUTH';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'name', a.name,
      'accountType', a.account_type,
      'currency', a.currency,
      'bankName', a.bank_name,
      'accountNumber', a.account_number,
      'isActive', a.is_active,
      'displayOrder', a.display_order,
      'balance', case when v_balances then a.balance else null end,
      'movements', (
        select count(*)
        from public.transactions t
        where t.account_id = a.id or t.destination_account_id = a.id
      ),
      'cashOpen', case
        when a.account_type = 'caja_fuerte'
          then exists(select 1 from public.cash_sessions c where c.closed_at is null)
        else false
      end
    ) order by a.display_order, a.name, a.id), '[]'::jsonb)
  into v_accounts
  from public.bank_accounts a;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'currency', m.currency,
      'feePct', m.fee_pct,
      'isActive', m.is_active,
      'displayOrder', m.display_order,
      'movements', (select count(*) from public.transactions t where t.method_id = m.id)
    ) order by m.display_order, m.name, m.id), '[]'::jsonb)
  into v_methods
  from public.payment_methods m;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'color', c.color,
      'budgetMonthly', c.budget_monthly,
      'isActive', c.is_active,
      'displayOrder', c.display_order,
      'movements', (select count(*) from public.transactions t where t.category_id = c.id)
    ) order by c.display_order, c.name, c.id), '[]'::jsonb)
  into v_categories
  from public.expense_categories c;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'occurredAt', t.occurred_at,
      'status', t.status,
      'fromId', t.account_id,
      'fromName', f.name,
      'toId', t.destination_account_id,
      'toName', d.name,
      'amountOut', t.amount,
      'currencyOut', t.currency,
      'amountIn', case
        when coalesce(d.currency, t.currency) = 'NIO' then round(t.amount_nio, 2)
        else round(t.amount_usd, 2)
      end,
      'currencyIn', coalesce(d.currency, t.currency),
      'fx', t.fx_used,
      'amountNio', t.amount_nio,
      'concept', t.concept,
      'createdByName', (select p.full_name from public.profiles p where p.id = t.created_by),
      'voided', exists(select 1 from public.finance_voids v where v.original_id = t.id),
      'voidReason', (select v.reason from public.finance_voids v where v.original_id = t.id)
    ) order by t.occurred_at desc, t.id desc), '[]'::jsonb)
  into v_transfers
  from (
    select *
    from public.transactions
    where type = 'transfer'
    order by occurred_at desc, id desc
    limit v_limit
  ) t
  join public.bank_accounts f on f.id = t.account_id
  left join public.bank_accounts d on d.id = t.destination_account_id;

  -- La bitácora sólo la ve quien puede cambiar la configuración.
  if v_can_manage then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id,
        'at', x.at,
        'action', x.action,
        'target', x.target,
        'actorName', (select p.full_name from public.profiles p where p.id = x.actor_id),
        'details', x.details
      ) order by x.at desc), '[]'::jsonb)
    into v_audit
    from (
      select * from public.finance_settings_audit order by at desc limit 20
    ) x;
  end if;

  return jsonb_build_object(
    'accounts', v_accounts,
    'methods', v_methods,
    'categories', v_categories,
    'transfers', v_transfers,
    'audit', coalesce(v_audit, '[]'::jsonb),
    'canManage', v_can_manage,
    'balancesVisible', v_balances,
    'rules', jsonb_build_object(
      'accountTypes', jsonb_build_array('caja_fuerte', 'banco', 'billetera'),
      'currencies', jsonb_build_array('NIO', 'USD'),
      'transferRule', 'Una transferencia mueve plata entre dos cuentas: no es ingreso ni gasto. Se guarda la tasa NIO/USD usada.'
    )
  );
end $$;

revoke all on function public.finance_accounts_state(integer) from public, anon;
grant execute on function public.finance_accounts_state(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Alta y edición de cuentas
-- ---------------------------------------------------------------------------
create or replace function public.finance_account_save(
  p_id text default null,
  p_name text default '',
  p_account_type text default 'caja_fuerte',
  p_currency text default 'NIO',
  p_bank_name text default null,
  p_account_number text default null,
  p_display_order integer default 100,
  p_is_active boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_id text := nullif(btrim(coalesce(p_id, '')), '');
  v_name text := btrim(coalesce(p_name, ''));
  v_type text := btrim(coalesce(p_account_type, ''));
  v_currency text := btrim(coalesce(p_currency, ''));
  v_bank text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_number text := nullif(btrim(coalesce(p_account_number, '')), '');
  v_row public.bank_accounts;
  v_before jsonb;
  v_deactivating boolean;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  if char_length(v_name) not between 2 and 60 then raise exception 'INVALID_NAME'; end if;
  if v_type not in ('caja_fuerte', 'banco', 'billetera') then raise exception 'INVALID_ACCOUNT_TYPE'; end if;
  if v_currency not in ('NIO', 'USD') then raise exception 'INVALID_CURRENCY'; end if;
  if v_bank is not null and char_length(v_bank) > 60 then raise exception 'INVALID_BANK'; end if;
  if v_number is not null and char_length(v_number) > 40 then raise exception 'INVALID_ACCOUNT_NUMBER'; end if;
  if p_display_order is null or p_display_order not between 0 and 9999 then
    raise exception 'INVALID_ORDER';
  end if;

  if v_id is null then
    if exists (select 1 from public.bank_accounts where lower(name) = lower(v_name)) then
      raise exception 'ACCOUNT_NAME_TAKEN';
    end if;
    v_id := 'cta_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.bank_accounts (
      id, name, account_type, currency, bank_name, account_number,
      balance, is_active, display_order
    ) values (
      v_id, v_name, v_type, v_currency, v_bank, v_number,
      0, coalesce(p_is_active, true), p_display_order
    ) returning * into v_row;
    v_before := null;
  else
    select * into v_row from public.bank_accounts where id = v_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if exists (
      select 1 from public.bank_accounts
      where lower(name) = lower(v_name) and id <> v_id
    ) then
      raise exception 'ACCOUNT_NAME_TAKEN';
    end if;

    -- Cambiar la moneda cambiaría el significado de todos sus movimientos.
    if v_currency <> v_row.currency
       and exists (
         select 1 from public.transactions
         where account_id = v_id or destination_account_id = v_id
       ) then
      raise exception 'ACCOUNT_CURRENCY_LOCKED';
    end if;

    v_deactivating := v_row.is_active and not coalesce(p_is_active, true);
    if v_deactivating
       and v_row.account_type = 'caja_fuerte'
       and exists (select 1 from public.cash_sessions where closed_at is null) then
      raise exception 'ACCOUNT_IN_OPEN_CASH';
    end if;

    v_before := to_jsonb(v_row);
    update public.bank_accounts set
      name = v_name,
      account_type = v_type,
      currency = v_currency,
      bank_name = v_bank,
      account_number = v_number,
      is_active = coalesce(p_is_active, true),
      display_order = p_display_order
    where id = v_id
    returning * into v_row;
  end if;

  insert into public.finance_settings_audit (actor_id, action, target, details)
  values (
    auth.uid(), 'account_save', v_id,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_row))
  );

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'accountType', v_row.account_type,
    'currency', v_row.currency,
    'bankName', v_row.bank_name,
    'accountNumber', v_row.account_number,
    'isActive', v_row.is_active,
    'displayOrder', v_row.display_order,
    'balance', v_row.balance
  );
end $$;

revoke all on function public.finance_account_save(text, text, text, text, text, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.finance_account_save(text, text, text, text, text, text, integer, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Alta y edición de métodos de pago
-- ---------------------------------------------------------------------------
create or replace function public.finance_method_save(
  p_id text default null,
  p_name text default '',
  p_currency text default 'NIO',
  p_fee_pct numeric default 0,
  p_display_order integer default 100,
  p_is_active boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_id text := nullif(btrim(coalesce(p_id, '')), '');
  v_name text := btrim(coalesce(p_name, ''));
  v_currency text := btrim(coalesce(p_currency, ''));
  v_fee numeric := coalesce(p_fee_pct, 0);
  v_row public.payment_methods;
  v_before jsonb;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  if char_length(v_name) not between 2 and 40 then raise exception 'INVALID_NAME'; end if;
  if v_currency not in ('NIO', 'USD', 'BOTH') then raise exception 'INVALID_CURRENCY'; end if;
  if v_fee < 0 or v_fee > 100 or v_fee <> round(v_fee, 2) then raise exception 'INVALID_FEE'; end if;
  if p_display_order is null or p_display_order not between 0 and 9999 then
    raise exception 'INVALID_ORDER';
  end if;

  if v_id is null then
    if exists (select 1 from public.payment_methods where lower(name) = lower(v_name)) then
      raise exception 'METHOD_NAME_TAKEN';
    end if;
    v_id := 'met_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.payment_methods (id, name, currency, fee_pct, is_active, display_order)
    values (v_id, v_name, v_currency, v_fee, coalesce(p_is_active, true), p_display_order)
    returning * into v_row;
    v_before := null;
  else
    select * into v_row from public.payment_methods where id = v_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if exists (
      select 1 from public.payment_methods
      where lower(name) = lower(v_name) and id <> v_id
    ) then
      raise exception 'METHOD_NAME_TAKEN';
    end if;
    v_before := to_jsonb(v_row);
    update public.payment_methods set
      name = v_name,
      currency = v_currency,
      fee_pct = v_fee,
      is_active = coalesce(p_is_active, true),
      display_order = p_display_order
    where id = v_id
    returning * into v_row;
  end if;

  insert into public.finance_settings_audit (actor_id, action, target, details)
  values (
    auth.uid(), 'method_save', v_id,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_row))
  );

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'currency', v_row.currency,
    'feePct', v_row.fee_pct,
    'isActive', v_row.is_active,
    'displayOrder', v_row.display_order
  );
end $$;

revoke all on function public.finance_method_save(text, text, text, numeric, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.finance_method_save(text, text, text, numeric, integer, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Alta y edición de categorías de gasto
-- ---------------------------------------------------------------------------
create or replace function public.finance_category_save(
  p_id text default null,
  p_name text default '',
  p_color text default '#888888',
  p_budget_monthly numeric default null,
  p_display_order integer default 100,
  p_is_active boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_id text := nullif(btrim(coalesce(p_id, '')), '');
  v_name text := btrim(coalesce(p_name, ''));
  v_color text := btrim(coalesce(p_color, '#888888'));
  v_budget numeric := p_budget_monthly;
  v_row public.expense_categories;
  v_before jsonb;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  if char_length(v_name) not between 2 and 40 then raise exception 'INVALID_NAME'; end if;
  if v_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'INVALID_COLOR'; end if;
  if v_budget is not null
     and (v_budget < 0 or v_budget > 99999999 or v_budget <> round(v_budget, 2)) then
    raise exception 'INVALID_BUDGET';
  end if;
  if p_display_order is null or p_display_order not between 0 and 9999 then
    raise exception 'INVALID_ORDER';
  end if;

  if v_id is null then
    if exists (select 1 from public.expense_categories where lower(name) = lower(v_name)) then
      raise exception 'CATEGORY_NAME_TAKEN';
    end if;
    v_id := 'cat_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.expense_categories (
      id, name, color, budget_monthly, display_order, is_active
    ) values (
      v_id, v_name, lower(v_color), v_budget, p_display_order, coalesce(p_is_active, true)
    ) returning * into v_row;
    v_before := null;
  else
    select * into v_row from public.expense_categories where id = v_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if exists (
      select 1 from public.expense_categories
      where lower(name) = lower(v_name) and id <> v_id
    ) then
      raise exception 'CATEGORY_NAME_TAKEN';
    end if;
    v_before := to_jsonb(v_row);
    update public.expense_categories set
      name = v_name,
      color = lower(v_color),
      budget_monthly = v_budget,
      display_order = p_display_order,
      is_active = coalesce(p_is_active, true)
    where id = v_id
    returning * into v_row;
  end if;

  insert into public.finance_settings_audit (actor_id, action, target, details)
  values (
    auth.uid(), 'category_save', v_id,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_row))
  );

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'color', v_row.color,
    'budgetMonthly', v_row.budget_monthly,
    'isActive', v_row.is_active,
    'displayOrder', v_row.display_order
  );
end $$;

revoke all on function public.finance_category_save(text, text, text, numeric, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.finance_category_save(text, text, text, numeric, integer, boolean)
  to authenticated;

notify pgrst, 'reload schema';

commit;
