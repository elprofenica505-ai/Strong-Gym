-- Fixture de estructura derivado del diagnóstico remoto recibido (2026-10-15).

-- Sólo nombres/tipos/defaults/constraints/vista; NO contiene registros del negocio.

-- Ampliado con el diagnóstico de escritura recibido 2026-10-17 (precisiones confirmadas).
-- Los defaults nuevos y el escritor centinela son exclusivamente de prueba.

-- No usar como migración ni como instalación. Datos de prueba se agregan aparte.

create type public.transaction_status as enum ('pending', 'completed', 'cancelled');

create type public.transaction_type as enum ('income', 'expense', 'transfer');

create table public.expense_categories(
  id text primary key, name text not null, color text not null default '#999999',
  budget_monthly numeric(12,2), display_order integer not null default 0
);
create table public.cash_sessions(
  id uuid primary key default gen_random_uuid(), opened_by uuid not null references profiles(id),
  opened_at timestamptz not null default now(), closed_by uuid references profiles(id), closed_at timestamptz,
  opening_balance_nio numeric(12,2) not null default 0, opening_balance_usd numeric(12,2) not null default 0,
  closing_balance_nio numeric(12,2), closing_balance_usd numeric(12,2),
  expected_balance_nio numeric(12,2), expected_balance_usd numeric(12,2),
  difference_nio numeric(12,2), difference_usd numeric(12,2), notes text
);
-- Misma firma exportada; centinela SIN escrituras, no implementación de negocio.
create function public.record_payment(p_member_id uuid,p_amount numeric,p_currency text,p_method_id text,p_account_id text,p_plan_id text default null,p_concept text default 'Pago de membresía',p_reference text default null)
returns uuid language plpgsql security definer set search_path=public as $$
begin raise exception 'UNGUARDED_TEST_SENTINEL'; end $$;


create table public.bank_accounts (
  id text not null,
  name text not null,
  account_type text not null,
  currency text not null,
  bank_name text,
  account_number text,
  balance numeric(12,2) not null default 0,
  is_active boolean not null default true,
  display_order integer not null default 0,
  constraint bank_accounts_account_type_check CHECK (account_type = ANY (ARRAY['caja_fuerte'::text, 'banco'::text, 'billetera'::text])),
  constraint bank_accounts_currency_check CHECK (currency = ANY (ARRAY['NIO'::text, 'USD'::text])),
  constraint bank_accounts_pkey PRIMARY KEY (id)
);

create table public.member_balances (
  member_id uuid not null,
  credit_nio numeric(12,2) not null default 0,
  credit_usd numeric(12,2) not null default 0,
  debt_nio numeric(12,2) not null default 0,
  debt_usd numeric(12,2) not null default 0,
  last_payment_date timestamp with time zone,
  updated_at timestamp with time zone not null default now(),
  constraint member_balances_member_id_fkey FOREIGN KEY (member_id) REFERENCES profiles(id) ON DELETE CASCADE,
  constraint member_balances_pkey PRIMARY KEY (member_id)
);

create table public.payment_methods (
  id text not null,
  name text not null,
  currency text not null,
  fee_pct numeric not null default 0,
  is_active boolean not null default true,
  display_order integer not null default 0,
  constraint payment_methods_currency_check CHECK (currency = ANY (ARRAY['NIO'::text, 'USD'::text, 'BOTH'::text])),
  constraint payment_methods_pkey PRIMARY KEY (id)
);

create table public.transactions (
  id uuid not null default gen_random_uuid(),
  type public.transaction_type not null,
  status public.transaction_status not null default 'completed'::transaction_status,
  occurred_at timestamp with time zone not null default now(),
  account_id text not null,
  destination_account_id text,
  method_id text,
  category_id text,
  member_id uuid,
  coach_id text,
  plan_id text,
  amount numeric(12,2) not null,
  currency text not null,
  amount_nio numeric(12,2) not null,
  amount_usd numeric(12,4) not null,
  fx_used numeric(12,4) not null,
  concept text not null,
  reference text,
  receipt_url text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  constraint transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
  constraint transactions_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE SET NULL,
  constraint transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  constraint transactions_currency_check CHECK (currency = ANY (ARRAY['NIO'::text, 'USD'::text])),
  constraint transactions_destination_account_id_fkey FOREIGN KEY (destination_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  constraint transactions_member_id_fkey FOREIGN KEY (member_id) REFERENCES profiles(id) ON DELETE SET NULL,
  constraint transactions_method_id_fkey FOREIGN KEY (method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
  constraint transactions_pkey PRIMARY KEY (id),
  constraint transactions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
);

create view public.v_account_balances as  SELECT id,
    name,
    account_type,
    currency,
    balance,
    is_active
   FROM bank_accounts ba
  ORDER BY display_order;

-- Diagnóstico remoto: lista de triggers no internos vacía en estas tablas.

-- Políticas de estas seis tablas según el segundo CSV; sólo entorno de pruebas.
alter table public.bank_accounts enable row level security;
grant all on public.bank_accounts to anon,authenticated;
alter table public.cash_sessions enable row level security;
grant all on public.cash_sessions to anon,authenticated;
alter table public.expense_categories enable row level security;
grant all on public.expense_categories to anon,authenticated;
alter table public.member_balances enable row level security;
grant all on public.member_balances to anon,authenticated;
alter table public.payment_methods enable row level security;
grant all on public.payment_methods to anon,authenticated;
alter table public.transactions enable row level security;
grant all on public.transactions to anon,authenticated;
create policy "Authenticated can read bank_accounts" on public.bank_accounts for select to authenticated using (true);
create policy "Staff can write bank_accounts" on public.bank_accounts for all to authenticated using (is_staff()) with check (is_staff());
create policy "Staff can write cash_sessions" on public.cash_sessions for all to authenticated using (is_staff()) with check (is_staff());
create policy "Authenticated can read expense_categories" on public.expense_categories for select to authenticated using (true);
create policy "Staff can write expense_categories" on public.expense_categories for all to authenticated using (is_staff()) with check (is_staff());
create policy "Members see own balance" on public.member_balances for select to authenticated using (((member_id = auth.uid()) OR is_staff()));
create policy "Staff can write member_balances" on public.member_balances for all to authenticated using (is_staff()) with check (is_staff());
create policy "Authenticated can read payment_methods" on public.payment_methods for select to authenticated using (true);
create policy "Staff can write payment_methods" on public.payment_methods for all to authenticated using (is_staff()) with check (is_staff());
create policy "Members see own transactions" on public.transactions for select to authenticated using (((member_id = auth.uid()) OR is_staff()));
create policy "Staff can write transactions" on public.transactions for all to authenticated using (is_staff()) with check (is_staff());
