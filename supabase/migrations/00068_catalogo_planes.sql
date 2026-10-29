-- CLI-06: catálogo de planes y modalidades (modelo C).
--
-- Problema que corrige: la vigencia estaba escrita por nombre de plan dentro de
-- `plan_validity_terms()` y las tarifas rápidas eran una lista fija. Un plan
-- nuevo (Zumba, Estudiante, cualquier modalidad) no se podía cobrar con fechas.
--
-- Decisión aplicada: la vigencia sale de DATOS del plan, no de su slug.
--  - `access_kind = 'gym'`    → todo el gimnasio (pesas y máquinas, sin reserva).
--  - `access_kind = 'class'`  → una disciplina concreta de `public.classes`.
--  - `duration_days`          → días de vigencia contando el pago como día 1.
--  - `validity_currency` / `validity_amount` → importe exacto que dispara la vigencia.
--
-- Un plan sin `duration_days` sigue siendo un cobro genérico: registra dinero y
-- no inventa fechas. Eso mantiene compatibles los planes ya existentes.
--
-- Reversión: dejar de enviar `planId` desde la aplicación; después se pueden
-- quitar `admin_plans_catalog()` y `admin_save_plan(...)`. Las columnas nuevas
-- pueden quedar vacías sin afectar cobros, reservas ni vigencias ya creadas.

begin;
set local lock_timeout = '5s';

-- 1. Configuración de vigencia en el catálogo de planes.
alter table public.plans add column if not exists updated_at timestamptz not null default now();
alter table public.plans add column if not exists access_kind text;
alter table public.plans add column if not exists class_id text references public.classes(id) on delete restrict;
alter table public.plans add column if not exists duration_days integer;
alter table public.plans add column if not exists validity_currency text;
alter table public.plans add column if not exists validity_amount numeric(12, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_access_kind_chk') then
    alter table public.plans add constraint plans_access_kind_chk
      check (access_kind is null or access_kind in ('gym', 'class'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plans_duration_chk') then
    alter table public.plans add constraint plans_duration_chk
      check (duration_days is null or duration_days between 1 and 3660);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plans_validity_currency_chk') then
    alter table public.plans add constraint plans_validity_currency_chk
      check (validity_currency is null or validity_currency in ('NIO', 'USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plans_validity_amount_chk') then
    alter table public.plans add constraint plans_validity_amount_chk
      check (validity_amount is null or validity_amount > 0);
  end if;
  -- Un plan con disciplina exige la disciplina; uno sin disciplina no la usa.
  if not exists (select 1 from pg_constraint where conname = 'plans_access_class_chk') then
    alter table public.plans add constraint plans_access_class_chk
      check (
        (access_kind = 'class' and class_id is not null)
        or (access_kind is distinct from 'class' and class_id is null)
        or access_kind is null
      );
  end if;
end $$;

create index if not exists plans_access_idx on public.plans(access_kind, class_id);

-- 2. Traslado de los planes existentes a la forma nueva. Solo rellena vacíos:
--    no cambia precios ni sobrescribe configuración ya cargada.
update public.plans p
   set access_kind = 'gym',
       duration_days = coalesce(p.duration_days, x.days),
       validity_currency = coalesce(p.validity_currency, 'NIO'),
       validity_amount = coalesce(p.validity_amount, p.price_nio)
  from (values
    ('pase-del-dia', 1),
    ('gimnasio-semanal', 7),
    ('gimnasio-quincenal', 15),
    ('gimnasio-mensual', 30)
  ) as x(slug, days)
 where p.slug = x.slug
   and p.access_kind is null
   and p.price_nio is not null;

-- Boxeo queda como disciplina, no como excepción escrita a mano.
do $$
declare v_class text;
begin
  select id into v_class from public.classes where slug = 'boxeo' limit 1;
  if v_class is not null then
    update public.plans
       set access_kind = 'class',
           class_id = v_class,
           duration_days = coalesce(duration_days, 30),
           validity_currency = coalesce(validity_currency, 'USD'),
           validity_amount = coalesce(validity_amount, price)
     where slug = 'boxeo'
       and access_kind is null;
  end if;
end $$;

-- 3. Segmentos de vigencia: pasan a poder apuntar a cualquier disciplina.
alter table public.payment_plans add column if not exists class_id text
  references public.classes(id) on delete restrict;
create index if not exists payment_plans_class_idx
  on public.payment_plans(client_id, class_id, expires_on desc);

alter table public.payment_plans drop constraint if exists payment_plans_access_chk;
alter table public.payment_plans add constraint payment_plans_access_chk
  check (access in ('gym', 'class', 'boxing'));

-- Los segmentos históricos de Boxeo quedan como disciplina.
do $$
declare v_class text;
begin
  select id into v_class from public.classes where slug = 'boxeo' limit 1;
  if v_class is not null then
    update public.payment_plans
       set access = 'class', class_id = coalesce(class_id, v_class)
     where access = 'boxing';
  end if;
end $$;

-- 4. Términos por DATOS. Un plan sin duración devuelve NULL: cobro genérico.
create or replace function public.plan_validity_terms(p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_plan public.plans;
  v_currency text;
  v_amount numeric;
begin
  select * into v_plan from public.plans where id = p_plan;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if v_plan.duration_days is null or v_plan.access_kind is null then
    return null;
  end if;
  -- Compatibilidad: un plan antiguo sin importe de vigencia usa su tarifa.
  v_currency := coalesce(v_plan.validity_currency, case when v_plan.price_nio is null then 'USD' else 'NIO' end);
  v_amount := coalesce(
    v_plan.validity_amount,
    case when v_currency = 'USD' then v_plan.price else v_plan.price_nio end
  );
  return jsonb_build_object(
    'plan_id', v_plan.id,
    'slug', v_plan.slug,
    'period', v_plan.period,
    'access', v_plan.access_kind,
    'class_id', v_plan.class_id,
    'class_name', (select name_es from public.classes where id = v_plan.class_id),
    'days', v_plan.duration_days,
    'currency', v_currency,
    'amount', v_amount
  );
end $$;
revoke all on function public.plan_validity_terms(text) from public, anon;
grant execute on function public.plan_validity_terms(text) to authenticated;

-- 5. Estado de vigencia por acceso. `p_class_id` nulo = todo el gimnasio.
create or replace function public.plan_class_state(p_client uuid, p_class_id text, p_today date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_row record;
  v_key text := coalesce(p_class_id, 'gym');
  v_label text;
begin
  select name_es into v_label from public.classes where id = p_class_id;

  select plan_id, started_on, expires_on into v_row
    from public.payment_plans
   where client_id = p_client
     and ((p_class_id is null and access = 'gym') or (p_class_id is not null and class_id = p_class_id))
     and started_on <= p_today and expires_on >= p_today
   order by expires_on desc
   limit 1;
  if found then
    return jsonb_build_object(
      'key', v_key, 'label', coalesce(v_label, 'Gimnasio'),
      'state', 'active', 'plan_id', v_row.plan_id,
      'starts_on', v_row.started_on, 'expires_on', v_row.expires_on,
      'days_left', v_row.expires_on - p_today + 1
    );
  end if;

  select plan_id, started_on, expires_on into v_row
    from public.payment_plans
   where client_id = p_client
     and ((p_class_id is null and access = 'gym') or (p_class_id is not null and class_id = p_class_id))
     and started_on > p_today
   order by started_on asc
   limit 1;
  if found then
    return jsonb_build_object(
      'key', v_key, 'label', coalesce(v_label, 'Gimnasio'),
      'state', 'upcoming', 'plan_id', v_row.plan_id,
      'starts_on', v_row.started_on, 'expires_on', v_row.expires_on, 'days_left', 0
    );
  end if;

  select plan_id, started_on, expires_on into v_row
    from public.payment_plans
   where client_id = p_client
     and ((p_class_id is null and access = 'gym') or (p_class_id is not null and class_id = p_class_id))
   order by expires_on desc
   limit 1;
  if found then
    return jsonb_build_object(
      'key', v_key, 'label', coalesce(v_label, 'Gimnasio'),
      'state', 'expired', 'plan_id', v_row.plan_id,
      'starts_on', v_row.started_on, 'expires_on', v_row.expires_on, 'days_left', 0
    );
  end if;

  return jsonb_build_object(
    'key', v_key, 'label', coalesce(v_label, 'Gimnasio'),
    'state', 'none', 'plan_id', null,
    'starts_on', null, 'expires_on', null, 'days_left', 0
  );
end $$;
revoke all on function public.plan_class_state(uuid, text, date) from public, anon, authenticated;

-- Puente de compatibilidad: acepta 'gym', 'boxing' o el id/slug de una
-- disciplina. La aplicación usa `plan_class_state`.
create or replace function public.plan_access_state(p_client uuid, p_access text, p_today date)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select public.plan_class_state(
    p_client,
    case
      when p_access is null or p_access = 'gym' then null
      when p_access = 'boxing' then (select id from public.classes where slug = 'boxeo' limit 1)
      else (select id from public.classes where id = p_access or slug = p_access limit 1)
    end,
    p_today
  );
$$;
revoke all on function public.plan_access_state(uuid, text, date) from public, anon, authenticated;

-- 6. Resumen: gimnasio + una fila por disciplina con plan o vigencia.
create or replace function public.plan_validity_summary(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_today date := public.plan_local_today();
begin
  return jsonb_build_object(
    'today', v_today,
    'gym', public.plan_class_state(p_client, null::text, v_today),
    'classes', coalesce((
      select jsonb_agg(public.plan_class_state(p_client, c.id, v_today) order by c.sort_order, c.name_es)
      from public.classes c
      where c.is_active
        and (
          exists(select 1 from public.payment_plans s where s.client_id = p_client and s.class_id = c.id)
          or exists(select 1 from public.plans p
                     where p.is_active and p.access_kind = 'class' and p.class_id = c.id
                       and p.duration_days is not null)
        )
    ), '[]'::jsonb),
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'plan_id', s.plan_id,
        'access', case when s.class_id is null then 'gym' else 'class' end,
        'class_id', s.class_id,
        'class_name', (select name_es from public.classes where id = s.class_id),
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

-- 7. Registro de compra: guarda la disciplina del plan.
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
  v_class text;
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

  v_class := nullif(v_terms->>'class_id', '');

  select * into v_existing from public.payment_plans where request_id = p_request;
  if found then
    if v_existing.client_id is distinct from p_client
       or v_existing.plan_id::text is distinct from p_plan then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return jsonb_build_object(
      'id', v_existing.id, 'plan_id', v_existing.plan_id,
      'access', case when v_existing.class_id is null then 'gym' else 'class' end,
      'class_id', v_existing.class_id,
      'started_on', v_existing.started_on, 'expires_on', v_existing.expires_on,
      'days', v_existing.expires_on - v_existing.started_on + 1,
      'validity', public.plan_validity_summary(p_client)
    );
  end if;

  perform 1 from public.gym_clients where id = p_client for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_transaction is not null and exists(
    select 1 from public.payment_plans where transaction_id = p_transaction
  ) then
    raise exception 'REQUEST_CONFLICT';
  end if;

  v_today := public.plan_local_today();
  -- Encadena solo dentro del mismo acceso: gimnasio con gimnasio, Zumba con
  -- Zumba. Dos accesos distintos no se roban días entre sí.
  select max(expires_on) into v_chain
    from public.payment_plans
   where client_id = p_client
     and ((v_class is null and access = 'gym') or (v_class is not null and class_id = v_class))
     and expires_on >= v_today;
  v_start := case when v_chain is null then v_today else v_chain + 1 end;
  v_end := v_start + ((v_terms->>'days')::integer - 1);

  insert into public.payment_plans(
    client_id, plan_id, access, class_id, started_on, expires_on, price_paid,
    currency, request_id, transaction_id, source, created_by
  ) values (
    p_client, p_plan, case when v_class is null then 'gym' else 'class' end, v_class,
    v_start, v_end, p_amount, p_currency, p_request, p_transaction, p_source, auth.uid()
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'plan_id', p_plan,
    'access', case when v_class is null then 'gym' else 'class' end,
    'class_id', v_class,
    'started_on', v_start, 'expires_on', v_end,
    'days', (v_terms->>'days')::integer,
    'validity', public.plan_validity_summary(p_client)
  );
end $$;
revoke all on function public.plan_register_segment(uuid, text, numeric, text, uuid, uuid, text) from public, anon, authenticated;

-- 8. Envoltorios: solo cambia el rechazo de Boxeo con productos, que ahora se
--    deduce del plan (una disciplina con vencimiento propio no se combina).
create or replace function public.finance_record_checkout_plan(
  p_request uuid, p_client uuid, p_service_amount numeric, p_service_concept text,
  p_currency text, p_method text, p_account text, p_fx numeric, p_items jsonb, p_plan text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare
  v_terms jsonb; v_pre boolean; v_result jsonb; v_tx uuid; v_plan jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_plan is null then raise exception 'PLAN_TERMS_INVALID'; end if;
  v_terms := public.plan_validity_terms(p_plan);
  if v_terms is null then raise exception 'PLAN_TERMS_INVALID'; end if;
  if (v_terms->>'amount') is null then raise exception 'PLAN_PRICE_MISSING'; end if;
  if (v_terms->>'access') = 'class' then raise exception 'PLAN_NOT_COMBINABLE'; end if;
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
      'id', s.id, 'plan_id', s.plan_id,
      'access', case when s.class_id is null then 'gym' else 'class' end,
      'class_id', s.class_id,
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

-- 9. Reservas: se exige vigencia cuando la disciplina tiene planes con
--    duración. Si no hay ninguno configurado, no se bloquea nada.
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
  v_session_day date;
  v_requires_plan boolean;
  v_class_name text;
begin
  if v_user_id is null then
    raise exception 'AUTH: tenés que iniciar sesión';
  end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then raise exception 'NOT_FOUND: la clase no existe'; end if;
  if v_session.status <> 'scheduled' then raise exception 'CANCELLED: la clase fue cancelada'; end if;
  if v_session.starts_at <= now() then raise exception 'PAST: la clase ya comenzó'; end if;

  select is_active, name_es into v_class_is_active, v_class_name
    from public.classes where id = v_session.class_id for share;
  if not found or v_class_is_active is distinct from true then
    raise exception 'CLASS_INACTIVE: esta disciplina está desactivada';
  end if;

  -- Solo se exige vigencia si alguien configuró al menos un plan con duración
  -- para esta disciplina. Así ninguna disciplina queda bloqueada por defecto.
  select exists(
    select 1 from public.plans p
     where p.is_active and p.access_kind = 'class'
       and p.class_id = v_session.class_id and p.duration_days is not null
  ) into v_requires_plan;

  if v_requires_plan then
    v_session_day := (v_session.starts_at at time zone 'America/Managua')::date;
    if not exists (
      select 1 from public.payment_plans s
       where s.client_id = (select id from public.gym_clients where profile_id = v_user_id)
         and s.class_id = v_session.class_id
         and s.started_on <= v_session_day
         and s.expires_on >= v_session_day
    ) then
      raise exception 'PLAN_REQUIRED: necesitás tu plan de % vigente para esa fecha', v_class_name;
    end if;
  end if;

  select * into v_booking from public.bookings
   where session_id = p_session_id and user_id = v_user_id;
  if found then
    if v_booking.status in ('confirmed', 'attended') then
      raise exception 'ALREADY_BOOKED: ya tenés una reserva en esa clase';
    end if;
    v_existing := true;
  end if;

  select count(*) into v_booked from public.bookings
   where session_id = p_session_id and status in ('confirmed', 'attended');
  if v_booked >= v_session.capacity then raise exception 'FULL: no quedan lugares'; end if;

  select count(*) into v_active
    from public.bookings b join public.sessions s on s.id = b.session_id
   where b.user_id = v_user_id and b.status in ('confirmed', 'attended')
     and s.starts_at > now();
  if v_active >= v_max then
    raise exception 'LIMIT: ya tenés % reservas activas a la vez', v_max;
  end if;

  if v_existing then
    update public.bookings set status = 'confirmed', cancelled_at = null, created_at = now()
     where id = v_booking.id returning * into v_booking;
  else
    insert into public.bookings (session_id, user_id, status)
    values (p_session_id, v_user_id, 'confirmed') returning * into v_booking;
  end if;

  return jsonb_build_object('id', v_booking.id, 'session_id', v_booking.session_id, 'status', v_booking.status);
end;
$$;
revoke all on function public.book_session(text) from public, anon, authenticated;
grant execute on function public.book_session(text) to authenticated;

-- 10. Catálogo administrable. Solo administrador; sin borrar filas.
create or replace function public.admin_plans_catalog()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  return jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name_es', p.name_es, 'name_en', p.name_en,
        'period', p.period, 'price_nio', p.price_nio, 'price', p.price,
        'access_kind', p.access_kind, 'class_id', p.class_id,
        'class_name', (select name_es from public.classes where id = p.class_id),
        'duration_days', p.duration_days,
        'validity_currency', p.validity_currency,
        'validity_amount', p.validity_amount,
        'is_active', p.is_active, 'sort_order', p.sort_order,
        'updated_at', p.updated_at
      ) order by p.sort_order, p.name_es)
      from public.plans p
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name_es', c.name_es, 'is_active', c.is_active)
        order by c.sort_order, c.name_es)
      from public.classes c
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_plans_catalog() from public, anon, authenticated;
grant execute on function public.admin_plans_catalog() to authenticated;

create or replace function public.admin_save_plan(
  p_id text,
  p_name_es text,
  p_name_en text,
  p_slug text,
  p_period text,
  p_price_nio numeric,
  p_access_kind text,
  p_class_id text,
  p_duration_days integer,
  p_validity_currency text,
  p_validity_amount numeric,
  p_is_active boolean,
  p_sort_order integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id text;
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_access text := nullif(trim(coalesce(p_access_kind, '')), '');
  v_class text := nullif(trim(coalesce(p_class_id, '')), '');
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  if length(trim(coalesce(p_name_es, ''))) not between 2 and 80
     or length(trim(coalesce(p_name_en, ''))) not between 2 and 80 then
    raise exception 'INVALID_NAME';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 2 and 48 then
    raise exception 'INVALID_SLUG';
  end if;
  if p_period is null or p_period not in ('session', 'week', 'fortnight', 'month') then
    raise exception 'INVALID_PERIOD';
  end if;
  if p_price_nio is not null and (p_price_nio <= 0 or p_price_nio > 99999999 or p_price_nio <> round(p_price_nio, 2)) then
    raise exception 'INVALID_PRICE';
  end if;
  if v_access is not null and v_access not in ('gym', 'class') then
    raise exception 'INVALID_ACCESS';
  end if;
  if v_access = 'class' then
    if v_class is null or not exists(select 1 from public.classes where id = v_class) then
      raise exception 'INVALID_CLASS';
    end if;
  else
    v_class := null;
  end if;
  -- Con vigencia, los tres datos van juntos; sin vigencia, ninguno.
  if p_duration_days is not null then
    if p_duration_days not between 1 and 3660 then raise exception 'INVALID_DURATION'; end if;
    if p_validity_currency is null or p_validity_currency not in ('NIO', 'USD') then
      raise exception 'INVALID_CURRENCY';
    end if;
    if p_validity_amount is null or p_validity_amount <= 0 or p_validity_amount > 99999999
       or p_validity_amount <> round(p_validity_amount, 2) then
      raise exception 'INVALID_AMOUNT';
    end if;
    if v_access is null then raise exception 'INVALID_ACCESS'; end if;
  else
    if v_access is not null or p_validity_currency is not null or p_validity_amount is not null then
      raise exception 'INVALID_VALIDITY';
    end if;
    v_class := null;
  end if;

  if p_id is null or trim(p_id) = '' then
    v_id := 'pln_' || replace(v_slug, '-', '_');
    if exists(select 1 from public.plans where id = v_id or slug = v_slug) then
      raise exception 'PLAN_EXISTS';
    end if;
    insert into public.plans(
      id, slug, name_es, name_en, period, price_nio, access_kind, class_id,
      duration_days, validity_currency, validity_amount, is_active, sort_order, updated_at
    ) values (
      v_id, v_slug, trim(p_name_es), trim(p_name_en), p_period, p_price_nio, v_access, v_class,
      p_duration_days, case when p_duration_days is null then null else p_validity_currency end,
      case when p_duration_days is null then null else p_validity_amount end,
      coalesce(p_is_active, true), coalesce(p_sort_order, 100), now()
    );
  else
    if exists(select 1 from public.plans where slug = v_slug and id <> p_id) then
      raise exception 'PLAN_EXISTS';
    end if;
    update public.plans
       set slug = v_slug, name_es = trim(p_name_es), name_en = trim(p_name_en),
           period = p_period, price_nio = p_price_nio,
           access_kind = v_access, class_id = v_class,
           duration_days = p_duration_days,
           validity_currency = case when p_duration_days is null then null else p_validity_currency end,
           validity_amount = case when p_duration_days is null then null else p_validity_amount end,
           is_active = coalesce(p_is_active, true),
           sort_order = coalesce(p_sort_order, sort_order),
           updated_at = now()
     where id = p_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    v_id := p_id;
  end if;

  return (select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'name_es', p.name_es, 'name_en', p.name_en,
    'period', p.period, 'price_nio', p.price_nio,
    'access_kind', p.access_kind, 'class_id', p.class_id,
    'duration_days', p.duration_days,
    'validity_currency', p.validity_currency, 'validity_amount', p.validity_amount,
    'is_active', p.is_active, 'sort_order', p.sort_order, 'updated_at', p.updated_at
  ) from public.plans p where p.id = v_id);
end $$;
revoke all on function public.admin_save_plan(text, text, text, text, text, numeric, text, text, integer, text, numeric, boolean, integer) from public, anon, authenticated;
grant execute on function public.admin_save_plan(text, text, text, text, text, numeric, text, text, integer, text, numeric, boolean, integer) to authenticated;

-- 11. Opciones de cobro: incluyen la disciplina y la forma de acceso.
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
      'class_id', t->>'class_id',
      'class_name', t->>'class_name',
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

notify pgrst, 'reload schema';
commit;
