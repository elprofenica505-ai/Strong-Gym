-- Cobros por servicio y gastos. Sólo bank_accounts_split revisado 2026-10-17.
-- Requiere FASE2 + COMPATIBILIDAD-CRM + LECTURA-CAJA. Respaldar antes.
-- No carga ejemplos, recalcula históricos, aplica deuda/crédito ni renueva planes.
begin;
do $$ begin
  if public.crm_finance_layout()<>'bank_accounts_split' then raise exception 'FINANCE_SCHEMA_UNSUPPORTED'; end if;
  if exists(select 1 from pg_trigger where tgrelid in ('public.transactions'::regclass,'public.bank_accounts'::regclass) and not tgisinternal and tgenabled<>'D') then raise exception 'FINANCE_TRIGGER_REVIEW_REQUIRED'; end if;
end $$;
create table if not exists public.finance_entries (
  transaction_id uuid primary key references public.transactions(id) on delete restrict,
  request_id uuid not null unique,
  payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.finance_entries enable row level security;
revoke all on public.finance_entries from public,anon,authenticated;
grant select on public.finance_entries to authenticated;
drop policy if exists finance_entries_staff_read on public.finance_entries;
create policy finance_entries_staff_read on public.finance_entries for select to authenticated using (public.crm_is_staff());
-- Se cierra la escritura directa: movimiento y saldo sólo se cambian juntos.
revoke all on public.transactions,public.bank_accounts from public,anon,authenticated;
grant select on public.transactions,public.bank_accounts to authenticated;
create or replace function public.finance_writes_ready()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.crm_finance_layout()='bank_accounts_split'
    and not exists(select 1 from pg_trigger where tgrelid in ('public.transactions'::regclass,'public.bank_accounts'::regclass,'public.finance_entries'::regclass) and not tgisinternal and tgenabled<>'D')
    and not exists(select 1 from unnest(array['public.transactions','public.bank_accounts','public.finance_entries']) as targets(tab)
      where has_table_privilege('authenticated',tab,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_table_privilege('anon',tab,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
$$;
revoke all on function public.finance_writes_ready() from public,anon,authenticated;
create or replace function public.finance_options()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  v:=public.crm_options();
  return (v-'payments_enabled'-'payment_block_reason') || jsonb_build_object('protocol','service-v1','writes_enabled',public.finance_writes_ready(),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by display_order) from public.expense_categories),'[]'::jsonb));
end $$;
revoke all on function public.finance_options() from public,anon,authenticated;
grant execute on function public.finance_options() to authenticated;
create or replace function public.finance_record_movement(
  p_request uuid,p_kind text,p_client uuid,p_amount numeric,p_currency text,
  p_method text,p_account text,p_concept text,p_fx numeric,p_category text default null
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
  if p_kind is null or p_kind not in ('service_income','expense')
    or p_amount is null or p_amount<=0 or p_amount>99999999 or p_amount<>round(p_amount,2)
    or p_currency is null or p_currency not in ('NIO','USD')
    or p_fx is null or p_fx<0.0001 or p_fx>10000 or p_fx<>round(p_fx,4)
    or p_concept is null or length(trim(p_concept)) not between 2 and 200
    or (p_kind='service_income' and (p_client is null or p_category is not null))
    or (p_kind='expense' and (p_client is not null or p_category is null)) then raise exception 'INVALID_PAYMENT'; end if;
  if p_kind='service_income' then
    select full_name,profile_id into v_name,v_profile from public.gym_clients where id=p_client for share;
    if not found then raise exception 'NOT_FOUND'; end if;
  else
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
  if p_kind='service_income' then
    insert into public.client_events(client_id,action,details,actor_id)
      values(p_client,'payment',jsonb_build_object('transaction_id',v_id,'kind',p_kind),v_actor);
  end if;
  return v_id;
end $$;
revoke all on function public.finance_record_movement(uuid,text,uuid,numeric,text,text,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.finance_record_movement(uuid,text,uuid,numeric,text,text,text,text,numeric,text) to authenticated;
create or replace function public.finance_receipt(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select receipt into v from public.finance_entries where transaction_id=p_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  return v;
end $$;
revoke all on function public.finance_receipt(uuid) from public,anon,authenticated;
grant execute on function public.finance_receipt(uuid) to authenticated;
create or replace function public.finance_recent_receipts(p_kind text,p_client uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_kind is null or p_kind not in ('service_income','expense')
    or (p_kind='service_income' and p_client is null)
    or (p_kind='expense' and p_client is not null) then raise exception 'INVALID_PAYMENT'; end if;
  return coalesce((select jsonb_agg(receipt order by created_at desc,transaction_id) from (
    select receipt,created_at,transaction_id from public.finance_entries
    where payload->>'kind'=p_kind and (p_client is null or payload->>'client'=p_client::text)
    order by created_at desc,transaction_id limit 50
  ) r),'[]'::jsonb);
end $$;
revoke all on function public.finance_recent_receipts(text,uuid) from public,anon,authenticated;
grant execute on function public.finance_recent_receipts(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
