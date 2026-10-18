-- Deudas y abonos manuales. Sólo bank_accounts_split con COBROS-GASTOS instalado.
-- No importa saldos, renueva planes, compensa créditos ni convierte deudas.
begin;
do $$ begin
  if public.crm_finance_layout()<>'bank_accounts_split' or to_regclass('public.finance_entries') is null
    then raise exception 'FINANCE_SCHEMA_UNSUPPORTED'; end if;
end $$;
create table if not exists public.client_debt_balances (
  client_id uuid primary key references public.gym_clients(id) on delete restrict,
  credit_nio numeric(12,2) not null check(credit_nio>=0),
  credit_usd numeric(12,2) not null check(credit_usd>=0),
  debt_nio numeric(12,2) not null check(debt_nio>=0),
  debt_usd numeric(12,2) not null check(debt_usd>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.client_debt_entries (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  client_id uuid not null references public.gym_clients(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  transaction_id uuid unique references public.transactions(id) on delete restrict,
  payload jsonb not null, receipt jsonb not null, created_at timestamptz not null default now()
);
create index if not exists client_debt_entries_client_idx on public.client_debt_entries(client_id,created_at desc,id);
alter table public.client_debt_balances enable row level security;
alter table public.client_debt_entries enable row level security;
revoke all on public.client_debt_balances,public.client_debt_entries from public,anon,authenticated;
grant select on public.client_debt_balances,public.client_debt_entries to authenticated;
drop policy if exists client_debt_balances_staff_read on public.client_debt_balances;
create policy client_debt_balances_staff_read on public.client_debt_balances for select to authenticated using(public.crm_is_staff());
drop policy if exists client_debt_entries_staff_read on public.client_debt_entries;
create policy client_debt_entries_staff_read on public.client_debt_entries for select to authenticated using(public.crm_is_staff());
revoke insert,update,delete,truncate,references,trigger on public.member_balances from public,anon,authenticated;

-- Cambiar el vínculo con saldos presentes exige una conciliación explícita, no copiar/mezclar.
create or replace function public.finance_protect_client_balance_link()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.profile_id is distinct from old.profile_id and
    (exists(select 1 from public.client_debt_balances where client_id=old.id)
      or exists(select 1 from public.member_balances where member_id=old.profile_id))
    then raise exception 'BALANCE_LINK_RECONCILIATION_REQUIRED'; end if;
  return new;
end $$;
revoke all on function public.finance_protect_client_balance_link() from public,anon,authenticated;
drop trigger if exists finance_protect_client_balance_link on public.gym_clients;
create trigger finance_protect_client_balance_link before update of profile_id on public.gym_clients
for each row execute function public.finance_protect_client_balance_link();

create or replace function public.finance_protect_profile_balance_delete()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.member_balances where member_id=old.id)
    then raise exception 'BALANCE_LINK_RECONCILIATION_REQUIRED'; end if;
  return old;
end $$;
revoke all on function public.finance_protect_profile_balance_delete() from public,anon,authenticated;
drop trigger if exists finance_protect_profile_balance_delete on public.profiles;
create trigger finance_protect_profile_balance_delete before delete on public.profiles
for each row execute function public.finance_protect_profile_balance_delete();

create or replace function public.finance_client_balance(p_client uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_profile uuid; v_values jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select profile_id into v_profile from public.gym_clients where id=p_client;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_profile is not null then
    if exists(select 1 from public.client_debt_balances where client_id=p_client)
      then raise exception 'BALANCE_LINK_RECONCILIATION_REQUIRED'; end if;
    select jsonb_build_object('credit_nio',credit_nio,'credit_usd',credit_usd,'debt_nio',debt_nio,'debt_usd',debt_usd)
      into v_values from public.member_balances where member_id=v_profile;
  else
    select jsonb_build_object('credit_nio',credit_nio,'credit_usd',credit_usd,'debt_nio',debt_nio,'debt_usd',debt_usd)
      into v_values from public.client_debt_balances where client_id=p_client;
  end if;
  return jsonb_build_object('clientId',p_client,'profileId',v_profile,'source',case when v_profile is null then 'client' else 'profile' end,
    'balances',v_values);
end $$;
revoke all on function public.finance_client_balance(uuid) from public,anon,authenticated;
grant execute on function public.finance_client_balance(uuid) to authenticated;

create or replace function public.finance_debt_ready()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.finance_writes_ready() and to_regprocedure('public.finance_debt_report(text)') is not null
    and position('finance_record_movement_before_debts' in pg_get_functiondef('public.finance_record_movement(uuid,text,uuid,numeric,text,text,text,text,numeric,text)'::regprocedure))>0
    and position('finance_read_before_debts' in pg_get_functiondef('public.finance_read(text,integer)'::regprocedure))>0
    and position('finance_client_balance' in pg_get_functiondef('public.crm_detail(uuid)'::regprocedure))>0
    and not exists(
    select 1 from pg_trigger where tgrelid in ('public.member_balances'::regclass,'public.client_debt_balances'::regclass,'public.client_debt_entries'::regclass)
      and not tgisinternal and tgenabled<>'D') and not exists(
    select 1 from unnest(array['public.member_balances','public.client_debt_balances','public.client_debt_entries']) t(tab)
    where has_table_privilege('authenticated',tab,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('anon',tab,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
$$;
revoke all on function public.finance_debt_ready() from public,anon,authenticated;

create or replace function public.finance_debt_record(
  p_request uuid,p_kind text,p_client uuid,p_amount numeric,p_currency text,p_concept text,
  p_method text default null,p_account text default null,p_fx numeric default null,p_open jsonb default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='5s' as $$
declare v_actor uuid:=auth.uid(); v_actor_name text; v_role text; v_client public.gym_clients;
  v_payload jsonb; v_existing public.client_debt_entries; v_before jsonb; v_after jsonb;
  v_balance jsonb; v_debt numeric; v_next numeric; v_id uuid:=gen_random_uuid(); v_tx uuid;
  v_receipt jsonb; v_at timestamptz:=clock_timestamp(); v_key text; v_n numeric;
begin
  select full_name,role::text into v_actor_name,v_role from public.profiles where id=v_actor for share;
  if not found or not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  v_payload:=jsonb_build_object('kind',p_kind,'client',p_client,'amount',p_amount,'currency',p_currency,
    'concept',trim(p_concept),'method',p_method,'account',p_account,'fx',p_fx,'opening',p_open);
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into v_existing from public.client_debt_entries where request_id=p_request;
  if found then
    if v_existing.payload is distinct from v_payload then raise exception 'REQUEST_CONFLICT'; end if;
    return v_existing.receipt;
  end if;
  if exists(select 1 from public.finance_entries where request_id=p_request) then raise exception 'REQUEST_CONFLICT'; end if;
  if not public.finance_debt_ready() then raise exception 'FINANCE_REVIEW_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('opening','charge','payment') or p_client is null
    or p_concept is null or length(trim(p_concept)) not between 2 and 200 then raise exception 'INVALID_DEBT'; end if;
  if p_kind='opening' then
    if v_role<>'admin' then raise exception 'ADMIN_REQUIRED'; end if;
    if p_amount is not null or p_currency is not null or p_method is not null or p_account is not null or p_fx is not null
      or p_open is null or jsonb_typeof(p_open)<>'object' then raise exception 'INVALID_DEBT'; end if;
    if (select count(*) from jsonb_object_keys(p_open))<>4 then raise exception 'INVALID_DEBT'; end if;
    foreach v_key in array array['credit_nio','credit_usd','debt_nio','debt_usd'] loop
      if jsonb_typeof(p_open->v_key) is distinct from 'number' then raise exception 'INVALID_DEBT'; end if;
      v_n:=(p_open->>v_key)::numeric;
      if v_n<0 or v_n>9999999999.99 or v_n<>round(v_n,2) then raise exception 'INVALID_DEBT'; end if;
    end loop;
  else
    if p_open is not null or p_amount is null or p_amount<=0 or p_amount>99999999 or p_amount<>round(p_amount,2)
      or p_currency is null or p_currency not in ('NIO','USD') then raise exception 'INVALID_DEBT'; end if;
    if p_kind='charge' and (p_method is not null or p_account is not null or p_fx is not null) then raise exception 'INVALID_DEBT'; end if;
    if p_kind='payment' and (p_method is null or p_account is null or p_fx is null) then raise exception 'INVALID_DEBT'; end if;
  end if;
  select * into v_client from public.gym_clients where id=p_client for share;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('client-balance:'||coalesce(v_client.profile_id::text,p_client::text),0));
  if v_client.profile_id is not null then
    perform 1 from public.member_balances where member_id=v_client.profile_id for update;
  else
    perform 1 from public.client_debt_balances where client_id=p_client for update;
  end if;
  v_balance:=public.finance_client_balance(p_client); v_before:=v_balance->'balances';
  if p_kind='opening' then
    if v_before<>'null'::jsonb then raise exception 'BALANCE_ALREADY_EXISTS'; end if;
    if v_client.profile_id is not null then
      insert into public.member_balances(member_id,credit_nio,credit_usd,debt_nio,debt_usd)
        values(v_client.profile_id,(p_open->>'credit_nio')::numeric,(p_open->>'credit_usd')::numeric,(p_open->>'debt_nio')::numeric,(p_open->>'debt_usd')::numeric);
    else
      insert into public.client_debt_balances(client_id,credit_nio,credit_usd,debt_nio,debt_usd)
        values(p_client,(p_open->>'credit_nio')::numeric,(p_open->>'credit_usd')::numeric,(p_open->>'debt_nio')::numeric,(p_open->>'debt_usd')::numeric);
    end if;
  else
    if v_before='null'::jsonb then raise exception 'BALANCE_NOT_INITIALIZED'; end if;
    foreach v_key in array array['credit_nio','credit_usd','debt_nio','debt_usd'] loop
      v_n:=(v_before->>v_key)::numeric;
      if v_n is null or v_n<0 or v_n>9999999999.99 then raise exception 'INVALID_DEBT'; end if;
    end loop;
    v_key:=case when p_currency='NIO' then 'debt_nio' else 'debt_usd' end;
    v_debt:=(v_before->>v_key)::numeric;
    if v_debt is null or v_debt<0 then raise exception 'INVALID_DEBT'; end if;
    if p_kind='payment' and p_amount>v_debt then raise exception 'PAYMENT_EXCEEDS_DEBT'; end if;
    v_next:=v_debt+case when p_kind='charge' then p_amount else -p_amount end;
    if v_next>9999999999.99 then raise exception 'INVALID_DEBT'; end if;
    if p_kind='payment' then
      -- Reutiliza el escritor atómico revisado; la clasificación final se guarda antes del commit.
      v_tx:=public.finance_record_movement(p_request,'service_income',p_client,p_amount,p_currency,p_method,p_account,p_concept,p_fx,null);
      update public.finance_entries set payload=jsonb_set(payload,'{kind}','"debt_payment"'::jsonb),
        receipt=receipt||jsonb_build_object('kind','debt_payment','debtBefore',v_debt,'debtAfter',v_next)
        where transaction_id=v_tx;
      update public.client_events set details=details||jsonb_build_object('kind','debt_payment')
        where client_id=p_client and details->>'transaction_id'=v_tx::text;
    end if;
    if v_client.profile_id is not null then
      update public.member_balances set debt_nio=case when p_currency='NIO' then v_next else debt_nio end,
        debt_usd=case when p_currency='USD' then v_next else debt_usd end,updated_at=v_at where member_id=v_client.profile_id;
    else
      update public.client_debt_balances set debt_nio=case when p_currency='NIO' then v_next else debt_nio end,
        debt_usd=case when p_currency='USD' then v_next else debt_usd end,updated_at=v_at where client_id=p_client;
    end if;
  end if;
  v_after:=public.finance_client_balance(p_client)->'balances';
  v_receipt:=jsonb_build_object('id',v_id,'reference','SD-'||v_id::text,'requestId',p_request,'kind',p_kind,
    'clientId',p_client,'clientName',v_client.full_name,'actorId',v_actor,'actorName',v_actor_name,
    'occurredAt',v_at,'concept',trim(p_concept),'currency',p_currency,'amount',p_amount,
    'before',v_before,'after',v_after,'transactionId',v_tx);
  insert into public.client_debt_entries(id,request_id,client_id,actor_id,transaction_id,payload,receipt,created_at)
    values(v_id,p_request,p_client,v_actor,v_tx,v_payload,v_receipt,v_at);
  if p_kind<>'payment' then
    insert into public.client_events(client_id,action,details,actor_id)
      values(p_client,'debt_'||p_kind,jsonb_build_object('reference',v_id,'concept',trim(p_concept)),v_actor);
  end if;
  return v_receipt;
end $$;
revoke all on function public.finance_debt_record(uuid,text,uuid,numeric,text,text,text,text,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.finance_debt_record(uuid,text,uuid,numeric,text,text,text,text,numeric,jsonb) to authenticated;
create or replace function public.finance_debt_detail(p_client uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb; v_role text;
begin
  v:=public.finance_client_balance(p_client);
  select role::text into v_role from public.profiles where id=auth.uid();
  return v||jsonb_build_object('clientName',(select full_name from public.gym_clients where id=p_client),'protocol','debt-v1','writesEnabled',public.finance_debt_ready(),'canOpen',v_role='admin',
    'entries',coalesce((select jsonb_agg(receipt order by created_at desc,id) from(
      select receipt,created_at,id from public.client_debt_entries where client_id=p_client order by created_at desc,id limit 50
    )e),'[]'::jsonb));
end $$;
revoke all on function public.finance_debt_detail(uuid) from public,anon,authenticated;
grant execute on function public.finance_debt_detail(uuid) to authenticated;

-- Envolver el lector existente, sin cambiar sus otras secciones ni fórmulas.
do $$ begin
  if to_regprocedure('public.finance_read_before_debts(text,integer)') is null then
    execute replace(pg_get_functiondef('public.finance_read(text,integer)'::regprocedure),
      'FUNCTION public.finance_read(', 'FUNCTION public.finance_read_before_debts(');
  end if;
end $$;
revoke all on function public.finance_read_before_debts(text,integer) from public,anon,authenticated;
create or replace function public.finance_read(p_section text,p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if public.crm_finance_layout()<>'bank_accounts_split' then raise exception 'FINANCE_SCHEMA_UNSUPPORTED'; end if;
  v:=public.finance_read_before_debts(p_section,p_limit);
  if p_section='summary' then
    v:=jsonb_set(v,'{data,totalOwed}',to_jsonb(coalesce((v#>>'{data,totalOwed}')::numeric,0)+(select coalesce(sum(debt_nio),0) from public.client_debt_balances)));
    v:=jsonb_set(v,'{data,totalOwedUsd}',to_jsonb(coalesce((v#>>'{data,totalOwedUsd}')::numeric,0)+(select coalesce(sum(debt_usd),0) from public.client_debt_balances)));
  elsif p_section='receivables' then
    select jsonb_set(v,'{data}',coalesce(jsonb_agg(r order by (r->>'total_owed_nio')::numeric desc,r->>'member_id',r->>'client_id'),'[]'::jsonb)) into v from (
      select value as r from jsonb_array_elements(v->'data')
      union all
      select jsonb_build_object('member_id',null,'client_id',c.id,'full_name',c.full_name,'email',c.email,'phone',c.phone,
        'invoices_open',null,'total_owed_nio',b.debt_nio,'total_owed_usd',b.debt_usd,'oldest_due',null,'days_overdue',null)
      from public.client_debt_balances b join public.gym_clients c on c.id=b.client_id where b.debt_nio>0 or b.debt_usd>0
    )r;
  end if;
  return v;
end $$;
revoke all on function public.finance_read(text,integer) from public,anon,authenticated;
grant execute on function public.finance_read(text,integer) to authenticated;

-- Mismo espacio de referencias para operaciones de deuda y de Caja.
do $$ begin
  if to_regprocedure('public.finance_record_movement_before_debts(uuid,text,uuid,numeric,text,text,text,text,numeric,text)') is null then
    execute replace(pg_get_functiondef('public.finance_record_movement(uuid,text,uuid,numeric,text,text,text,text,numeric,text)'::regprocedure),
      'FUNCTION public.finance_record_movement(', 'FUNCTION public.finance_record_movement_before_debts(');
  end if;
end $$;
revoke all on function public.finance_record_movement_before_debts(uuid,text,uuid,numeric,text,text,text,text,numeric,text) from public,anon,authenticated;
create or replace function public.finance_record_movement(
  p_request uuid,p_kind text,p_client uuid,p_amount numeric,p_currency text,p_method text,p_account text,p_concept text,p_fx numeric,p_category text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp set lock_timeout='5s' as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  if exists(select 1 from public.client_debt_entries where request_id=p_request) then raise exception 'REQUEST_CONFLICT'; end if;
  return public.finance_record_movement_before_debts(p_request,p_kind,p_client,p_amount,p_currency,p_method,p_account,p_concept,p_fx,p_category);
end $$;
revoke all on function public.finance_record_movement(uuid,text,uuid,numeric,text,text,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.finance_record_movement(uuid,text,uuid,numeric,text,text,text,text,numeric,text) to authenticated;

create or replace function public.crm_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_client public.gym_clients; v_layout text; v_balance numeric;
  v_balances jsonb; v_state text; v_collections jsonb; v_payments jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select * into v_client from public.gym_clients where id=p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_layout := public.crm_finance_layout();
  v_state := case when v_layout='unsupported' then 'unsupported'
    when v_client.profile_id is null then 'unlinked' else 'missing' end;
  if v_layout='bank_accounts_split' then
    v_balances:=public.finance_client_balance(p_id)->'balances';
    if v_balances is not null and v_balances<>'null'::jsonb then v_state:='ready'; else v_balances:=null; end if;
  elsif v_layout='repository' and v_client.profile_id is not null then
    select balance_nio into v_balance from public.member_balances where member_id=v_client.profile_id;
    if found then v_state:='ready'; end if;
  end if;
  if v_layout in ('repository','bank_accounts_split') then
    -- Sólo ingresos: el vínculo explícito de ficha prevalece sobre member_id legado.
    -- to_jsonb permite leer direction/type sin referenciar columnas inexistentes.
    with income as (
      select t.* from public.transactions t
      where (t.client_id=p_id or (t.client_id is null and v_client.profile_id is not null and t.member_id=v_client.profile_id))
        and (case when v_layout='repository' then to_jsonb(t)->>'direction' else to_jsonb(t)->>'type' end)='income'
    )
    select jsonb_build_object(
      'count_nio',count(*) filter(where status::text='completed' and currency::text='NIO'),
      'amount_nio',coalesce(sum(amount) filter(where status::text='completed' and currency::text='NIO'),0),
      'count_usd',count(*) filter(where status::text='completed' and currency::text='USD'),
      'amount_usd',coalesce(sum(amount) filter(where status::text='completed' and currency::text='USD'),0))
    into v_collections from income;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at desc,t.id desc),'[]'::jsonb)
    into v_payments from (
      select id,occurred_at,concept,amount,currency,status from public.transactions t
      where (t.client_id=p_id or (t.client_id is null and v_client.profile_id is not null and t.member_id=v_client.profile_id))
        and (case when v_layout='repository' then to_jsonb(t)->>'direction' else to_jsonb(t)->>'type' end)='income'
      order by occurred_at desc,id desc limit 40
    ) t;
  end if;
  return jsonb_build_object('client',to_jsonb(v_client),'card',public.crm_get_card(p_id),
    'visits',coalesce((select jsonb_agg(to_jsonb(v)) from (select * from public.client_visits where client_id=p_id order by visited_at desc limit 60)v),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.client_events where client_id=p_id order by created_at desc limit 40)e),'[]'::jsonb),
    'payments',coalesce(v_payments,'[]'::jsonb),'balance',v_balance,'balances',v_balances,'finance_layout',v_layout,
    'finance',jsonb_build_object('version',1,'client_id',p_id,'profile_id',v_client.profile_id,
      'source',case when v_client.profile_id is null then 'client' else 'profile' end,'layout',v_layout,'balance_status',v_state,'balance_nio',v_balance,'balances',v_balances,
      'collections',v_collections));
end $$;
revoke all on function public.crm_detail(uuid) from public, anon, authenticated;
grant execute on function public.crm_detail(uuid) to authenticated;
-- Capacidad explícita: evita vistas nativas antiguas que omitan fichas sin login.
create or replace function public.finance_debt_report(p_section text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_section not in ('summary','receivables') or p_section is null then raise exception 'INVALID_FINANCE_SECTION'; end if;
  return public.finance_read(p_section,30);
end $$;
revoke all on function public.finance_debt_report(text) from public,anon,authenticated;
grant execute on function public.finance_debt_report(text) to authenticated;
notify pgrst,'reload schema';
commit;
