-- CLI-01: vigencias reales de planes.
--
-- Decisiones aplicadas:
-- - Un cobro estructurado (con plan explícito) crea el periodo en la misma
--   operación que registra el dinero. Un cobro genérico, un abono, un descuento
--   o un pago parcial nunca crean vigencia.
-- - Duraciones contando el día del pago como día 1: Día 1, Semana 7,
--   Quincena 15, Mes y Boxeo 30.
-- - Renovar o cambiar antes de vencer encadena desde el día siguiente al
--   vencimiento vigente o futuro. Si ya venció, empieza el día del pago.
-- - Gimnasio y Boxeo son accesos separados y pueden coexistir.
-- - Ningún cobro anterior inventa vigencia: si la referencia ya existía antes
--   de esta llamada, no se crea segmento.
-- - Recepción no bloquea por vencimiento ni deuda. El único bloqueo nuevo es
--   reservar Boxeo sin vigencia para la fecha local de la clase.
--
-- Reutiliza `public.payment_plans` (vacía en producción) como tabla de
-- segmentos. Si ya existe con la forma legada, se adapta sin borrar filas; si
-- hay filas que no se pueden mapear con seguridad, la migración falla.
--
-- Reversión: retirar primero el uso en la aplicación (campo `planId`, RPC
-- `*_plan`), después se pueden eliminar esas RPC y `payment_plans` sin tocar
-- transactions, finance_entries ni gym_clients. `frozen_since` puede quedar
-- sin uso. No se borra ningún dato histórico.

begin;
set local lock_timeout = '5s';

-- 1. Ficha: fecha de congelamiento para desplazar vigencias al reactivar.
alter table public.gym_clients add column if not exists frozen_since date;

-- 2. Tabla de segmentos de vigencia. Cada fila es una compra concreta.
create table if not exists public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.gym_clients(id) on delete restrict,
  plan_id text references public.plans(id) on delete restrict,
  access text,
  started_on date,
  expires_on date,
  price_paid numeric(12, 2),
  currency text,
  request_id uuid,
  transaction_id uuid references public.transactions(id) on delete set null,
  source text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Adaptación de una tabla legada. Solo agrega columnas y afloja obligatorios
-- que la forma nueva ya no usa; no borra ni renombra nada.
alter table public.payment_plans add column if not exists client_id uuid;
alter table public.payment_plans add column if not exists plan_id text;
alter table public.payment_plans add column if not exists access text;
alter table public.payment_plans add column if not exists started_on date;
alter table public.payment_plans add column if not exists expires_on date;
alter table public.payment_plans add column if not exists price_paid numeric(12, 2);
alter table public.payment_plans add column if not exists currency text;
alter table public.payment_plans add column if not exists request_id uuid;
alter table public.payment_plans add column if not exists transaction_id uuid;
alter table public.payment_plans add column if not exists source text;
alter table public.payment_plans add column if not exists created_by uuid;
alter table public.payment_plans add column if not exists created_at timestamptz default now();

do $$
declare v_type text; v_col text;
begin
  -- Moneda y plan como texto: el esquema canónico guarda texto y así la
  -- tabla legada puede reutilizarse aunque use enum o uuid.
  select data_type into v_type from information_schema.columns
   where table_schema = 'public' and table_name = 'payment_plans' and column_name = 'currency';
  if v_type is not null and v_type not in ('text', 'character varying') then
    execute 'alter table public.payment_plans alter column currency type text using currency::text';
  end if;
  select data_type into v_type from information_schema.columns
   where table_schema = 'public' and table_name = 'payment_plans' and column_name = 'plan_id';
  if v_type is not null and v_type not in ('text', 'character varying') then
    execute 'alter table public.payment_plans alter column plan_id type text using plan_id::text';
  end if;

  -- Columnas legadas que la forma nueva no llena: se afloja el NOT NULL para
  -- no romper filas históricas ni bloquear compras nuevas.
  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'payment_plans'
       and is_nullable = 'NO'
       and column_name in ('member_id', 'started_at', 'expires_at', 'is_active', 'notes')
  loop
    execute format('alter table public.payment_plans alter column %I drop not null', v_col);
  end loop;
end $$;

-- Relleno de la forma legada hacia la nueva, solo cuando esas columnas existen.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'payment_plans' and column_name = 'started_at') then
    execute 'update public.payment_plans set started_on = started_at::date where started_on is null and started_at is not null';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'payment_plans' and column_name = 'expires_at') then
    execute 'update public.payment_plans set expires_on = expires_at::date where expires_on is null and expires_at is not null';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'payment_plans' and column_name = 'member_id') then
    execute 'update public.payment_plans p set client_id = c.id
               from public.gym_clients c
              where p.client_id is null and p.member_id is not null and c.profile_id = p.member_id';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'payment_plans' and column_name = 'is_active') then
    execute 'update public.payment_plans set is_active = (expires_on >= (now() at time zone ''America/Managua'')::date)
              where expires_on is not null and is_active is distinct from (expires_on >= (now() at time zone ''America/Managua'')::date)';
  end if;
end $$;

update public.payment_plans p
   set access = case when pl.slug = 'boxeo' then 'boxing' else 'gym' end
  from public.plans pl
 where p.access is null and p.plan_id is not null and pl.id = p.plan_id::text;

update public.payment_plans set currency = 'NIO' where currency is null;
update public.payment_plans set source = 'legacy' where source is null;
update public.payment_plans set created_at = now() where created_at is null;
update public.payment_plans set request_id = gen_random_uuid() where request_id is null;

-- Si alguna fila legada no se puede mapear con seguridad, se detiene todo.
do $$
declare v_bad integer;
begin
  select count(*) into v_bad from public.payment_plans
   where client_id is null or plan_id is null or access is null
      or started_on is null or expires_on is null or request_id is null;
  if v_bad > 0 then
    raise exception 'PAYMENT_PLANS_LEGACY_UNMAPPABLE: % fila(s) sin ficha, plan, acceso o fechas', v_bad;
  end if;
end $$;

alter table public.payment_plans alter column client_id set not null;
alter table public.payment_plans alter column plan_id set not null;
alter table public.payment_plans alter column access set not null;
alter table public.payment_plans alter column started_on set not null;
alter table public.payment_plans alter column expires_on set not null;
alter table public.payment_plans alter column currency set not null;
alter table public.payment_plans alter column request_id set not null;
alter table public.payment_plans alter column source set not null;
alter table public.payment_plans alter column created_at set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_plans_access_chk') then
    alter table public.payment_plans add constraint payment_plans_access_chk
      check (access in ('gym', 'boxing'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_plans_source_chk') then
    alter table public.payment_plans add constraint payment_plans_source_chk
      check (source in ('movement', 'checkout', 'crm', 'legacy'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_plans_dates_chk') then
    alter table public.payment_plans add constraint payment_plans_dates_chk
      check (expires_on >= started_on);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_plans_price_chk') then
    alter table public.payment_plans add constraint payment_plans_price_chk
      check (price_paid is null or price_paid >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_plans_client_fk') then
    alter table public.payment_plans add constraint payment_plans_client_fk
      foreign key (client_id) references public.gym_clients(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_plans_transaction_fk') then
    alter table public.payment_plans add constraint payment_plans_transaction_fk
      foreign key (transaction_id) references public.transactions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_plans_created_by_fk') then
    alter table public.payment_plans add constraint payment_plans_created_by_fk
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
end $$;

create unique index if not exists payment_plans_request_uidx on public.payment_plans(request_id);
create unique index if not exists payment_plans_transaction_uidx
  on public.payment_plans(transaction_id) where transaction_id is not null;
create index if not exists payment_plans_client_idx
  on public.payment_plans(client_id, access, expires_on desc);

-- La tabla legada tenía una política de escritura para "staff" y permisos
-- amplios. Se cierran ambos: el acceso pasa solo por las RPC de abajo.
alter table public.payment_plans enable row level security;
drop policy if exists "Staff can write payment_plans" on public.payment_plans;
revoke all on public.payment_plans from public, anon, authenticated;

-- 3. Fecha local única.
create or replace function public.plan_local_today()
returns date language sql stable security definer set search_path = public, pg_temp as $$
  select (now() at time zone 'America/Managua')::date;
$$;
revoke all on function public.plan_local_today() from public, anon, authenticated;

-- 4. Términos estrictos por plan. Un plan sin duración definida devuelve NULL
--    y no crea vigencia; solo falla si el plan no existe.
create or replace function public.plan_validity_terms(p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text; v_period text; v_days integer; v_access text; v_currency text; v_amount numeric;
begin
  select slug, period into v_slug, v_period from public.plans where id = p_plan;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  v_days := case
    when v_slug = 'pase-del-dia' and v_period = 'session' then 1
    when v_slug = 'gimnasio-semanal' and v_period = 'week' then 7
    when v_slug = 'gimnasio-quincenal' and v_period = 'fortnight' then 15
    when v_slug = 'gimnasio-mensual' and v_period = 'month' then 30
    when v_slug = 'boxeo' and v_period = 'month' then 30
  end;
  if v_days is null then return null; end if;
  v_access := case when v_slug = 'boxeo' then 'boxing' else 'gym' end;
  select case when v_slug = 'boxeo' then price else price_nio end into v_amount
    from public.plans where id = p_plan;
  v_currency := case when v_slug = 'boxeo' then 'USD' else 'NIO' end;
  return jsonb_build_object(
    'plan_id', p_plan,
    'slug', v_slug,
    'period', v_period,
    'access', v_access,
    'days', v_days,
    'currency', v_currency,
    'amount', v_amount
  );
end $$;
revoke all on function public.plan_validity_terms(text) from public, anon;
-- Lectura de términos: solo datos del catálogo de planes, sin fichas ni importes cobrados.
grant execute on function public.plan_validity_terms(text) to authenticated;

-- 5. Estado por acceso: vigente, próximo o vencido. Incluye días restantes.
create or replace function public.plan_access_state(p_client uuid, p_access text, p_today date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_row record;
begin
  select plan_id, started_on, expires_on into v_row
    from public.payment_plans
   where client_id = p_client and access = p_access
     and started_on <= p_today and expires_on >= p_today
   order by expires_on desc
   limit 1;
  if found then
    return jsonb_build_object(
      'state', 'active',
      'plan_id', v_row.plan_id,
      'starts_on', v_row.started_on,
      'expires_on', v_row.expires_on,
      'days_left', v_row.expires_on - p_today + 1
    );
  end if;
  select plan_id, started_on, expires_on into v_row
    from public.payment_plans
   where client_id = p_client and access = p_access and started_on > p_today
   order by started_on asc
   limit 1;
  if found then
    return jsonb_build_object(
      'state', 'upcoming',
      'plan_id', v_row.plan_id,
      'starts_on', v_row.started_on,
      'expires_on', v_row.expires_on,
      'days_left', 0
    );
  end if;
  select plan_id, started_on, expires_on into v_row
    from public.payment_plans
   where client_id = p_client and access = p_access
   order by expires_on desc
   limit 1;
  if found then
    return jsonb_build_object(
      'state', 'expired',
      'plan_id', v_row.plan_id,
      'starts_on', v_row.started_on,
      'expires_on', v_row.expires_on,
      'days_left', 0
    );
  end if;
  return jsonb_build_object('state', 'none', 'plan_id', null, 'starts_on', null, 'expires_on', null, 'days_left', 0);
end $$;
revoke all on function public.plan_access_state(uuid, text, date) from public, anon, authenticated;

create or replace function public.plan_validity_summary(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_today date := public.plan_local_today();
begin
  return jsonb_build_object(
    'today', v_today,
    'gym', public.plan_access_state(p_client, 'gym', v_today),
    'boxing', public.plan_access_state(p_client, 'boxing', v_today),
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'plan_id', s.plan_id,
        'access', s.access,
        'started_on', s.started_on,
        'expires_on', s.expires_on,
        'price', s.price_paid,
        'currency', s.currency
      ) order by s.started_on desc, s.expires_on desc)
      from public.payment_plans s where s.client_id = p_client
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.plan_validity_summary(uuid) from public, anon, authenticated;

-- 6. Registro de una compra estructurada. Idempotente por referencia.
create or replace function public.plan_register_segment(
  p_client uuid,
  p_plan text,
  p_amount numeric,
  p_currency text,
  p_request uuid,
  p_transaction uuid,
  p_source text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_terms jsonb;
  v_existing public.payment_plans;
  v_today date;
  v_chain date;
  v_start date;
  v_end date;
  v_id uuid;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  v_terms := public.plan_validity_terms(p_plan);
  if v_terms is null then raise exception 'PLAN_TERMS_INVALID'; end if;
  if (v_terms->>'amount') is null then raise exception 'PLAN_PRICE_MISSING'; end if;
  if p_currency is distinct from (v_terms->>'currency')
     or p_amount is null
     or p_amount <> (v_terms->>'amount')::numeric then
    raise exception 'PLAN_PRICE_MISMATCH';
  end if;
  if p_source not in ('movement', 'checkout', 'crm') then raise exception 'INVALID_REQUEST'; end if;

  select * into v_existing from public.payment_plans where request_id = p_request;
  if found then
    if v_existing.client_id is distinct from p_client
       or v_existing.plan_id::text is distinct from p_plan then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'plan_id', v_existing.plan_id,
      'access', v_existing.access,
      'started_on', v_existing.started_on,
      'expires_on', v_existing.expires_on,
      'days', v_existing.expires_on - v_existing.started_on + 1,
      'validity', public.plan_validity_summary(p_client)
    );
  end if;

  -- Bloqueo de la ficha: serializa dos compras simultáneas del mismo cliente.
  perform 1 from public.gym_clients where id = p_client for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_transaction is not null and exists(
    select 1 from public.payment_plans where transaction_id = p_transaction
  ) then
    raise exception 'REQUEST_CONFLICT';
  end if;

  v_today := public.plan_local_today();
  select max(expires_on) into v_chain
    from public.payment_plans
   where client_id = p_client
     and access = (v_terms->>'access')
     and expires_on >= v_today;
  v_start := case when v_chain is null then v_today else v_chain + 1 end;
  v_end := v_start + ((v_terms->>'days')::integer - 1);

  insert into public.payment_plans(
    client_id, plan_id, access, started_on, expires_on, price_paid,
    currency, request_id, transaction_id, source, created_by
  ) values (
    p_client, p_plan, (v_terms->>'access'), v_start, v_end, p_amount,
    p_currency, p_request, p_transaction, p_source, auth.uid()
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'plan_id', p_plan,
    'access', (v_terms->>'access'),
    'started_on', v_start,
    'expires_on', v_end,
    'days', (v_terms->>'days')::integer,
    'validity', public.plan_validity_summary(p_client)
  );
end $$;
revoke all on function public.plan_register_segment(uuid, text, numeric, text, uuid, uuid, text) from public, anon, authenticated;

-- 7. Envoltorios: cobran el dinero con los escritores existentes y crean el
--    periodo en la misma transacción. No reinterpretan cobros genéricos.
create or replace function public.finance_record_movement_plan(
  p_request uuid,
  p_client uuid,
  p_amount numeric,
  p_concept text,
  p_currency text,
  p_method text,
  p_account text,
  p_fx numeric,
  p_plan text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
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

  v_id := public.finance_record_movement(
    p_request, 'service_income', p_client, p_amount, p_currency,
    p_method, p_account, p_concept, p_fx, null
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
revoke all on function public.finance_record_movement_plan(uuid, uuid, numeric, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.finance_record_movement_plan(uuid, uuid, numeric, text, text, text, text, numeric, text) to authenticated;

create or replace function public.finance_record_checkout_plan(
  p_request uuid,
  p_client uuid,
  p_service_amount numeric,
  p_service_concept text,
  p_currency text,
  p_method text,
  p_account text,
  p_fx numeric,
  p_items jsonb,
  p_plan text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
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
  if (v_terms->>'access') = 'boxing' then raise exception 'PLAN_NOT_COMBINABLE'; end if;
  if p_currency is distinct from (v_terms->>'currency')
     or p_service_amount is distinct from (v_terms->>'amount')::numeric then
    raise exception 'PLAN_PRICE_MISMATCH';
  end if;

  select exists(select 1 from public.finance_checkout_groups where request_id = p_request) into v_pre;

  v_result := public.finance_record_checkout(
    p_request, p_client, p_service_amount, p_service_concept,
    p_currency, p_method, p_account, p_fx, p_items
  );

  if v_pre then
    select jsonb_build_object(
      'id', s.id, 'plan_id', s.plan_id, 'access', s.access,
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
revoke all on function public.finance_record_checkout_plan(uuid, uuid, numeric, text, text, text, text, numeric, jsonb, text) from public, anon, authenticated;
grant execute on function public.finance_record_checkout_plan(uuid, uuid, numeric, text, text, text, text, numeric, jsonb, text) to authenticated;

create or replace function public.crm_record_payment_plan(
  p_id uuid,
  p_request uuid,
  p_amount numeric,
  p_currency text,
  p_method text,
  p_account text,
  p_concept text,
  p_fx numeric,
  p_plan text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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

  select exists(select 1 from public.transactions where crm_request_id = p_request) into v_pre;

  v_id := public.crm_record_payment(p_id, p_request, p_amount, p_currency, p_method, p_account, p_concept, p_fx);

  if v_pre then
    select jsonb_build_object(
      'id', s.id, 'plan_id', s.plan_id, 'access', s.access,
      'started_on', s.started_on, 'expires_on', s.expires_on,
      'days', s.expires_on - s.started_on + 1
    ) into v_plan
    from public.payment_plans s where s.request_id = p_request;
  else
    v_plan := public.plan_register_segment(p_id, p_plan, p_amount, p_currency, p_request, v_id, 'crm');
    v_plan := v_plan - 'validity';
  end if;

  return jsonb_build_object('id', v_id, 'plan', v_plan);
end $$;
revoke all on function public.crm_record_payment_plan(uuid, uuid, numeric, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.crm_record_payment_plan(uuid, uuid, numeric, text, text, text, text, numeric, text) to authenticated;

-- 8. Lectura de vigencia para el personal y para el propio cliente.
create or replace function public.crm_client_validity(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if not exists(select 1 from public.gym_clients where id = p_id) then raise exception 'NOT_FOUND'; end if;
  return public.plan_validity_summary(p_id);
end $$;
revoke all on function public.crm_client_validity(uuid) from public, anon, authenticated;
grant execute on function public.crm_client_validity(uuid) to authenticated;

create or replace function public.crm_my_assigned_plan()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_plan text;
  v_details jsonb;
  v_client uuid;
  v_validity jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select id, plan_id into v_client, v_plan from public.gym_clients where profile_id = auth.uid();
  if not found then
    return jsonb_build_object('linked', false, 'plan', null, 'validity', null);
  end if;
  if v_plan is not null then
    select jsonb_build_object('id', id, 'name_es', name_es, 'name_en', name_en, 'is_active', is_active)
      into v_details from public.plans where id = v_plan;
    if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  end if;
  v_validity := public.plan_validity_summary(v_client);
  return jsonb_build_object('linked', true, 'plan', v_details, 'validity', v_validity);
end $$;
revoke all on function public.crm_my_assigned_plan() from public, anon, authenticated;
grant execute on function public.crm_my_assigned_plan() to authenticated;

-- 9. Opciones de cobro: cada plan informa su vigencia y el importe exacto.
create or replace function public.crm_options()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_layout text; v_methods jsonb; v_accounts jsonb; v_plans jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  v_layout := public.crm_finance_layout();
  if v_layout = 'unsupported' then raise exception 'FINANCE_SCHEMA_UNSUPPORTED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name_es', p.name_es, 'slug', p.slug, 'period', p.period,
      'price_nio', p.price_nio, 'sort_order', p.sort_order
    ) || jsonb_strip_nulls(jsonb_build_object(
      'access', t->>'access',
      'duration_days', case when t is null then null else (t->>'days')::integer end,
      'validity_currency', t->>'currency',
      'validity_amount', (t->>'amount')
    )) order by p.sort_order), '[]'::jsonb) into v_plans
    from public.plans p
    left join lateral (select public.plan_validity_terms(p.id) as t) x on true
   where p.is_active;
  if v_layout = 'repository' then
    select coalesce(jsonb_agg(to_jsonb(m) order by sort_order), '[]'::jsonb) into v_methods
      from (select id, name_es, accepts_nio, accepts_usd, sort_order from public.payment_methods where is_active) m;
    select coalesce(jsonb_agg(to_jsonb(a) order by name), '[]'::jsonb) into v_accounts
      from (select id, name, currency from public.accounts where is_active) a;
  else
    select coalesce(jsonb_agg(to_jsonb(m) order by display_order), '[]'::jsonb) into v_methods
      from (select id, name as name_es, currency in ('NIO', 'BOTH') as accepts_nio,
        currency in ('USD', 'BOTH') as accepts_usd, display_order from public.payment_methods where is_active) m;
    select coalesce(jsonb_agg(to_jsonb(a) order by display_order), '[]'::jsonb) into v_accounts
      from (select id, name, currency, display_order from public.bank_accounts where is_active) a;
  end if;
  return jsonb_build_object('plans', v_plans, 'methods', v_methods, 'accounts', v_accounts,
    'finance_layout', v_layout, 'payments_enabled', v_layout = 'repository',
    'payment_block_reason', case when v_layout <> 'repository' then
      'Cobros CRM pendientes de compatibilidad con esta Caja. No se guardará ningún cobro desde esta ficha; no lo repitas en otra pantalla sin revisar el historial.' else null end);
end $$;
revoke all on function public.crm_options() from public, anon, authenticated;
grant execute on function public.crm_options() to authenticated;

-- 10. Ficha: detalle con vigencia.
create or replace function public.crm_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_client public.gym_clients; v_layout text; v_balance numeric;
  v_balances jsonb; v_state text; v_collections jsonb; v_payments jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select * into v_client from public.gym_clients where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_layout := public.crm_finance_layout();
  v_state := case when v_layout = 'unsupported' then 'unsupported'
    when v_client.profile_id is null then 'unlinked' else 'missing' end;
  if v_layout = 'bank_accounts_split' then
    v_balances := public.finance_client_balance(p_id)->'balances';
    if v_balances is not null and v_balances <> 'null'::jsonb then v_state := 'ready'; else v_balances := null; end if;
  elsif v_layout = 'repository' and v_client.profile_id is not null then
    select balance_nio into v_balance from public.member_balances where member_id = v_client.profile_id;
    if found then v_state := 'ready'; end if;
  end if;
  if v_layout in ('repository', 'bank_accounts_split') then
    -- Sólo ingresos: el vínculo explícito de ficha prevalece sobre member_id legado.
    with income as (
      select t.* from public.transactions t
      where (t.client_id = p_id or (t.client_id is null and v_client.profile_id is not null and t.member_id = v_client.profile_id))
        and (case when v_layout = 'repository' then to_jsonb(t)->>'direction' else to_jsonb(t)->>'type' end) = 'income'
    )
    select jsonb_build_object(
      'count_nio', count(*) filter (where status::text = 'completed' and currency::text = 'NIO'),
      'amount_nio', coalesce(sum(amount) filter (where status::text = 'completed' and currency::text = 'NIO'), 0),
      'count_usd', count(*) filter (where status::text = 'completed' and currency::text = 'USD'),
      'amount_usd', coalesce(sum(amount) filter (where status::text = 'completed' and currency::text = 'USD'), 0))
    into v_collections from income;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at desc, t.id desc), '[]'::jsonb)
    into v_payments from (
      select id, occurred_at, concept, amount, currency, status from public.transactions t
      where (t.client_id = p_id or (t.client_id is null and v_client.profile_id is not null and t.member_id = v_client.profile_id))
        and (case when v_layout = 'repository' then to_jsonb(t)->>'direction' else to_jsonb(t)->>'type' end) = 'income'
      order by occurred_at desc, id desc limit 40
    ) t;
  end if;
  return jsonb_build_object('client', to_jsonb(v_client), 'card', public.crm_get_card(p_id),
    'visits', coalesce((select jsonb_agg(to_jsonb(v)) from (select * from public.client_visits where client_id = p_id order by visited_at desc limit 60) v), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.client_events where client_id = p_id order by created_at desc limit 40) e), '[]'::jsonb),
    'payments', coalesce(v_payments, '[]'::jsonb), 'balance', v_balance, 'balances', v_balances, 'finance_layout', v_layout,
    'plan_validity', public.plan_validity_summary(p_id),
    'finance', jsonb_build_object('version', 1, 'client_id', p_id, 'profile_id', v_client.profile_id,
      'source', case when v_client.profile_id is null then 'client' else 'profile' end, 'layout', v_layout, 'balance_status', v_state, 'balance_nio', v_balance, 'balances', v_balances,
      'collections', v_collections));
end $$;
revoke all on function public.crm_detail(uuid) from public, anon, authenticated;
grant execute on function public.crm_detail(uuid) to authenticated;

-- 11. Directorio: cada fila trae su vigencia sin quitar campos.
create or replace function public.crm_directory(p_search text default '', p_category text default '', p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select jsonb_build_object('total', (select count(*) from public.gym_clients c where
    (p_category = '' or c.category = p_category) and (p_search = '' or c.full_name ilike '%' || p_search || '%' or coalesce(c.phone, '') ilike '%' || p_search || '%' or c.client_number::text = p_search)
    and not public.is_staff_profile(c.profile_id)),
    'rows', coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)) into result from (
    select c.*, p.name_es as plan_name,
      (select count(*)::int from public.client_visits v where v.client_id = c.id and v.local_day >= (now() at time zone 'America/Managua')::date - 29) as visits_30,
      (select max(v.visited_at) from public.client_visits v where v.client_id = c.id) as last_visit,
      public.plan_validity_summary(c.id) as plan_validity
    from public.gym_clients c left join public.plans p on p.id = c.plan_id
    where (p_category = '' or c.category = p_category) and (p_search = '' or c.full_name ilike '%' || p_search || '%' or coalesce(c.phone, '') ilike '%' || p_search || '%' or c.client_number::text = p_search)
      and not public.is_staff_profile(c.profile_id)
    order by c.full_name, c.id limit 30 offset greatest(0, least(coalesce(p_offset, 0), 1000000))
  ) r;
  return result;
end $$;
revoke all on function public.crm_directory(text, text, integer) from public, anon;
grant execute on function public.crm_directory(text, text, integer) to authenticated;

-- 12. Congelamiento: al congelar se recuerda la fecha; al reactivar se
--     desplazan los segmentos vigentes y futuros para no perder días.
create or replace function public.crm_update_client(p_id uuid, p_name text, p_phone text, p_email text, p_category text, p_status text, p_plan text, p_notes text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_row public.gym_clients;
  v_admin boolean;
  v_today date := public.plan_local_today();
  v_shift integer := 0;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select * into old_row from public.gym_clients where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select role = 'admin' into v_admin from public.profiles where id = auth.uid();
  if p_category <> old_row.category and not coalesce(v_admin, false) then raise exception 'ADMIN_ONLY'; end if;
  if p_email is not null and trim(p_email) <> '' and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL'; end if;

  if p_status = 'frozen' and old_row.status <> 'frozen' then
    update public.gym_clients set full_name = trim(p_name), phone = nullif(trim(p_phone), ''), email = nullif(lower(trim(p_email)), ''),
      category = p_category, status = p_status, plan_id = nullif(p_plan, ''), notes = coalesce(p_notes, ''),
      frozen_since = v_today, updated_at = now() where id = p_id;
  elsif old_row.status = 'frozen' and p_status = 'active' then
    if old_row.frozen_since is not null then
      v_shift := v_today - old_row.frozen_since;
    end if;
    if v_shift > 0 then
      update public.payment_plans
         set started_on = started_on + v_shift, expires_on = expires_on + v_shift
       where client_id = p_id and expires_on >= old_row.frozen_since;
    end if;
    update public.gym_clients set full_name = trim(p_name), phone = nullif(trim(p_phone), ''), email = nullif(lower(trim(p_email)), ''),
      category = p_category, status = p_status, plan_id = nullif(p_plan, ''), notes = coalesce(p_notes, ''),
      frozen_since = null, updated_at = now() where id = p_id;
  else
    update public.gym_clients set full_name = trim(p_name), phone = nullif(trim(p_phone), ''), email = nullif(lower(trim(p_email)), ''),
      category = p_category, status = p_status, plan_id = nullif(p_plan, ''), notes = coalesce(p_notes, ''),
      updated_at = now() where id = p_id;
  end if;

  insert into public.client_events(client_id, action, details, actor_id) values(p_id, 'updated',
    jsonb_build_object('category_before', old_row.category, 'category_after', p_category,
      'status_before', old_row.status, 'status_after', p_status,
      'frozen_days_shifted', v_shift), auth.uid());
end $$;

-- 13. Reservas: Boxeo exige vigencia en la fecha local de la clase. La entrada
--     a recepción no se bloquea y las demás disciplinas no cambian.
create or replace function public.book_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_session  public.sessions;
  v_booking  public.bookings;
  v_existing boolean := false;
  v_booked   integer;
  v_active   integer;
  v_max      integer := 3;
  v_class_is_active boolean;
  v_class_slug text;
  v_session_day date;
begin
  if v_user_id is null then
    raise exception 'AUTH: tenés que iniciar sesión';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: la clase no existe';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'CANCELLED: la clase fue cancelada';
  end if;

  if v_session.starts_at <= now() then
    raise exception 'PAST: la clase ya comenzó';
  end if;

  select is_active, slug into v_class_is_active, v_class_slug
    from public.classes
   where id = v_session.class_id
   for share;

  if not found or v_class_is_active is distinct from true then
    raise exception 'CLASS_INACTIVE: esta disciplina está desactivada';
  end if;

  if v_class_slug = 'boxeo' then
    v_session_day := (v_session.starts_at at time zone 'America/Managua')::date;
    if not exists (
      select 1 from public.payment_plans s
       where s.client_id = (select id from public.gym_clients where profile_id = v_user_id)
         and s.access = 'boxing'
         and s.started_on <= v_session_day
         and s.expires_on >= v_session_day
    ) then
      raise exception 'PLAN_REQUIRED: necesitás tu mensualidad de Boxeo vigente para esa fecha';
    end if;
  end if;

  select * into v_booking
  from public.bookings
  where session_id = p_session_id and user_id = v_user_id;

  if found then
    if v_booking.status in ('confirmed', 'attended') then
      raise exception 'ALREADY_BOOKED: ya tenés una reserva en esa clase';
    end if;
    v_existing := true;
  end if;

  select count(*) into v_booked
  from public.bookings
  where session_id = p_session_id and status in ('confirmed', 'attended');

  if v_booked >= v_session.capacity then
    raise exception 'FULL: no quedan lugares';
  end if;

  select count(*) into v_active
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  where b.user_id = v_user_id
    and b.status in ('confirmed', 'attended')
    and s.starts_at > now();

  if v_active >= v_max then
    raise exception 'LIMIT: ya tenés % reservas activas a la vez', v_max;
  end if;

  if v_existing then
    update public.bookings
      set status = 'confirmed', cancelled_at = null, created_at = now()
      where id = v_booking.id
      returning * into v_booking;
  else
    insert into public.bookings (session_id, user_id, status)
    values (p_session_id, v_user_id, 'confirmed')
    returning * into v_booking;
  end if;

  return jsonb_build_object(
    'id', v_booking.id,
    'session_id', v_booking.session_id,
    'status', v_booking.status
  );
end;
$$;

revoke all on function public.book_session(text)
  from public, anon, authenticated;
grant execute on function public.book_session(text) to authenticated;

notify pgrst, 'reload schema';
commit;
