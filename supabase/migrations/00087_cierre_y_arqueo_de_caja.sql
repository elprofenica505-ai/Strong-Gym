-- 00087 · FIN-04: abrir la caja, contar y cerrar con arqueo
--
-- Qué faltaba: la tabla `cash_sessions` existía desde la instalación y Caja la
-- mostraba como «sesiones abiertas informadas», pero **nadie podía abrir ni
-- cerrar una caja**: no había función, ni pantalla, ni regla. Peor: la política
-- `Staff can write cash_sessions` era `ALL` para cualquier personal, así que
-- cualquier cajero podía insertar o borrar sesiones sueltas sin arqueo y sin
-- dejar rastro. El saldo de la caja no se podía comprobar contra el efectivo.
--
-- Qué agrega esta migración:
--   · `finance_cash_state()` — lo que la pantalla necesita en una sola lectura:
--     la caja abierta (si hay), sus movimientos de efectivo en curso y las
--     últimas cajas cerradas con su arqueo.
--   · `finance_cash_open(p_request, p_open_nio, p_open_usd, p_notes)` — abre
--     **una** caja (no puede haber dos abiertas) con el efectivo contado al
--     empezar el turno.
--   · `finance_cash_close(p_request, p_session, p_counted_nio, p_counted_usd,
--     p_notes)` — cierra: compara lo contado contra lo esperado, guarda la
--     diferencia y **exige un motivo escrito cuando no cuadra**.
--
-- Cómo se calcula «lo esperado» (la regla que hace que el arqueo signifique
-- algo): apertura + ingresos de efectivo − egresos de efectivo ocurridos
-- **entre la apertura y el cierre**. Lo que es efectivo no se adivina por el
-- nombre del método: manda la cuenta elegida, que es la misma regla que ya usan
-- los cobros desde la 00081 (`account_type = 'caja_fuerte'`). Un movimiento
-- anulado no se resta a mano: la anulación inserta su reversa (00080/00082), y
-- las dos se suman y se anulan solas.
--
-- Reglas de seguridad:
--   · Todo exige `crm_is_staff()` (rol de administración o caja **con** segundo
--     factor). Sin eso: `AUTH`.
--   · Sólo quien abrió puede cerrar; un administrador puede cerrar cualquier
--     caja (`CASH_NOT_YOURS` para el resto). Así el cajero no cierra el turno
--     de otro ni se «arregla» un faltante ajeno.
--   · Los montos se validan en la base: no negativos, dos decimales y tope de
--     99 999 999 (`INVALID_AMOUNT`). El navegador no decide nada.
--   · Cada acción se puede reintentar sin duplicar: `open_request_id` y
--     `close_request_id` son únicos y el mismo pedido devuelve la misma caja.
--   · La tabla deja de aceptar escrituras sueltas: se quita la política `ALL`
--     y los permisos de tabla a `anon` y `authenticated`. Se escribe sólo por
--     estas funciones (`security definer`), que son las que dejan arqueo.
--
-- Qué NO cambia: no se borra ni se migra ningún dato, no se toca el saldo de
-- `bank_accounts`, no cambia `finance_read('summary')` (sigue leyendo la misma
-- columna) ni ninguna pantalla existente.
--
-- Reversible: se pueden borrar las tres funciones y las columnas nuevas; las
-- cajas cerradas quedan como registro histórico y no se pierden.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.cash_sessions') is null
     or to_regclass('public.transactions') is null
     or to_regclass('public.bank_accounts') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.crm_is_staff()') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'CASH_SESSION_PREREQUISITE_MISSING';
  end if;
end $$;

-- Columnas nuevas, todas opcionales: una caja vieja sin estos datos sigue
-- leyéndose igual.
alter table public.cash_sessions
  add column if not exists open_request_id uuid,
  add column if not exists close_request_id uuid,
  add column if not exists close_notes text;

comment on column public.cash_sessions.open_request_id is
  'Pedido que abrió la caja: repetir el mismo pedido no abre otra (FIN-04).';
comment on column public.cash_sessions.close_request_id is
  'Pedido que cerró la caja: repetir el mismo pedido no cobra dos arqueos.';
comment on column public.cash_sessions.close_notes is
  'Motivo escrito del cierre; obligatorio cuando lo contado no coincide (FIN-04).';
comment on column public.cash_sessions.expected_balance_nio is
  'Efectivo NIO esperado al cerrar: apertura + ingresos − egresos de caja.';
comment on column public.cash_sessions.closing_balance_nio is
  'Efectivo NIO contado físicamente al cerrar (el arqueo).';

create unique index if not exists cash_sessions_open_request_key
  on public.cash_sessions (open_request_id)
  where open_request_id is not null;

create unique index if not exists cash_sessions_close_request_key
  on public.cash_sessions (close_request_id)
  where close_request_id is not null;

-- Una sola caja abierta a la vez. Es un índice y no sólo una comprobación
-- dentro de la función: si dos celulares abren al mismo tiempo, la base corta
-- el segundo en vez de dejar dos turnos abiertos.
create unique index if not exists cash_sessions_one_open_key
  on public.cash_sessions ((true))
  where closed_at is null;

-- ---------------------------------------------------------------------------
-- 1. Movimientos de efectivo de una ventana de tiempo
-- ---------------------------------------------------------------------------
-- Devuelve los totales por moneda y el detalle por cuenta, para que la pantalla
-- pueda mostrar de dónde sale cada número. Es interna: la llaman las funciones
-- de abajo, nunca el navegador.
create or replace function public.finance_cash_movements(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cash as (
    select
      t.amount,
      t.currency::text as currency,
      t.type::text as type,
      t.account_id
    from public.transactions t
    join public.bank_accounts a on a.id = t.account_id
    where a.account_type = 'caja_fuerte'
      and t.status::text = 'completed'
      and t.occurred_at >= p_from
      and t.occurred_at <= p_to
  ), totals as (
    select
      coalesce(sum(amount) filter (where type = 'income' and currency = 'NIO'), 0) as income_nio,
      coalesce(sum(amount) filter (where type = 'income' and currency = 'USD'), 0) as income_usd,
      coalesce(sum(amount) filter (where type = 'expense' and currency = 'NIO'), 0) as expense_nio,
      coalesce(sum(amount) filter (where type = 'expense' and currency = 'USD'), 0) as expense_usd,
      count(*) as movements
    from cash
  )
  select jsonb_build_object(
    'incomeNio', totals.income_nio,
    'incomeUsd', totals.income_usd,
    'expenseNio', totals.expense_nio,
    'expenseUsd', totals.expense_usd,
    'count', totals.movements,
    'accounts', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'accountId', by_account.account_id,
            'currency', by_account.currency,
            'income', by_account.income,
            'expense', by_account.expense
          )
          order by by_account.account_id
        )
        from (
          select
            account_id,
            currency,
            coalesce(sum(amount) filter (where type = 'income'), 0) as income,
            coalesce(sum(amount) filter (where type = 'expense'), 0) as expense
          from cash
          group by account_id, currency
        ) by_account
      ),
      '[]'::jsonb
    )
  )
  from totals;
$$;

revoke all on function public.finance_cash_movements(timestamptz, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Una caja, tal como la lee la pantalla
-- ---------------------------------------------------------------------------
-- Para una caja abierta, «esperado» se recalcula en el momento (la pantalla se
-- puede mirar antes de cerrar). Para una caja cerrada se devuelve lo guardado:
-- el arqueo es un hecho, no un cálculo que cambia después.
create or replace function public.finance_cash_row_json(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.cash_sessions;
  v_movements jsonb;
  v_expected_nio numeric;
  v_expected_usd numeric;
begin
  select * into v_session from public.cash_sessions where id = p_id;
  if not found then return null; end if;

  v_movements := public.finance_cash_movements(
    v_session.opened_at,
    coalesce(v_session.closed_at, now())
  );
  v_expected_nio := v_session.opening_balance_nio
    + coalesce((v_movements ->> 'incomeNio')::numeric, 0)
    - coalesce((v_movements ->> 'expenseNio')::numeric, 0);
  v_expected_usd := v_session.opening_balance_usd
    + coalesce((v_movements ->> 'incomeUsd')::numeric, 0)
    - coalesce((v_movements ->> 'expenseUsd')::numeric, 0);

  return jsonb_build_object(
    'id', v_session.id,
    'open', v_session.closed_at is null,
    'openedAt', v_session.opened_at,
    'openedById', v_session.opened_by,
    'openedByName', (select full_name from public.profiles where id = v_session.opened_by),
    'openingNio', v_session.opening_balance_nio,
    'openingUsd', v_session.opening_balance_usd,
    'closedAt', v_session.closed_at,
    'closedById', v_session.closed_by,
    'closedByName', (select full_name from public.profiles where id = v_session.closed_by),
    -- `closing_balance_*` es lo contado: el nombre viejo de la tabla se
    -- conserva para no romper `finance_read` ni los datos existentes.
    'countedNio', v_session.closing_balance_nio,
    'countedUsd', v_session.closing_balance_usd,
    'expectedNio', case
      when v_session.closed_at is null then v_expected_nio
      else v_session.expected_balance_nio
    end,
    'expectedUsd', case
      when v_session.closed_at is null then v_expected_usd
      else v_session.expected_balance_usd
    end,
    'differenceNio', v_session.difference_nio,
    'differenceUsd', v_session.difference_usd,
    'notes', v_session.notes,
    'closeNotes', v_session.close_notes,
    'movements', v_movements
  );
end $$;

revoke all on function public.finance_cash_row_json(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lo que la pantalla de Cierre y arqueo pide al abrirse
-- ---------------------------------------------------------------------------
create or replace function public.finance_cash_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_open_id uuid;
  v_history jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;

  select id into v_open_id
  from public.cash_sessions
  where closed_at is null
  order by opened_at desc, id
  limit 1;

  select coalesce(
    jsonb_agg(public.finance_cash_row_json(recent.id) order by recent.closed_at desc),
    '[]'::jsonb
  ) into v_history
  from (
    select id, closed_at
    from public.cash_sessions
    where closed_at is not null
    order by closed_at desc
    limit 20
  ) recent;

  return jsonb_build_object(
    'open', case when v_open_id is null then null
                 else public.finance_cash_row_json(v_open_id) end,
    'history', v_history,
    'cashRule', 'Cuenta de caja (caja_fuerte): apertura + ingresos − egresos.'
  );
end $$;

revoke all on function public.finance_cash_state() from public, anon;
grant execute on function public.finance_cash_state() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Abrir la caja
-- ---------------------------------------------------------------------------
create or replace function public.finance_cash_open(
  p_request uuid,
  p_open_nio numeric default 0,
  p_open_usd numeric default 0,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_id uuid;
  v_existing uuid;
  v_open uuid;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  if p_open_nio is null then p_open_nio := 0; end if;
  if p_open_usd is null then p_open_usd := 0; end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'INVALID_NOTES';
  end if;
  if p_open_nio < 0 or p_open_usd < 0
     or p_open_nio > 99999999 or p_open_usd > 99999999
     or p_open_nio <> round(p_open_nio, 2) or p_open_usd <> round(p_open_usd, 2) then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- Mismo pedido, misma caja: un doble toque no abre dos turnos.
  select id into v_existing from public.cash_sessions where open_request_id = p_request;
  if found then return public.finance_cash_row_json(v_existing); end if;

  -- Serie las aperturas: la comprobación de «ya hay una abierta» y el insert
  -- tienen que ver el mismo estado.
  perform pg_advisory_xact_lock(hashtextextended('cash_session_open', 0));

  select id into v_open
  from public.cash_sessions
  where closed_at is null
  order by opened_at desc, id
  limit 1;
  if found then raise exception 'CASH_ALREADY_OPEN'; end if;

  begin
    insert into public.cash_sessions (
      opened_by, opened_at, opening_balance_nio, opening_balance_usd,
      notes, open_request_id
    ) values (
      auth.uid(), now(), p_open_nio, p_open_usd, v_notes, p_request
    ) returning id into v_id;
  exception when unique_violation then
    -- Otra caja ganó la carrera: se informa lo mismo que la comprobación.
    raise exception 'CASH_ALREADY_OPEN';
  end;

  return public.finance_cash_row_json(v_id);
end $$;

revoke all on function public.finance_cash_open(uuid, numeric, numeric, text)
  from public, anon;
grant execute on function public.finance_cash_open(uuid, numeric, numeric, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cerrar con arqueo
-- ---------------------------------------------------------------------------
create or replace function public.finance_cash_close(
  p_request uuid,
  p_session uuid,
  p_counted_nio numeric,
  p_counted_usd numeric,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_session public.cash_sessions;
  v_existing uuid;
  v_movements jsonb;
  v_expected_nio numeric;
  v_expected_usd numeric;
  v_difference_nio numeric;
  v_difference_usd numeric;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null or p_session is null then raise exception 'INVALID_REQUEST'; end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'INVALID_NOTES';
  end if;
  if p_counted_nio is null or p_counted_usd is null
     or p_counted_nio < 0 or p_counted_usd < 0
     or p_counted_nio > 99999999 or p_counted_usd > 99999999
     or p_counted_nio <> round(p_counted_nio, 2)
     or p_counted_usd <> round(p_counted_usd, 2) then
    raise exception 'INVALID_AMOUNT';
  end if;

  select id into v_existing
  from public.cash_sessions
  where close_request_id = p_request;
  if found then return public.finance_cash_row_json(v_existing); end if;

  select * into v_session from public.cash_sessions where id = p_session for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_session.closed_at is not null then raise exception 'CASH_ALREADY_CLOSED'; end if;
  -- Cerrar es firmar el arqueo: sólo quien abrió, o un administrador.
  if v_session.opened_by <> auth.uid() and not public.is_admin() then
    raise exception 'CASH_NOT_YOURS';
  end if;

  v_movements := public.finance_cash_movements(v_session.opened_at, now());
  v_expected_nio := v_session.opening_balance_nio
    + coalesce((v_movements ->> 'incomeNio')::numeric, 0)
    - coalesce((v_movements ->> 'expenseNio')::numeric, 0);
  v_expected_usd := v_session.opening_balance_usd
    + coalesce((v_movements ->> 'incomeUsd')::numeric, 0)
    - coalesce((v_movements ->> 'expenseUsd')::numeric, 0);

  -- La columna es numeric(12,2): se corta acá con un código claro en vez de
  -- dejar que Postgres devuelva un desborde sin explicación.
  if abs(v_expected_nio) > 999999999.99 or abs(v_expected_usd) > 999999999.99 then
    raise exception 'INVALID_AMOUNT';
  end if;

  v_difference_nio := round(p_counted_nio - v_expected_nio, 2);
  v_difference_usd := round(p_counted_usd - v_expected_usd, 2);

  -- Si falta o sobra plata, tiene que quedar escrito por qué. Si cuadra, la
  -- nota es opcional.
  if v_notes is null and (v_difference_nio <> 0 or v_difference_usd <> 0) then
    raise exception 'CASH_DIFFERENCE_REASON_REQUIRED';
  end if;

  update public.cash_sessions set
    closed_by = auth.uid(),
    closed_at = now(),
    closing_balance_nio = p_counted_nio,
    closing_balance_usd = p_counted_usd,
    expected_balance_nio = v_expected_nio,
    expected_balance_usd = v_expected_usd,
    difference_nio = v_difference_nio,
    difference_usd = v_difference_usd,
    close_notes = v_notes,
    close_request_id = p_request
  where id = v_session.id;

  return public.finance_cash_row_json(v_session.id);
end $$;

revoke all on function public.finance_cash_close(uuid, uuid, numeric, numeric, text)
  from public, anon;
grant execute on function public.finance_cash_close(uuid, uuid, numeric, numeric, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. La tabla deja de aceptar escrituras sueltas
-- ---------------------------------------------------------------------------
-- Antes: una sola política `ALL` para cualquier personal. Con ella, el cajero
-- podía insertar una «caja» sin movimientos o borrar la del turno anterior.
-- Ahora se lee por `finance_read` / `finance_cash_state` y se escribe sólo por
-- las funciones de arriba, que dejan apertura, cierre y arqueo.
alter table public.cash_sessions enable row level security;

do $$
declare v_policy record;
begin
  for v_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'cash_sessions'
  loop
    execute format('drop policy %I on public.cash_sessions', v_policy.policyname);
  end loop;
end $$;

revoke all on public.cash_sessions from anon, authenticated;

notify pgrst, 'reload schema';

commit;
