-- 00085 · Anular un cobro da de baja la vigencia que activó
--
-- Qué estaba mal: se anulaba el cobro, el dinero volvía a la caja y la
-- membresía seguía corriendo como si nada. La persona conservaba los días
-- aunque no había pagado: era una fuga de dinero silenciosa, y ninguna
-- pantalla lo decía.
--
-- Qué hace ahora, con una sola regla:
--   * El segmento de vigencia que nació de ese cobro queda **anulado**
--     (`voided_at`, `voided_reason`, `voided_by`, `void_id`). No se borra.
--   * Los segmentos que venían encadenados detrás se **adelantan** los días
--     que se quitaron, para que nadie pierda ni gane días: si se anula un mes,
--     el mes siguiente empieza donde empezaba el anulado.
--   * Un hueco real (la persona dejó vencer y volvió después) **no se toca**:
--     solo se encoge una cadena contigua.
--   * Todo movimiento de fechas queda en `plan_validity_log` con las fechas de
--     antes y de después, quién lo hizo y por qué. Reversible: las fechas
--     originales están guardadas ahí.
--
-- Cómo se engancha: un disparador en `finance_voids` aplica esto a **toda**
-- anulación, venga de la pantalla de Caja o de una ruta interna. Anular una
-- venta de producto o un gasto no tiene segmentos y no cambia nada.
--
-- Qué NO cambia: la anulación sigue siendo solo de administración o caja con
-- segundo factor, solo del día en curso para caja, con el interruptor de
-- anulación y con motivo escrito. Sigue sin borrar nada: la reversa, el
-- movimiento original y el segmento anulado quedan en la base.
--
-- Reversible: `drop trigger ... ; drop function plan_void_segments, plan_relayout_segments;
-- alter table public.payment_plans drop column voided_at, ... ; drop table plan_validity_log;`
-- Las fechas adelantadas se pueden reponer desde `plan_validity_log`.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.payment_plans') is null
     or to_regclass('public.plans') is null
     or to_regclass('public.classes') is null
     or to_regclass('public.finance_voids') is null
     or to_regprocedure('public.crm_is_staff()') is null then
    raise exception 'PLAN_VOID_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. La marca de anulación. Nada se borra: el segmento sigue en la ficha.
alter table public.payment_plans add column if not exists voided_at timestamptz;
alter table public.payment_plans add column if not exists voided_reason text;
alter table public.payment_plans add column if not exists voided_by uuid;
alter table public.payment_plans add column if not exists void_id uuid;

create index if not exists payment_plans_transaction_idx
  on public.payment_plans (transaction_id)
  where transaction_id is not null;
create index if not exists payment_plans_live_idx
  on public.payment_plans (client_id, started_on)
  where voided_at is null;

-- 2. Bitácora de fechas. Solo la leen las funciones de abajo.
create table if not exists public.plan_validity_log (
  id         uuid primary key default gen_random_uuid(),
  plan_row   uuid,
  client_id  uuid,
  action     text not null,
  before     jsonb,
  after      jsonb,
  reason     text,
  actor_id   uuid,
  void_id    uuid,
  created_at timestamptz not null default now()
);
alter table public.plan_validity_log enable row level security;
revoke all on public.plan_validity_log from public, anon, authenticated;
create index if not exists plan_validity_log_client_idx
  on public.plan_validity_log (client_id, created_at desc);

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
     and voided_at is null
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
     and voided_at is null
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
     and voided_at is null
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
          exists(select 1 from public.payment_plans s where s.client_id = p_client and s.class_id = c.id and s.voided_at is null)
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
      from public.payment_plans s
     where s.client_id = p_client and s.voided_at is null
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.plan_validity_summary(uuid) from public, anon, authenticated;
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
     and voided_at is null
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
create or replace function public.client_category_eval(p_client uuid, p_today date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_gym jsonb;
  v_classes jsonb;
  v_gym_days integer := 0;
  v_class_days integer := 0;
  v_valid_days integer := 0;
  v_has_validity boolean := false;
  v_visits integer := 0;
  v_purchases integer := 0;
  v_visit_rule integer := 0;
  v_counts integer := 0;
  v_rule public.category_rules;
  v_matched boolean := false;
  v_cat text;
  v_label text := 'sin vigencia';
begin
  v_gym := public.plan_class_state(p_client, null::text, p_today);

  -- Días comprados del segmento vigente más largo de cada acceso.
  select coalesce(max(expires_on - started_on + 1), 0) into v_gym_days
    from public.payment_plans
   where client_id = p_client and access = 'gym' and voided_at is null
     and started_on <= p_today and expires_on >= p_today;
  select coalesce(max(expires_on - started_on + 1), 0) into v_class_days
    from public.payment_plans
   where client_id = p_client and class_id is not null and voided_at is null
     and started_on <= p_today and expires_on >= p_today;

  v_valid_days := greatest(v_gym_days, v_class_days);
  v_has_validity := v_valid_days > 0;

  v_classes := coalesce((
    select jsonb_agg(jsonb_build_object(
      'class_id', s.class_id,
      'class_name', (select name_es from public.classes where id = s.class_id),
      'plan_id', s.plan_id,
      'started_on', s.started_on,
      'expires_on', s.expires_on,
      'days', s.expires_on - s.started_on + 1
    ) order by s.expires_on desc)
    from public.payment_plans s
   where s.client_id = p_client and s.class_id is not null and s.voided_at is null
     and s.started_on <= p_today and s.expires_on >= p_today
  ), '[]'::jsonb);

  -- Datos informativos, siempre con la ventana de la regla «amigo» vigente.
  select coalesce(max(visits_window_days), 30) into v_visit_rule
    from public.category_rules where category = 'amigo';
  select count(*) into v_visits from public.client_visits
   where client_id = p_client
     and local_day > p_today - v_visit_rule
     and local_day <= p_today;
  select count(*) into v_purchases from public.stock_movements
   where client_id = p_client and kind = 'venta'
     and created_at >= now() - interval '90 days';

  -- Primera regla activa que cumple, en el orden que fijó el administrador.
  for v_rule in
    select * from public.category_rules
     where is_active and not is_fallback
     order by sort_order, category
  loop
    if v_rule.requires_validity and v_valid_days < v_rule.validity_days_min then
      continue;
    end if;
    if v_rule.forbids_validity and v_has_validity then
      continue;
    end if;
    if v_rule.requires_purchase_window_days is not null then
      select count(*) into v_counts from public.stock_movements m
       where m.client_id = p_client and m.kind = 'venta'
         and m.created_at >= now() - make_interval(days => v_rule.requires_purchase_window_days);
      if v_counts = 0 then continue; end if;
    end if;
    if v_rule.visits_min > 0 then
      select count(*) into v_counts from public.client_visits v
       where v.client_id = p_client
         and v.local_day > p_today - v_rule.visits_window_days
         and v.local_day <= p_today;
      if v_counts < v_rule.visits_min then continue; end if;
    end if;
    v_cat := v_rule.category;
    v_matched := true;
    exit;
  end loop;

  -- Si ninguna regla cumple, la categoría de reserva configurada.
  if not v_matched then
    select category into v_cat from public.category_rules
     where is_fallback and is_active order by sort_order limit 1;
    v_cat := coalesce(v_cat, 'comun');
  end if;

  if v_gym_days > 0 then
    v_label := 'gimnasio vigente';
  elsif v_class_days > 0 then
    v_label := 'plan de disciplina vigente';
  elsif v_visits > 0 then
    v_label := v_visits || case when v_visits = 1 then ' visita en ' else ' visitas en ' end
               || v_visit_rule || ' días';
  end if;

  return jsonb_build_object(
    'category', v_cat,
    'reason', v_label,
    'validity_days', v_valid_days,
    'gym_days', v_gym_days,
    'class_days', v_class_days,
    'gym', v_gym,
    'classes', v_classes,
    'visits_30_days', v_visits,
    'purchases_90_days', v_purchases,
    'visits_window_days', v_visit_rule
  );
end $$;
revoke all on function public.client_category_eval(uuid, date) from public, anon, authenticated;

-- 3. Recolocar una cadena de vigencia de un acceso (gimnasio o una clase).
--
-- La regla es simple: se recorre la línea de tiempo en orden; los segmentos
-- anulados no consumen días; los que venían pegados al anterior se corren
-- para atrás; si había un hueco real, la fecha se respeta. Correr esto dos
-- veces deja el mismo resultado (se recalcula desde las fechas guardadas y,
-- como todos los segmentos de la cadena se corren igual, la cadena sigue
-- siendo contigua).
create or replace function public.plan_relayout_segments(
  p_client uuid,
  p_class text,
  p_reason text,
  p_void uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_prev_end date;   -- fin guardado del segmento anterior, para ver si había hueco
  v_cursor date;     -- primer día libre de la cadena
  v_start date;
  v_end date;
  v_days integer;
  v_changed jsonb := '[]'::jsonb;
begin
  for v_row in
    select id, started_on, expires_on, voided_at
      from public.payment_plans
     where client_id = p_client
       and ((p_class is null and access = 'gym') or (p_class is not null and class_id = p_class))
     order by started_on, created_at, id
  loop
    if v_cursor is null then
      v_cursor := v_row.started_on;
    elsif v_row.started_on > v_prev_end + 1 then
      -- La persona dejó vencer y volvió otro día: ese hueco no se rellena.
      v_cursor := v_row.started_on;
    end if;

    if v_row.voided_at is null then
      v_days := v_row.expires_on - v_row.started_on + 1;
      v_start := v_cursor;
      v_end := v_cursor + v_days - 1;
      if v_start <> v_row.started_on or v_end <> v_row.expires_on then
        update public.payment_plans
           set started_on = v_start, expires_on = v_end
         where id = v_row.id;
        insert into public.plan_validity_log(
          plan_row, client_id, action, before, after, reason, actor_id, void_id
        ) values (
          v_row.id, p_client, 'shift',
          jsonb_build_object('started_on', v_row.started_on, 'expires_on', v_row.expires_on),
          jsonb_build_object('started_on', v_start, 'expires_on', v_end),
          p_reason, auth.uid(), p_void
        );
        v_changed := v_changed || jsonb_build_array(jsonb_build_object(
          'id', v_row.id, 'startedOn', v_start, 'expiresOn', v_end
        ));
      end if;
      v_cursor := v_end + 1;
    end if;

    v_prev_end := v_row.expires_on;
  end loop;
  return v_changed;
end $$;
revoke all on function public.plan_relayout_segments(uuid, text, text, uuid) from public, anon, authenticated;

-- 4. Dar de baja las vigencias de un cobro anulado.
create or replace function public.plan_void_segments(
  p_transaction uuid,
  p_reason text,
  p_void uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key record;
  v_marked integer := 0;
  v_changed jsonb := '[]'::jsonb;
begin
  if not public.crm_is_staff() then
    raise exception 'AUTH';
  end if;
  if p_transaction is null then
    raise exception 'INVALID_TRANSACTION';
  end if;

  update public.payment_plans
     set voided_at = now(),
         voided_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         voided_by = auth.uid(),
         void_id = p_void
   where transaction_id = p_transaction
     and voided_at is null;
  get diagnostics v_marked = row_count;

  if v_marked > 0 then
    insert into public.plan_validity_log(
      plan_row, client_id, action, before, after, reason, actor_id, void_id
    )
    select s.id, s.client_id, 'void_segment',
           jsonb_build_object('started_on', s.started_on, 'expires_on', s.expires_on),
           jsonb_build_object('voided', true, 'transaction_id', s.transaction_id),
           p_reason, auth.uid(), p_void
      from public.payment_plans s
     where s.transaction_id = p_transaction;

    for v_key in
      select distinct client_id, class_id
        from public.payment_plans
       where transaction_id = p_transaction
    loop
      v_changed := v_changed || public.plan_relayout_segments(
        v_key.client_id, v_key.class_id, p_reason, p_void
      );
    end loop;
  end if;

  return jsonb_build_object('voided', v_marked, 'shifted', v_changed);
end $$;
revoke all on function public.plan_void_segments(uuid, text, uuid) from public, anon, authenticated;

-- 5. Enganche: cualquier anulación registrada da de baja sus vigencias.
create or replace function public.plan_void_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Si esto falla, falla la anulación completa: es preferible a dejar el
  -- dinero devuelto y la membresía corriendo sin que nadie lo note.
  perform public.plan_void_segments(new.original_id, new.reason, new.id);
  return new;
end $$;
revoke all on function public.plan_void_after_insert() from public, anon, authenticated;

drop trigger if exists plan_void_after_insert on public.finance_voids;
create trigger plan_void_after_insert
  after insert on public.finance_voids
  for each row execute function public.plan_void_after_insert();

-- 6. Alinear lo que ya estaba anulado antes de esta migración.
--
-- No se inventa nada: se marca el segmento cuyo cobro ya tiene una anulación
-- guardada en `finance_voids` y se corre la misma recolocación. Queda en la
-- bitácora con el motivo real de aquella anulación.
update public.payment_plans s
   set voided_at = fv.created_at,
       voided_reason = fv.reason,
       voided_by = fv.actor_id,
       void_id = fv.id
  from public.finance_voids fv
 where fv.original_id = s.transaction_id
   and s.voided_at is null;

do $$
declare v_key record;
begin
  for v_key in
    select distinct s.client_id, s.class_id
      from public.payment_plans s
      join public.finance_voids fv on fv.original_id = s.transaction_id
  loop
    perform public.plan_relayout_segments(
      v_key.client_id, v_key.class_id, 'alineación de anulaciones anteriores', null
    );
  end loop;
end $$;

-- 7. Lecturas: los segmentos anulados no cuentan para la vigencia.

-- 8. Qué vigencia activó un cobro (para avisar antes de anular y contarlo
-- después). La pantalla de Caja lo usa; no decide nada.
create or replace function public.finance_void_plan_impact(p_transaction uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'America/Managua')::date;
  v_rows jsonb;
begin
  if not public.crm_is_staff() then
    raise exception 'AUTH';
  end if;
  if p_transaction is null then
    raise exception 'INVALID_TRANSACTION';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'planId', s.plan_id,
        'planName', coalesce(nullif(pl.name_es, ''), s.plan_id),
        'access', case when s.class_id is null then 'gym' else 'class' end,
        'startedOn', s.started_on,
        'expiresOn', s.expires_on,
        'pricePaid', s.price_paid,
        'currency', s.currency,
        'voided', s.voided_at is not null,
        'state', case
          when s.voided_at is not null then 'voided'
          when s.started_on <= v_today and s.expires_on >= v_today then 'active'
          when s.started_on > v_today then 'upcoming'
          else 'expired'
        end
      )
      order by s.started_on
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.payment_plans s
  left join public.plans pl on pl.id = s.plan_id
  where s.transaction_id = p_transaction;

  return v_rows;
end $$;

revoke all on function public.finance_void_plan_impact(uuid) from public, anon;
grant execute on function public.finance_void_plan_impact(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
