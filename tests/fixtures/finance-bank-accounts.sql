-- Fixture de estructura derivado del diagnóstico remoto recibido (2026-10-15).

-- Sólo nombres/tipos/defaults/constraints/vista; NO contiene registros del negocio.

-- La exportación no incluye precisión numérica, políticas RLS ni funciones no ligadas a triggers.

-- No usar como migración ni como instalación. Datos de prueba se agregan aparte.

create type public.transaction_status as enum ('pending', 'completed', 'cancelled');

create type public.transaction_type as enum ('income', 'expense', 'transfer');

create table public.expense_categories(id text primary key);

create table public.bank_accounts (
  id text not null,
  name text not null,
  account_type text not null,
  currency text not null,
  bank_name text,
  account_number text,
  balance numeric not null default 0,
  is_active boolean not null default true,
  display_order integer not null default 0,
  constraint bank_accounts_account_type_check CHECK (account_type = ANY (ARRAY['caja_fuerte'::text, 'banco'::text, 'billetera'::text])),
  constraint bank_accounts_currency_check CHECK (currency = ANY (ARRAY['NIO'::text, 'USD'::text])),
  constraint bank_accounts_pkey PRIMARY KEY (id)
);

create table public.member_balances (
  member_id uuid not null,
  credit_nio numeric not null default 0,
  credit_usd numeric not null default 0,
  debt_nio numeric not null default 0,
  debt_usd numeric not null default 0,
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
  amount numeric not null,
  currency text not null,
  amount_nio numeric not null,
  amount_usd numeric not null,
  fx_used numeric not null,
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
