-- ============================================================
--  STRONG FITNESS GYM — PONER LA BASE AL DÍA
-- ============================================================
--
--  ESTE ARCHIVO ES PARA UN PROYECTO QUE YA ESTÁ FUNCIONANDO.
--  Reemplaza los datos de ejemplo de la primera carga por los
--  datos reales del gimnasio y corrige la grilla de clases.
--  Si todavía no tenés la Fase 1 (caja), también la instala.
--
--  CÓMO USARLO (se hace todo desde el celular)
--    1. Entrá a https://supabase.com y abrí tu proyecto
--    2. Menú → "SQL Editor" → "New query"
--    3. Copiá TODO este archivo, pegalo y tocá "Run"
--    4. Al final del archivo hay una consulta para comprobar
--       que quedó bien
--
--  NO BORRA CUENTAS NI RESERVAS. Es seguro correrlo más de una vez.
--
--  ARCHIVO GENERADO — no lo edites a mano.
--  El original es supabase/migrations/00003_datos_reales.sql.
--  Para regenerarlo:  node scripts/build-sql.mjs
-- ============================================================


-- ============================================================
--  Strong Fitness Gym — 00003 · Datos reales del gimnasio
-- ============================================================
--  QUÉ HACE ESTE ARCHIVO
--  ---------------------
--  La primera carga de la base traía disciplinas, entrenadores y
--  precios de ejemplo. Esta migración los reemplaza por los datos
--  reales del gimnasio y deja la grilla de clases correcta:
--
--    · Disciplinas: pesas y máquinas, boxeo, zumba (antes eran 9).
--    · Entrenadores de ejemplo: se eliminan (eran inventados).
--    · Planes: Boxeo $20/mes + dos planes "a consultar".
--    · Grilla: boxeo martes, miércoles y jueves a las 06:00,
--      17:30 y 20:00. El domingo el gimnasio cierra.
--
--  SE PUEDE CORRER VARIAS VECES
--  ----------------------------
--  Todo está escrito para ser idempotente: si la corrés dos veces
--  el resultado es el mismo.
--
--  NO BORRA DATOS DE SOCIOS
--  ------------------------
--  Las cuentas, los perfiles y las reservas no se tocan.
--  · Las clases ya pasadas quedan intactas (son historial).
--  · Si una clase futura tenía gente anotada, NO se borra: se marca
--    como cancelada para que el socio la siga viendo en su cuenta.
--  · Sólo se borran las clases futuras a las que nadie se anotó.
--
--  CÓMO CORRERLA
--  -------------
--  Supabase → SQL Editor → New query → pegar todo → Run.
-- ============================================================

begin;


-- ------------------------------------------------------------
--  1. El precio puede quedar sin publicar
-- ------------------------------------------------------------
--  Hay planes cuyo precio todavía no se anuncia en la web. En vez
--  de inventar un número, guardamos NULL y la web muestra
--  "Consultar por WhatsApp".

alter table public.plans alter column price drop not null;
alter table public.plans alter column price drop default;


-- ------------------------------------------------------------
--  2. Color de marca
-- ------------------------------------------------------------
--  El verde lima del diseño anterior se reemplaza por el rojo real.

alter table public.classes alter column color set default '#d81a22';
alter table public.coaches alter column color set default '#d81a22';

update public.classes set color = '#d81a22' where color = '#cbf73f';
update public.coaches set color = '#d81a22' where color = '#cbf73f';


-- ------------------------------------------------------------
--  3. Grilla semanal nueva
-- ------------------------------------------------------------
--  Volvemos a crear la función que arma las clases de una semana,
--  ahora con la grilla real. El bloque marcado lo genera
--  scripts/build-sql.mjs a partir de src/lib/data/demo-sessions.ts,
--  así la web y la base nunca se desincronizan.

create or replace function public.generate_week_sessions(p_monday date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_slot record;
  v_class  public.classes;
  v_coach  text;
  v_start  timestamptz;
  v_created integer;
begin
  -- Sólo admin o staff
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  ) and auth.uid() is not null then
    raise exception 'AUTH: sólo el staff puede generar horarios';
  end if;

  for v_slot in
    select * from (values
-- >>> PLANTILLA SEMANAL (generada por scripts/build-sql.mjs — no editar a mano) >>>
      -- Misma grilla que src/lib/data/demo-sessions.ts (la web).
      -- día (0 = lunes), hora local del gimnasio, disciplina
      -- Lunes: sin clases dirigidas (sala abierta)
      -- Martes
      (1, '06:00'::time, 'boxeo'),
      (1, '17:30'::time, 'boxeo'),
      (1, '20:00'::time, 'boxeo'),
      -- Miércoles
      (2, '06:00'::time, 'boxeo'),
      (2, '17:30'::time, 'boxeo'),
      (2, '20:00'::time, 'boxeo'),
      -- Jueves
      (3, '06:00'::time, 'boxeo'),
      (3, '17:30'::time, 'boxeo'),
      (3, '20:00'::time, 'boxeo')
      -- Viernes: sin clases dirigidas (sala abierta)
      -- Sábado: sin clases dirigidas (sala abierta)
      -- Domingo: CERRADO
-- <<< PLANTILLA SEMANAL <<<
    ) as t(day_offset, start_time, slug)
  loop
    select * into v_class from public.classes where slug = v_slot.slug and is_active;
    if not found then continue; end if;

    -- `fecha + hora` da un timestamp "sin zona"; AT TIME ZONE lo interpreta
    -- como hora local del gimnasio y devuelve el instante UTC correcto.
    -- (Managua es UTC-6 todo el año, no tiene horario de verano.)
    v_start := ((p_monday + v_slot.day_offset) + v_slot.start_time)
               at time zone 'America/Managua';

    -- Evitamos duplicar si ya existe esa clase a esa hora
    select count(*) into v_created
    from public.sessions
    where class_id = v_class.id and starts_at = v_start;

    if v_created > 0 then continue; end if;

    -- Elegimos un profe al azar entre los que dictan la disciplina
    select id into v_coach
    from public.coaches
    where is_active and v_class.slug = any (specialties)
    order by random()
    limit 1;

    insert into public.sessions (class_id, coach_id, starts_at, ends_at, capacity, room)
    values (
      v_class.id,
      v_coach,
      v_start,
      v_start + (v_class.duration_min || ' minutes')::interval,
      v_class.capacity,
      case v_class.slug
-- >>> SALAS >>>
        when 'boxeo' then 'Área de boxeo'
        when 'musculacion' then 'Sala de máquinas'
        when 'zumba' then 'Salón de clases'
-- <<< SALAS <<<
        else 'Salón principal'
      end
    );

    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.generate_week_sessions(date) from public;
grant execute on function public.generate_week_sessions(date) to authenticated;


-- ------------------------------------------------------------
--  4. Limpiar las clases futuras de la grilla vieja
-- ------------------------------------------------------------
--  Primero protegemos lo que tiene gente anotada: esas clases no se
--  borran, se marcan como canceladas.

update public.sessions s
   set status = 'cancelled'
 where s.starts_at >= now()
   and s.status <> 'cancelled'
   and exists (
     select 1 from public.bookings b
      where b.session_id = s.id
        and b.status in ('confirmed', 'attended')
   );

--  Y ahora sí borramos las clases futuras a las que nadie se anotó.
--  Las de la grilla nueva se vuelven a crear en el paso 8.

delete from public.sessions s
 where s.starts_at >= now()
   and not exists (select 1 from public.bookings b where b.session_id = s.id);


-- ------------------------------------------------------------
--  5. Entrenadores de ejemplo
-- ------------------------------------------------------------
--  Los seis entrenadores de la carga inicial eran inventados.
--  Al borrarlos, las clases que los tenían asignados quedan
--  simplemente sin profe (la FK es ON DELETE SET NULL).
--
--  Cuando el gimnasio pase los nombres reales, se cargan con el
--  bloque de ejemplo que está en 00002_seed.sql.

delete from public.coaches
 where id in ('cch_diego', 'cch_sofia', 'cch_nicolas',
              'cch_valentina', 'cch_marcos', 'cch_julieta');


-- ------------------------------------------------------------
--  6. Disciplinas reales
-- ------------------------------------------------------------

insert into public.classes
  (id, slug, name_es, name_en, description_es, description_en, intensity, duration_min, capacity, color, sort_order)
values
  ('cls_musculacion', 'musculacion', 'Pesas y máquinas', 'Weights & Machines',
   'Sala completa con máquinas modernas y pesas libres: pecho, espalda, pierna, tríceps, pantorrilla y abdominales. Entrás en el horario que quieras, sin reservar.',
   'A full floor of modern machines and free weights: chest, back, legs, triceps, calves and abs. Walk in whenever you like, no booking needed.',
   'medium', 60, 40, '#0c0c0e', 1),

  ('cls_boxeo', 'boxeo', 'Boxeo', 'Boxing',
   'Clases de boxeo para todas las edades, con entrenador en cada sesión. Técnica, saco y acondicionamiento. Martes, miércoles y jueves, con tres horarios al día.',
   'Boxing classes for all ages, with a coach in every session. Technique, heavy bag and conditioning. Tuesday, Wednesday and Thursday, three time slots a day.',
   'high', 60, 20, '#d81a22', 2),

  ('cls_zumba', 'zumba', 'Zumba y bailoterapia', 'Zumba & Dance Cardio',
   'Cardio bailando ritmos latinos. Quemás calorías sin aburrirte y en grupo. Consultá el horario vigente por WhatsApp.',
   'Dance cardio to Latin rhythms. Burn calories without getting bored, in a group. Ask for the current schedule on WhatsApp.',
   'medium', 60, 30, '#8f0f15', 3)
on conflict (id) do update set
  slug = excluded.slug,
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  description_es = excluded.description_es,
  description_en = excluded.description_en,
  intensity = excluded.intensity,
  duration_min = excluded.duration_min,
  capacity = excluded.capacity,
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_active = true;

--  Las disciplinas viejas (spinning, yoga, pilates, hiit, funcional,
--  cross-training, stretching) salen de la web.
--  Las que todavía tienen clases pasadas quedan guardadas pero
--  desactivadas, para no romper el historial de nadie.

update public.classes
   set is_active = false
 where slug not in ('musculacion', 'boxeo', 'zumba');

delete from public.classes c
 where c.slug not in ('musculacion', 'boxeo', 'zumba')
   and not exists (select 1 from public.sessions s where s.class_id = c.id);


-- ------------------------------------------------------------
--  7. Planes reales
-- ------------------------------------------------------------
--  price = NULL significa "a consultar": la web muestra un botón de
--  WhatsApp en vez de un precio inventado.

insert into public.plans
  (id, slug, name_es, name_en, tagline_es, tagline_en, price, period, features_es, features_en, is_popular, sort_order)
values
  ('pln_boxeo', 'boxeo', 'Boxeo', 'Boxing',
   'Para todas las edades, con entrenador', 'All ages, coach included',
   20, 'month',
   array['Martes, miércoles y jueves', '3 sesiones al día a elegir', 'Entrenador en cada clase', 'Para todas las edades'],
   array['Tuesday, Wednesday and Thursday', '3 daily sessions to choose from', 'A coach in every class', 'Open to all ages'],
   true, 1),

  ('pln_gimnasio', 'gimnasio-mensual', 'Gimnasio mensual', 'Monthly Gym',
   'Pesas y máquinas todo el mes', 'Weights and machines all month',
   null, 'month',
   array['Máquinas modernas y pesas libres', 'Acceso en todo el horario de atención', 'Orientación del personal para usar los equipos', 'Consultá el precio por WhatsApp'],
   array['Modern machines and free weights', 'Access during all opening hours', 'Staff guidance on how to use the equipment', 'Ask for the price on WhatsApp'],
   false, 2),

  ('pln_dia', 'pase-del-dia', 'Pase del día', 'Day Pass',
   'Una visita para conocernos', 'A single visit to try us out',
   null, 'session',
   array['Una visita, sin compromiso', 'Ideal para probar la sala', 'Consultá el precio por WhatsApp'],
   array['One visit, no commitment', 'Great for trying the gym floor', 'Ask for the price on WhatsApp'],
   false, 3)
on conflict (id) do update set
  slug = excluded.slug,
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  tagline_es = excluded.tagline_es,
  tagline_en = excluded.tagline_en,
  price = excluded.price,
  period = excluded.period,
  features_es = excluded.features_es,
  features_en = excluded.features_en,
  is_popular = excluded.is_popular,
  sort_order = excluded.sort_order,
  is_active = true;

delete from public.plans
 where id in ('pln_basico', 'pln_full', 'pln_duo', 'pln_personal');

--  Si algún socio tenía asignado uno de esos planes, le dejamos el
--  plan vacío para que no apunte a algo que ya no existe.
--  La cuenta, el historial y las reservas no se tocan.

update public.profiles
   set plan_id = null
 where plan_id is not null
   and plan_id not in (select id from public.plans);


-- ------------------------------------------------------------
--  8. Mensajes de ejemplo
-- ------------------------------------------------------------
--  La carga inicial traía dos consultas de prueba en el buzón del
--  panel. Las sacamos para que no se confundan con consultas reales.

delete from public.messages
 where email in ('andrea.solis@example.com', 'kevin.ramirez@example.com');


-- ------------------------------------------------------------
--  9. Clases de las próximas 4 semanas
-- ------------------------------------------------------------
--  Se arma la grilla nueva desde el lunes de esta semana.
--  Son 9 clases por semana → 36 en total.

select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1));
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 7);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 14);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 21);


commit;


-- ============================================================
--  COMPROBAR QUE SALIÓ BIEN
-- ============================================================
--  Pegá esta consulta aparte y tocá Run. Tiene que devolver
--  exactamente estas cuatro filas:
--
--    disciplinas activas          | 3
--    entrenadores                 | 0
--    planes                       | 3
--    clases cargadas (4 semanas)  | 36
--
--  select 'disciplinas activas' as dato, count(*)::text as valor
--    from public.classes where is_active
--  union all
--  select 'entrenadores', count(*)::text from public.coaches
--  union all
--  select 'planes', count(*)::text from public.plans where is_active
--  union all
--  select 'clases cargadas (4 semanas)', count(*)::text
--    from public.sessions s
--    join public.classes c on c.id = s.class_id
--   where c.is_active
--     and s.status = 'scheduled'
--     and s.starts_at >= date_trunc('week', now());
-- ============================================================



-- ############################################################
-- #  FASE 1: CAJA Y CONTABILIDAD (para bases que ya estaban
-- #  funcionando antes de esta fase)
-- ############################################################

-- ============================================================
--  Strong Fitness Gym — FASE 1: Contabilidad, caja y pagos
-- ============================================================
--  Este archivo crea todo el sistema de caja, ingresos, egresos,
--  cuentas por cobrar y métodos de pago del gimnasio.
--
--  Se puede correr varias veces sin romper nada (IF NOT EXISTS,
--  CREATE OR REPLACE, ON CONFLICT).
--
--  Tablas que crea:
--    · payment_methods       — métodos de pago aceptados (efectivo,
--                              transferencia, tarjeta, SINPE Móvil,
--                              billetera móvil, etc.)
--    · expense_categories    — categorías de gastos (alquiler, luz,
--                              sueldos, mantenimiento…)
--    · accounts              — cuentas bancarias / billeteras del gym
--    · transactions          — cada movimiento de dinero (ingreso o
--                              egreso), con su método, moneda y
--                              conversión a la moneda base.
--    · invoices              — facturas a socios (mensualidades,
--                              pases diarios, suplementos…)
--    · invoice_items         — renglones de cada factura.
--    · cash_registers        — apertura y cierre de caja por día.
--    · member_balances       — saldo a favor / deuda de cada socio
--                              (se actualiza por trigger).
--
--  Campos que se agregan a profiles (sin romper lo existente):
--    · emergency_contact_name, emergency_contact_phone
--    · medical_notes, birthdate, address, joined_at
--    · status: 'active' | 'frozen' | 'cancelled'
--
--  Vistas para el panel:
--    · v_daily_cash           — resumen del día
--    · v_accounts_receivable  — quién debe y cuánto
--    · v_monthly_pnl          — pérdidas y ganancias del mes
--    · v_payment_methods_breakdown — qué método se usa más
-- ============================================================


-- ------------------------------------------------------------
--  1. TIPOS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'currency_code') then
    create type public.currency_code as enum ('NIO', 'USD');
  end if;

  if not exists (select 1 from pg_type where typname = 'txn_direction') then
    create type public.txn_direction as enum ('income', 'expense');
  end if;

  if not exists (select 1 from pg_type where typname = 'txn_status') then
    create type public.txn_status as enum ('pending', 'completed', 'reversed');
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum ('draft', 'open', 'paid', 'overdue', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'member_status') then
    create type public.member_status as enum ('active', 'frozen', 'cancelled');
  end if;
end $$;


-- ------------------------------------------------------------
--  2. EXTENDER PROFILES (sin romper datos existentes)
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists emergency_contact_name  text,
  add column if not exists emergency_contact_phone text,
  add column if not exists medical_notes          text,
  add column if not exists birthdate              date,
  add column if not exists address                text,
  add column if not exists joined_at              date default current_date,
  add column if not exists status                 public.member_status not null default 'active';


-- ------------------------------------------------------------
--  3. MÉTODOS DE PAGO
-- ------------------------------------------------------------
--  El admin configura los métodos aceptados. Cada método tiene
--  detalles del banco o billetera para que el socio sepa dónde
--  transferir (ej: "BAC · C$ 12345678").

create table if not exists public.payment_methods (
  id          text primary key,
  slug        text not null unique,
  kind        text not null check (kind in (
                'cash',              -- efectivo
                'bank_transfer',     -- transferencia bancaria
                'credit_card',       -- tarjeta de crédito
                'debit_card',        -- tarjeta de débito
                'sinpe_movil',       -- SINPE Móvil (Costa Rica / Nicaragua)
                'mobile_wallet',     -- billetera móvil (Tigo Money, Claro Pay, etc.)
                'crypto',            -- cripto
                'other'              -- otro
              )),
  name_es     text not null,
  name_en     text not null,
  details_es  text not null default '',
  details_en  text not null default '',
  accepts_nio boolean not null default true,
  accepts_usd boolean not null default true,
  icon        text not null default 'Wallet',
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists payment_methods_active_idx
  on public.payment_methods (is_active, sort_order);


-- ------------------------------------------------------------
--  4. CATEGORÍAS DE GASTOS
-- ------------------------------------------------------------

create table if not exists public.expense_categories (
  id         text primary key,
  slug       text not null unique,
  name_es    text not null,
  name_en    text not null,
  icon       text not null default 'Receipt',
  is_active  boolean not null default true,
  sort_order integer not null default 0
);


-- ------------------------------------------------------------
--  5. CUENTAS DEL GIMNASIO
-- ------------------------------------------------------------
--  Dónde entra el dinero. Permite conciliar con extractos bancarios.

create table if not exists public.accounts (
  id              text primary key,
  slug            text not null unique,
  name            text not null,                -- ej: "Caja fuerte", "BAC NIO", "BAC USD"
  kind            text not null check (kind in ('cash', 'bank', 'wallet')),
  currency        public.currency_code not null default 'NIO',
  bank_name       text,
  account_number  text,
  holder_name     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);


-- ------------------------------------------------------------
--  6. TRANSACCIONES (corazón del sistema)
-- ------------------------------------------------------------
--  Cada movimiento de dinero. Con método, cuenta, categoría
--  (si es gasto), socio (si es pago de un socio), y la conversión
--  a la moneda base del gimnasio (NIO) para poder sumar.

create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  direction       public.txn_direction not null,
  status          public.txn_status not null default 'completed',

  -- importe original (lo que pagó el socio o lo que salió)
  amount          numeric(12, 2) not null check (amount >= 0),
  currency        public.currency_code not null,

  -- conversión a la moneda base (NIO) en el momento de la tx
  fx_rate         numeric(12, 4) not null default 1.0,
  base_amount     numeric(12, 2) not null,         -- amount * fx_rate

  -- cómo se pagó
  payment_method_id text references public.payment_methods (id) on delete set null,
  account_id        text references public.accounts (id) on delete set null,

  -- de dónde viene / a dónde va
  member_id        uuid references public.profiles (id) on delete set null,
  invoice_id       uuid,                            -- FK se agrega abajo (la tabla invoices se crea después)
  expense_category_id text references public.expense_categories (id) on delete set null,

  -- texto libre
  concept         text not null,
  notes           text,

  -- auditoría
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  reversed_at     timestamptz,
  reversed_by     uuid references public.profiles (id),

  -- integridad mínima
  constraint tx_positive check (amount > 0)
);

create index if not exists transactions_occurred_idx
  on public.transactions (occurred_at desc);
create index if not exists transactions_member_idx
  on public.transactions (member_id, occurred_at desc);
create index if not exists transactions_direction_idx
  on public.transactions (direction, occurred_at desc);


-- ------------------------------------------------------------
--  7. FACTURAS
-- ------------------------------------------------------------
--  Una factura es un documento que agrupa varios items
--  (mensualidad + suplemento, por ejemplo).

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,         -- ej: "FAC-2026-0001"
  member_id       uuid not null references public.profiles (id) on delete restrict,
  status          public.invoice_status not null default 'open',
  issued_at       date not null default current_date,
  due_at          date not null,
  paid_at         timestamptz,
  currency        public.currency_code not null default 'NIO',
  subtotal        numeric(12, 2) not null default 0,
  discount        numeric(12, 2) not null default 0,
  total           numeric(12, 2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists invoices_member_idx
  on public.invoices (member_id, issued_at desc);
create index if not exists invoices_status_idx
  on public.invoices (status, due_at);

-- Ahora sí, la FK pendiente
alter table public.transactions
  add constraint transactions_invoice_fkey
  foreign key (invoice_id) references public.invoices (id) on delete set null
  not valid;

alter table public.transactions validate constraint transactions_invoice_fkey;


-- ------------------------------------------------------------
--  8. RENGLONES DE FACTURA
-- ------------------------------------------------------------

create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity    numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price  numeric(12, 2) not null check (unit_price >= 0),
  total       numeric(12, 2) not null,           -- quantity * unit_price
  sort_order  integer not null default 0
);

create index if not exists invoice_items_invoice_idx
  on public.invoice_items (invoice_id, sort_order);


-- ------------------------------------------------------------
--  9. SALDOS POR SOCIO
-- ------------------------------------------------------------
--  Se actualiza por trigger cuando entra un pago o se emite
--  una factura. Es lo que muestra "saldo a favor" en la ficha.

create table if not exists public.member_balances (
  member_id      uuid primary key references public.profiles (id) on delete cascade,
  balance_nio    numeric(12, 2) not null default 0,    -- + a favor del socio, - deuda
  last_movement  timestamptz,
  updated_at     timestamptz not null default now()
);


-- ------------------------------------------------------------
--  10. APERTURA / CIERRE DE CAJA
-- ------------------------------------------------------------

create table if not exists public.cash_registers (
  id              uuid primary key default gen_random_uuid(),
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  opened_by       uuid references public.profiles (id),
  closed_by       uuid references public.profiles (id),
  opening_amount  numeric(12, 2) not null default 0,    -- efectivo inicial
  closing_amount  numeric(12, 2),                       -- efectivo contado al cierre
  expected_amount numeric(12, 2),                       -- lo que debería haber (suma de tx)
  difference      numeric(12, 2),                       -- expected - closing
  notes           text
);

create index if not exists cash_registers_opened_idx
  on public.cash_registers (opened_at desc);


-- ============================================================
--  11. TRIGGERS DE ACTUALIZACIÓN DE SALDO
-- ============================================================
--  Cada ingreso pago reduce la deuda (sube el balance).
--  Cada factura emitida la aumenta (baja el balance).

create or replace function public.update_member_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.member_id is null then
    return new;
  end if;

  insert into public.member_balances (member_id, balance_nio, last_movement)
  values (new.member_id, 0, now())
  on conflict (member_id) do nothing;

  -- Un ingreso mejora el balance (sube); un egreso lo baja.
  -- En la vida real, los gastos casi nunca son "del socio", pero
  -- dejamos el cálculo igual para que el panel pueda mostrar
  -- movimientos por socio si los hay (reembolsos, etc).
  if new.direction = 'income' and new.status = 'completed' then
    update public.member_balances
       set balance_nio = balance_nio + new.base_amount,
           last_movement = new.occurred_at,
           updated_at = now()
     where member_id = new.member_id;
  elsif new.direction = 'expense' and new.status = 'completed' then
    update public.member_balances
       set balance_nio = balance_nio - new.base_amount,
           last_movement = new.occurred_at,
           updated_at = now()
     where member_id = new.member_id;
  end if;

  -- Si la tx está atada a una factura, marcamos la factura como pagada.
  if new.direction = 'income' and new.invoice_id is not null and new.status = 'completed' then
    update public.invoices
       set status = 'paid',
           paid_at = coalesce(paid_at, new.occurred_at)
     where id = new.invoice_id
       and status in ('open', 'overdue');
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_update_balance on public.transactions;
create trigger transactions_update_balance
  after insert or update on public.transactions
  for each row execute function public.update_member_balance();


-- ============================================================
--  12. RECALCULAR TOTALES DE FACTURA
-- ============================================================

create or replace function public.recalc_invoice_totals()
returns trigger
language plpgsql
as $$
declare
  v_subtotal numeric(12, 2);
  v_total    numeric(12, 2);
begin
  select coalesce(sum(total), 0) into v_subtotal
  from public.invoice_items
  where invoice_id = coalesce(new.invoice_id, old.invoice_id);

  select subtotal, discount into v_subtotal, v_total
  from public.invoices
  where id = coalesce(new.invoice_id, old.invoice_id);

  v_total := v_subtotal - coalesce(v_total, 0);

  update public.invoices
     set subtotal = v_subtotal,
         total    = v_total
   where id = coalesce(new.invoice_id, old.invoice_id);

  return new;
end;
$$;

drop trigger if exists invoice_items_recalc on public.invoice_items;
create trigger invoice_items_recalc
  after insert or update or delete on public.invoice_items
  for each row execute function public.recalc_invoice_totals();


-- ============================================================
--  13. VISTAS PARA EL PANEL
-- ============================================================

-- 13.1 — Caja del día
create or replace view public.v_daily_cash as
  select
    date_trunc('day', occurred_at) as day,
    sum(case when direction = 'income'  and status = 'completed' then base_amount else 0 end) as income_nio,
    sum(case when direction = 'expense' and status = 'completed' then base_amount else 0 end) as expense_nio,
    sum(case when direction = 'income'  and status = 'completed' then base_amount
             when direction = 'expense' and status = 'completed' then -base_amount
             else 0 end) as net_nio,
    count(*) filter (where status = 'completed') as tx_count
  from public.transactions
  group by 1
  order by 1 desc;

-- 13.2 — Cuentas por cobrar (facturas abiertas, agrupadas por socio)
create or replace view public.v_accounts_receivable as
  select
    i.member_id,
    p.full_name,
    p.email,
    p.phone,
    count(*)                                as invoices_open,
    sum(i.total)                            as total_owed_nio,
    min(i.due_at)                           as oldest_due,
    max(
      case
        when current_date > i.due_at then (current_date - i.due_at)::int
        else 0
      end
    )                                       as days_overdue
  from public.invoices i
  join public.profiles  p on p.id = i.member_id
  where i.status in ('open', 'overdue')
  group by i.member_id, p.full_name, p.email, p.phone
  order by days_overdue desc nulls last, total_owed_nio desc;

-- 13.3 — P&L mensual
create or replace view public.v_monthly_pnl as
  select
    date_trunc('month', occurred_at) as month,
    sum(case when direction = 'income'  and status = 'completed' then base_amount else 0 end) as income_nio,
    sum(case when direction = 'expense' and status = 'completed' then base_amount else 0 end) as expense_nio,
    sum(case when direction = 'income'  and status = 'completed' then base_amount
             when direction = 'expense' and status = 'completed' then -base_amount
             else 0 end) as net_nio
  from public.transactions
  group by 1
  order by 1 desc;

-- 13.4 — Desglose por método de pago
create or replace view public.v_payment_methods_breakdown as
  select
    t.payment_method_id,
    pm.name_es,
    pm.icon,
    count(*)                                 as tx_count,
    sum(t.base_amount)                       as total_nio,
    sum(case when t.direction = 'income' then t.base_amount else 0 end)  as income_nio,
    sum(case when t.direction = 'expense' then t.base_amount else 0 end) as expense_nio
  from public.transactions t
  left join public.payment_methods pm on pm.id = t.payment_method_id
  where t.status = 'completed'
  group by t.payment_method_id, pm.name_es, pm.icon
  order by total_nio desc;

-- 13.5 — Resumen del estado de cuenta de un socio
create or replace view public.v_member_account as
  select
    p.id                                      as member_id,
    p.full_name,
    p.email,
    p.status,
    coalesce(mb.balance_nio, 0)               as balance_nio,
    coalesce(open_inv.open_count, 0)          as open_invoices,
    coalesce(open_inv.open_total, 0)          as open_total_nio,
    coalesce(tx.last_payment, '1970-01-01'::timestamptz) as last_payment_at
  from public.profiles p
  left join public.member_balances mb on mb.member_id = p.id
  left join (
    select member_id, count(*) as open_count, sum(total) as open_total
    from public.invoices
    where status in ('open', 'overdue')
    group by member_id
  ) open_inv on open_inv.member_id = p.id
  left join (
    select member_id, max(occurred_at) as last_payment
    from public.transactions
    where direction = 'income' and status = 'completed'
    group by member_id
  ) tx on tx.member_id = p.id
  where p.role in ('member', 'staff');


-- ============================================================
--  14. NÚMEROS DE FACTURA AUTOMÁTICOS
-- ============================================================
--  FAC-2026-0001, FAC-2026-0002, etc.

create or replace function public.next_invoice_number()
returns text
language plpgsql
as $$
declare
  v_year text := extract(year from current_date)::text;
  v_next integer;
begin
  select coalesce(max(
    nullif(regexp_replace(number, '[^0-9]', '', 'g'), '')::integer
  ), 0) + 1
  into v_next
  from public.invoices
  where number like 'FAC-' || v_year || '-%';

  return 'FAC-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;


-- ============================================================
--  15. RLS
-- ============================================================
--  Admin y staff ven todo. Socios solo ven lo propio.

alter table public.payment_methods    enable row level security;
alter table public.expense_categories enable row level security;
alter table public.accounts           enable row level security;
alter table public.transactions       enable row level security;
alter table public.invoices           enable row level security;
alter table public.invoice_items      enable row level security;
alter table public.member_balances    enable row level security;
alter table public.cash_registers     enable row level security;

-- Helper: ¿es admin o staff?
create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  );
$$;

-- payment_methods: visible para todos (la landing puede listarlos),
-- modificable solo por staff.
drop policy if exists pm_select_all on public.payment_methods;
create policy pm_select_all on public.payment_methods
  for select using (true);

drop policy if exists pm_modify_staff on public.payment_methods;
create policy pm_modify_staff on public.payment_methods
  for all using (public.is_staff()) with check (public.is_staff());

-- expense_categories: idem.
drop policy if exists ec_select_all on public.expense_categories;
create policy ec_select_all on public.expense_categories
  for select using (true);
drop policy if exists ec_modify_staff on public.expense_categories;
create policy ec_modify_staff on public.expense_categories
  for all using (public.is_staff()) with check (public.is_staff());

-- accounts: solo staff.
drop policy if exists accounts_staff on public.accounts;
create policy accounts_staff on public.accounts
  for all using (public.is_staff()) with check (public.is_staff());

-- transactions: staff ve todo; socio ve solo las suyas.
drop policy if exists tx_staff_all on public.transactions;
create policy tx_staff_all on public.transactions
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists tx_member_own on public.transactions;
create policy tx_member_own on public.transactions
  for select using (member_id = auth.uid());

-- invoices: staff ve todo; socio ve solo las suyas.
drop policy if exists inv_staff_all on public.invoices;
create policy inv_staff_all on public.invoices
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists inv_member_own on public.invoices;
create policy inv_member_own on public.invoices
  for select using (member_id = auth.uid());

drop policy if exists items_staff_all on public.invoice_items;
create policy items_staff_all on public.invoice_items
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists items_member_own on public.invoice_items;
create policy items_member_own on public.invoice_items
  for select using (
    exists(select 1 from public.invoices i
           where i.id = invoice_id and i.member_id = auth.uid())
  );

-- member_balances: staff + el socio dueño.
drop policy if exists bal_staff_all on public.member_balances;
create policy bal_staff_all on public.member_balances
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists bal_self on public.member_balances;
create policy bal_self on public.member_balances
  for select using (member_id = auth.uid());

-- cash_registers: solo staff.
drop policy if exists cr_staff on public.cash_registers;
create policy cr_staff on public.cash_registers
  for all using (public.is_staff()) with check (public.is_staff());

-- Vistas: por defecto se evalúan con RLS del usuario.
-- Para que el panel funcione, el admin/staff ya pasa is_staff().
grant select on public.v_daily_cash,
                public.v_accounts_receivable,
                public.v_monthly_pnl,
                public.v_payment_methods_breakdown,
                public.v_member_account
  to anon, authenticated;


-- ============================================================
--  16. FUNCIÓN PARA EL PANEL: REGISTRAR UN PAGO
-- ============================================================
--  Usa la API desde el panel: registra un pago, crea la tx,
--  y opcionalmente paga una factura.

create or replace function public.record_payment(
  p_member_id          uuid,
  p_amount             numeric,
  p_currency           public.currency_code,
  p_payment_method_id  text,
  p_concept            text,
  p_invoice_id         uuid default null,
  p_account_id         text default null,
  p_fx_rate            numeric default 1.0,
  p_notes              text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_uid uuid := auth.uid();
  v_base numeric := round(p_amount * p_fx_rate, 2);
begin
  if not public.is_staff() then
    raise exception 'AUTH: solo el staff puede registrar pagos';
  end if;

  insert into public.transactions
    (direction, status, amount, currency, fx_rate, base_amount,
     payment_method_id, account_id, member_id, invoice_id,
     concept, notes, created_by)
  values
    ('income', 'completed', p_amount, p_currency, p_fx_rate, v_base,
     p_payment_method_id, p_account_id, p_member_id, p_invoice_id,
     p_concept, p_notes, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_payment to authenticated;


-- ============================================================
--  Strong Fitness Gym — FASE 1: Datos de ejemplo (seed)
-- ============================================================
--  Genera 40 socios ficticios con nombres nicaragüenses, 3 coaches,
--  los métodos de pago que el gimnasio acepta (efectivo, transferencia,
--  tarjeta, SINPE Móvil y billetera móvil), las cuentas del gimnasio,
--  categorías de gastos, planes y 60+ transacciones del mes en curso
--  para que el panel se vea con vida desde el primer login.
--
--  Es SEGURO correrlo varias veces: usa ON CONFLICT e ids estables.
--
--  TIPO DE CAMBIO (configurable): 1 USD = 36.5 NIO (Banco Central de
--  Nicaragua, precio de venta aprox. a 2026). Si cambia, actualizá el
--  valor abajo y se recalcula todo.
-- ============================================================


-- ------------------------------------------------------------
--  0. TIPO DE CAMBIO
-- ------------------------------------------------------------
--  Si tu contador te pasa un valor distinto, cambialo acá y se
--  recalculan las conversiones en las transacciones existentes.
do $$
declare
  v_fx numeric(12,4) := 36.50;  -- 1 USD = 36.50 NIO
begin
  perform set_config('app.fx_nio_per_usd', v_fx::text, false);
end $$;


-- ------------------------------------------------------------
--  1. MÉTODOS DE PAGO
-- ------------------------------------------------------------

insert into public.payment_methods
  (id, slug, kind, name_es, name_en, details_es, details_en,
   accepts_nio, accepts_usd, icon, sort_order)
values
  ('pm_cash_nio',  'efectivo-cordobas', 'cash',          'Efectivo (C$)',       'Cash (NIO)',
   'Pago en efectivo en la recepción, en córdobas.',
   'Cash payment at the front desk, in córdobas.',
   true,  false, 'Banknote', 1),

  ('pm_cash_usd',  'efectivo-dolares', 'cash',          'Efectivo (US$)',      'Cash (USD)',
   'Pago en efectivo en la recepción, en dólares.',
   'Cash payment at the front desk, in US dollars.',
   false, true,  'DollarSign', 2),

  ('pm_bac_nio',   'transferencia-bac', 'bank_transfer', 'Transferencia BAC NIO','Bank transfer (BAC, NIO)',
   'Banco BAC · Cuenta C$ 123-456789 · Titular: Strong Fitness Gym S.A.',
   'BAC Bank · Account NIO 123-456789 · Account holder: Strong Fitness Gym S.A.',
   true,  false, 'Building2', 3),

  ('pm_bac_usd',   'transferencia-bac-usd', 'bank_transfer', 'Transferencia BAC USD','Bank transfer (BAC, USD)',
   'Banco BAC · Cuenta US$ 987-654321 · Titular: Strong Fitness Gym S.A.',
   'BAC Bank · Account USD 987-654321 · Account holder: Strong Fitness Gym S.A.',
   false, true,  'Building2', 4),

  ('pm_lafi_nio',  'transferencia-lafise', 'bank_transfer', 'Transferencia LAFISE', 'Bank transfer (LAFISE)',
   'Banco LAFISE · Cuenta C$ 555-444-333',
   'LAFISE Bank · Account NIO 555-444-333',
   true,  false, 'Building2', 5),

  ('pm_card_local','tarjeta-pos', 'debit_card',   'Tarjeta POS',          'Card (POS)',
   'Débito y crédito Visa / MasterCard en la terminal del local.',
   'Debit and credit Visa / MasterCard at the in-store terminal.',
   true,  true,  'CreditCard', 6),

  ('pm_sinpe',     'sinpe-movil',  'sinpe_movil',   'SINPE Móvil',          'SINPE Móvil',
   'Transferencia inmediata desde cualquier banco al 8888-1234.',
   'Instant transfer from any bank to 8888-1234.',
   true,  false, 'Smartphone', 7),

  ('pm_tigo_money','tigo-money',   'mobile_wallet', 'Tigo Money',           'Tigo Money',
   'Billetera móvil Tigo. Número 8500-1234. Comisión: 2%.',
   'Tigo mobile wallet. Number 8500-1234. 2% fee.',
   true,  false, 'Wallet', 8),

  ('pm_claro_pay', 'claro-pay',    'mobile_wallet', 'Claro Pay',            'Claro Pay',
   'Billetera móvil Claro. Número 8500-5678. Comisión: 2%.',
   'Claro mobile wallet. Number 8500-5678. 2% fee.',
   true,  false, 'Wallet', 9),

  ('pm_crypto',    'cripto-usdt',  'crypto',        'Cripto (USDT)',        'Crypto (USDT)',
   'USDT en red TRC-20 a la wallet TQrX9wK... (consultar al admin).',
   'USDT on TRC-20 network to wallet TQrX9wK... (ask the admin).',
   false, true,  'Bitcoin', 10)
on conflict (id) do update set
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  details_es = excluded.details_es,
  details_en = excluded.details_en,
  icon = excluded.icon,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  2. CATEGORÍAS DE GASTOS
-- ------------------------------------------------------------

insert into public.expense_categories (id, slug, name_es, name_en, icon, sort_order) values
  ('exp_rent',       'alquiler',     'Alquiler del local',  'Rent',              'Home',          1),
  ('exp_electricity','luz',          'Servicio eléctrico',  'Electricity',       'Zap',           2),
  ('exp_water',      'agua',         'Agua potable',        'Water',             'Droplet',       3),
  ('exp_internet',   'internet',     'Internet y cable',    'Internet & cable',  'Wifi',          4),
  ('exp_coaches',    'sueldos-coaches', 'Sueldos de coaches','Coaches payroll',  'Users',         5),
  ('exp_cleaning',   'limpieza',     'Artículos de limpieza','Cleaning supplies','Sparkles',      6),
  ('exp_equipment',  'mantenimiento','Mantenimiento equipos','Equipment maintenance','Wrench',    7),
  ('exp_supplements','compra-suplementos','Compra de suplementos','Supplements restock','Package',8),
  ('exp_marketing',  'marketing',    'Marketing y redes',   'Marketing & social','Megaphone',     9),
  ('exp_tax',        'impuestos',    'Impuestos y tasas',   'Taxes & fees',      'FileText',      10),
  ('exp_misc',       'varios',       'Otros gastos',        'Other expenses',    'Receipt',       99)
on conflict (id) do update set
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  icon = excluded.icon,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  3. CUENTAS DEL GIMNASIO
-- ------------------------------------------------------------

insert into public.accounts (id, slug, name, kind, currency, bank_name, account_number, holder_name) values
  ('acc_cash_nio', 'caja-fuerte-cordobas', 'Caja fuerte (C$)',    'cash',   'NIO', null,      null,        'Strong Fitness Gym'),
  ('acc_cash_usd', 'caja-fuerte-dolares',  'Caja fuerte (US$)',   'cash',   'USD', null,      null,        'Strong Fitness Gym'),
  ('acc_bac_nio',  'bac-cordobas',         'BAC Córdobas',        'bank',   'NIO', 'BAC',     '123-456789','Strong Fitness Gym S.A.'),
  ('acc_bac_usd',  'bac-dolares',          'BAC Dólares',         'bank',   'USD', 'BAC',     '987-654321','Strong Fitness Gym S.A.'),
  ('acc_tigo',     'tigo-money',           'Tigo Money',          'wallet', 'NIO', 'Tigo',    '8500-1234', 'Strong Fitness Gym')
on conflict (id) do update set
  name = excluded.name,
  account_number = excluded.account_number;


-- ------------------------------------------------------------
--  4. COACHES (3 con datos de ejemplo)
-- ------------------------------------------------------------

insert into public.coaches
  (id, slug, name, role_es, role_en, bio_es, bio_en, specialties, initials, color, sort_order, is_active)
values
  ('coa_dg',  'douglas',  'Douglas Hernández', 'Head Coach', 'Head Coach',
   '10 años entrenando boxeo y pesas. Excampeón nacional amateur.',
   '10 years coaching boxing and weights. Former national amateur champion.',
   array['boxeo', 'musculacion', 'funcional'], 'DH', '#d81a22', 1, true),

  ('coa_mr',  'maria',    'María Rodríguez',   'Coordinadora de Bailoterapia', 'Zumba Coordinator',
   'Instructora certificada de Zumba y bailoterapia. 6 años de experiencia.',
   'Certified Zumba and dance fitness instructor. 6 years of experience.',
   array['zumba', 'bailoterapia', 'stretching'], 'MR', '#0c0c0e', 2, true),

  ('coa_jl',  'jose',     'José Luis Pérez',   'Coach de Pesas', 'Weights Coach',
   'Especialista en hipertrofia y fuerza. Certificación NSCA-CPT.',
   'Hypertrophy and strength specialist. NSCA-CPT certified.',
   array['musculacion', 'fuerza', 'powerlifting'], 'JL', '#9a9a9a', 3, true)
on conflict (id) do update set
  name = excluded.name,
  role_es = excluded.role_es,
  role_en = excluded.role_en,
  bio_es = excluded.bio_es,
  bio_en = excluded.bio_en,
  specialties = excluded.specialties,
  initials = excluded.initials,
  color = excluded.color;


-- ============================================================
--  5. SOCIOS DE EJEMPLO (FASE 1: solo se insertan al registrar)
-- ============================================================
--  Importante: en producción los socios se crean desde el sitio
--  (Supabase Auth crea el usuario y un trigger copia los datos a
--  profiles). Los 40 socios de ejemplo del panel demo se generan
--  en TypeScript (src/lib/data/seed/demo-finance.ts) y viven en
--  localStorage, no en Supabase.
--
--  Esto evita romper la FK profiles.id → auth.users.id cuando
--  el seed se corre en un Postgres sin Auth.
-- ============================================================


-- ============================================================
--  6. TRANSACCIONES DE EJEMPLO (sin member_id, solo gastos fijos)
-- ============================================================
--  Para que la caja del panel se vea con vida apenas se conecte a
--  Supabase, dejamos cargados los gastos fijos del mes en curso
--  (alquiler, luz, agua, internet, sueldos, etc). Los ingresos
--  se generan cuando el admin cobra una mensualidad desde el panel.
--
--  Si más adelante se quieren ingresos también de seed, agregar
--  member_id pero SOLO después de crear esos usuarios en auth.users.

do $$
declare
  v_fx      constant numeric := 36.50;
begin
  -- Limpia transacciones generadas por este seed (idempotencia)
  delete from public.transactions where concept like '[SEED-GASTO]%';

  -- GASTOS FIJOS DEL MES
  insert into public.transactions (occurred_at, direction, status, amount, currency, fx_rate, base_amount, payment_method_id, account_id, expense_category_id, concept, created_by)
  values
    (current_date - interval '28 days', 'expense', 'completed', 25000, 'NIO', v_fx, 25000, 'pm_bac_nio', 'acc_bac_nio', 'exp_rent',       '[SEED-GASTO] Alquiler del local', null),
    (current_date - interval '20 days', 'expense', 'completed', 4500,  'NIO', v_fx, 4500,  'pm_bac_nio', 'acc_bac_nio', 'exp_electricity','[SEED-GASTO] Factura de luz (oct)', null),
    (current_date - interval '18 days', 'expense', 'completed', 850,   'NIO', v_fx, 850,   'pm_cash_nio','acc_cash_nio','exp_water',      '[SEED-GASTO] Factura de agua', null),
    (current_date - interval '15 days', 'expense', 'completed', 2200,  'NIO', v_fx, 2200,  'pm_bac_nio', 'acc_bac_nio', 'exp_internet',   '[SEED-GASTO] Internet + cable', null),
    (current_date - interval '30 days', 'expense', 'completed', 18000, 'NIO', v_fx, 18000, 'pm_cash_nio','acc_cash_nio','exp_coaches',    '[SEED-GASTO] Sueldo Douglas (medio mes)', null),
    (current_date - interval '14 days', 'expense', 'completed', 16000, 'NIO', v_fx, 16000, 'pm_cash_nio','acc_cash_nio','exp_coaches',    '[SEED-GASTO] Sueldo María', null),
    (current_date - interval '14 days', 'expense', 'completed', 15000, 'NIO', v_fx, 15000, 'pm_cash_nio','acc_cash_nio','exp_coaches',    '[SEED-GASTO] Sueldo José Luis', null),
    (current_date - interval '10 days', 'expense', 'completed', 1200,  'NIO', v_fx, 1200,  'pm_cash_nio','acc_cash_nio','exp_cleaning',   '[SEED-GASTO] Artículos de limpieza', null),
    (current_date - interval '6 days',  'expense', 'completed', 3500,  'NIO', v_fx, 3500,  'pm_bac_nio', 'acc_bac_nio', 'exp_equipment',  '[SEED-GASTO] Mantenimiento caminadora', null),
    (current_date - interval '4 days',  'expense', 'completed', 28000, 'NIO', v_fx, 28000, 'pm_bac_nio', 'acc_bac_nio', 'exp_supplements','[SEED-GASTO] Restock de suplementos', null),
    (current_date - interval '3 days',  'expense', 'completed', 1500,  'NIO', v_fx, 1500,  'pm_cash_nio','acc_cash_nio','exp_marketing',  '[SEED-GASTO] Publicidad en Facebook', null),
    (current_date - interval '2 days',  'expense', 'completed', 3200,  'NIO', v_fx, 3200,  'pm_bac_nio', 'acc_bac_nio', 'exp_tax',        '[SEED-GASTO] Pago de tasa municipal', null),
    (current_date - interval '1 day',   'expense', 'completed', 850,   'NIO', v_fx, 850,   'pm_cash_nio','acc_cash_nio','exp_misc',       '[SEED-GASTO] Botiquín e insumos', null);
end $$;


-- ------------------------------------------------------------
--  8. APERTURA DE CAJA INICIAL
-- ------------------------------------------------------------
--  Caja abierta hoy. El admin la cierra al final del día desde el panel.

insert into public.cash_registers (opened_at, opening_amount, notes)
values (current_date, 5000, 'Apertura inicial con C$ 5,000 en caja')
on conflict do nothing;


-- ============================================================
--  FIN DEL SEED
-- ============================================================
--  Resumen:
--    · 10 métodos de pago (efectivo C$ y US$, transferencias BAC y
--      LAFISE, tarjeta POS, SINPE Móvil, Tigo Money, Claro Pay y
--      cripto USDT). La idea es mostrar todas las opciones que
--      un gimnasio en Nicaragua puede aceptar.
--    · 11 categorías de gastos.
--    · 5 cuentas (caja fuerte C$ + US$, BAC C$ + US$, Tigo Money).
--    · 3 coaches.
--    · 13 gastos fijos del mes (alquiler, luz, agua, internet,
--      sueldos, limpieza, mantenimiento, restock suplementos,
--      marketing, impuestos, etc).
--    · Caja abierta con C$ 5,000.
--
--  Los 40 socios de ejemplo y los ingresos del mes se generan en
--  TypeScript (modo demo, localStorage) y/o en producción cuando
--  el admin carga un pago desde el panel.
-- ============================================================


-- Corrección de lectura del perfil propio (00012_profiles_self_read.sql)
-- ============================================================
-- Strong Gym: permitir la lectura del perfil propio con RLS.
-- ============================================================
-- Ejecutar en el SQL Editor del proyecto que usa el sitio.
-- Caso observado: profiles.role = admin como dueño, pero el usuario
-- authenticated no ve su propia fila aunque is_staff() = true.
--
-- Sólo agrega SELECT de la fila propia para authenticated. No cambia
-- roles, datos, grants, funciones ni políticas ajenas, y no desactiva RLS.
-- No permite leer perfiles ajenos ni escribir en profiles.
-- Es idempotente y puede aplicarse sin merge ni redeploy del frontend.
-- Si hay políticas AS RESTRICTIVE que bloquean SELECT, éstas siguen
-- vigentes: revisar pg_policies, no borrarlas ni desactivar RLS a ciegas.

begin;

drop policy if exists profiles_select_own_authenticated on public.profiles;
create policy profiles_select_own_authenticated
  on public.profiles
  as permissive
  for select
  to authenticated
  using (id = (select auth.uid()));

commit;


-- FASE 2: CLIENTES Y RECEPCIÓN (sin seed opcional)
-- FASE 2: CRM de clientes + recepción manual/QR. Aplicar después de 00012.
-- profiles sigue siendo la tabla de identidades/login. gym_clients es una
-- ficha comercial independiente: NO exige teléfono, email ni cuenta web.
-- Etiquetas manuales, no precios ni promociones automáticas.
begin;

create or replace function public.crm_is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','staff')); $$;
revoke all on function public.crm_is_staff() from public;
grant execute on function public.crm_is_staff() to authenticated;

create table if not exists public.gym_clients (
  id uuid primary key default gen_random_uuid(),
  client_number bigint generated always as identity unique,
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  birthdate date,
  address text check (length(address)<=200),
  emergency_contact_name text check (length(emergency_contact_name)<=120),
  emergency_contact_phone text check (length(emergency_contact_phone)<=40),
  medical_notes text check (length(medical_notes)<=500),
  phone text check (length(phone) <= 40),
  email text check (length(email) <= 120),
  category text not null default 'client' check (category in ('client','friend','family')),
  status text not null default 'active' check (status in ('active','frozen','cancelled')),
  plan_id text references public.plans(id) on delete set null,
  notes text not null default '' check (length(notes) <= 2000),
  joined_on date not null default (now() at time zone 'America/Managua')::date,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gym_clients_name_idx on public.gym_clients(lower(full_name));
create table if not exists public.client_cards (
  client_id uuid primary key references public.gym_clients(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
create table if not exists public.client_visits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.gym_clients(id) on delete cascade,
  visited_at timestamptz not null default now(),
  local_day date not null default (now() at time zone 'America/Managua')::date,
  source text not null check (source in ('manual','qr')),
  recorded_by uuid references public.profiles(id) on delete set null,
  unique(client_id, local_day)
);
create index if not exists client_visits_day_idx on public.client_visits(local_day desc);
create table if not exists public.client_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.gym_clients(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.transactions add column if not exists client_id uuid references public.gym_clients(id) on delete restrict;
alter table public.transactions add column if not exists crm_request_id uuid unique;
create index if not exists transactions_client_idx on public.transactions(client_id, occurred_at desc);

-- No escritura directa: las funciones verifican permisos, validan y auditan.
alter table public.gym_clients enable row level security;
alter table public.client_cards enable row level security;
alter table public.client_visits enable row level security;
alter table public.client_events enable row level security;
revoke all on public.gym_clients, public.client_cards, public.client_visits, public.client_events from anon, authenticated;
grant select on public.gym_clients, public.client_visits, public.client_events to authenticated;
drop policy if exists crm_clients_read on public.gym_clients;
create policy crm_clients_read on public.gym_clients for select to authenticated using (public.crm_is_staff());
drop policy if exists crm_visits_read on public.client_visits;
create policy crm_visits_read on public.client_visits for select to authenticated using (public.crm_is_staff());
drop policy if exists crm_events_read on public.client_events;
create policy crm_events_read on public.client_events for select to authenticated using (public.crm_is_staff());

create or replace function public.crm_create_client(p_name text, p_phone text default null, p_email text default null, p_plan text default null, p_duplicate_confirmed boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_email is not null and trim(p_email) <> '' and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL'; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_name)),0));
  if not coalesce(p_duplicate_confirmed,false) and exists(select 1 from public.gym_clients where
    (lower(full_name)=lower(trim(p_name)) and coalesce(phone,'')=coalesce(nullif(trim(p_phone),''),''))
    or (nullif(trim(p_email),'') is not null and email=lower(trim(p_email)))) then raise exception 'DUPLICATE_CLIENT'; end if;
  insert into public.gym_clients(full_name, phone, email, plan_id, created_by)
    values(trim(p_name), nullif(trim(p_phone),''), nullif(lower(trim(p_email)),''), nullif(p_plan,''), auth.uid()) returning id into v_id;
  insert into public.client_cards(client_id) values(v_id);
  insert into public.client_events(client_id, action, actor_id) values(v_id,'created',auth.uid());
  return v_id;
end $$;

create or replace function public.crm_update_client(p_id uuid, p_name text, p_phone text, p_email text, p_category text, p_status text, p_plan text, p_notes text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare old_row public.gym_clients; v_admin boolean;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select * into old_row from public.gym_clients where id=p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select role='admin' into v_admin from public.profiles where id=auth.uid();
  if p_category <> old_row.category and not coalesce(v_admin,false) then raise exception 'ADMIN_ONLY'; end if;
  if p_email is not null and trim(p_email) <> '' and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL'; end if;
  update public.gym_clients set full_name=trim(p_name),phone=nullif(trim(p_phone),''),email=nullif(lower(trim(p_email)),''),
    category=p_category,status=p_status,plan_id=nullif(p_plan,''),notes=coalesce(p_notes,''),updated_at=now() where id=p_id;
  insert into public.client_events(client_id,action,details,actor_id) values(p_id,'updated',
    jsonb_build_object('category_before',old_row.category,'category_after',p_category,'status_before',old_row.status,'status_after',p_status),auth.uid());
end $$;

create or replace function public.crm_get_card(p_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token uuid;
begin
  if not public.crm_is_staff() and not exists(select 1 from public.gym_clients where id=p_id and profile_id=auth.uid()) then raise exception 'AUTH'; end if;
  if not exists(select 1 from public.gym_clients where id=p_id) then raise exception 'NOT_FOUND'; end if;
  insert into public.client_cards(client_id) values(p_id) on conflict(client_id) do nothing;
  select token into v_token from public.client_cards where client_id=p_id;
  return v_token;
end $$;
create or replace function public.crm_rotate_card(p_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token uuid;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if not exists(select 1 from public.gym_clients where id=p_id) then raise exception 'NOT_FOUND'; end if;
  insert into public.client_cards(client_id) values(p_id) on conflict(client_id) do update set token=gen_random_uuid(),updated_at=now() returning token into v_token;
  insert into public.client_events(client_id,action,actor_id) values(p_id,'card_reset',auth.uid());
  return v_token;
end $$;
create or replace function public.crm_find_card(p_token uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select client_id into v_id from public.client_cards where token=p_token;
  if v_id is null then raise exception 'INVALID_CARD'; end if;
  return v_id;
end $$;

create or replace function public.crm_check_in(p_id uuid, p_source text, p_token uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_visit uuid; v_existing uuid; v_status text;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select status into v_status from public.gym_clients where id=p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status <> 'active' then raise exception 'INACTIVE'; end if;
  if p_source not in ('manual','qr') or p_source is null then raise exception 'INVALID_SOURCE'; end if;
  if p_source='qr' and not exists(select 1 from public.client_cards where client_id=p_id and token=p_token) then raise exception 'INVALID_CARD'; end if;
  insert into public.client_visits(client_id,source,recorded_by) values(p_id,p_source,auth.uid())
    on conflict(client_id,local_day) do nothing returning id into v_visit;
  if v_visit is null then
    select id into v_existing from public.client_visits where client_id=p_id and local_day=(now() at time zone 'America/Managua')::date;
    return jsonb_build_object('id',v_existing,'already',true);
  end if;
  return jsonb_build_object('id',v_visit,'already',false);
end $$;

-- Cobro confirmado, separado del escaneo y de la asistencia. Sin factura ni
-- descuento automático. Idempotencia: reintentar el MISMO request no duplica caja.
create or replace function public.crm_record_payment(p_id uuid, p_request uuid, p_amount numeric, p_currency text, p_method text, p_account text, p_concept text, p_fx numeric default 1)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_profile uuid; v_existing public.transactions;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into v_existing from public.transactions where crm_request_id=p_request;
  if found then
    if v_existing.client_id is distinct from p_id or v_existing.amount is distinct from p_amount
      or v_existing.currency::text is distinct from p_currency or v_existing.payment_method_id is distinct from p_method
      or v_existing.account_id is distinct from p_account or v_existing.concept is distinct from trim(p_concept)
      or v_existing.fx_rate is distinct from p_fx then raise exception 'REQUEST_CONFLICT'; end if;
    return v_existing.id;
  end if;
  if p_amount is null or p_amount<=0 or p_amount>99999999 or p_amount<>round(p_amount,2)
    or p_currency is null or p_currency not in ('NIO','USD') or p_fx is null or p_fx<=0 or p_fx>10000
    or p_fx<>round(p_fx,4) or round(p_amount*p_fx,2)>9999999999.99
    or (p_currency='NIO' and p_fx<>1) or p_concept is null or length(trim(p_concept)) not between 2 and 200 then raise exception 'INVALID_PAYMENT'; end if;
  select profile_id into v_profile from public.gym_clients where id=p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not exists(select 1 from public.payment_methods where id=p_method and is_active
    and ((p_currency='NIO' and accepts_nio) or (p_currency='USD' and accepts_usd))) then raise exception 'INVALID_METHOD'; end if;
  if not exists(select 1 from public.accounts where id=p_account and is_active and currency::text=p_currency) then raise exception 'INVALID_ACCOUNT'; end if;
  insert into public.transactions(direction,status,amount,currency,fx_rate,base_amount,payment_method_id,account_id,member_id,client_id,crm_request_id,concept,created_by)
    values('income','completed',p_amount,p_currency::public.currency_code,p_fx,round(p_amount*p_fx,2),p_method,p_account,v_profile,p_id,p_request,trim(p_concept),auth.uid()) returning id into v_id;
  insert into public.client_events(client_id,action,details,actor_id) values(p_id,'payment',jsonb_build_object('transaction_id',v_id),auth.uid());
  return v_id;
end $$;

-- Directorio paginado; filtros en servidor. No devuelve tokens QR.
create or replace function public.crm_directory(p_search text default '', p_category text default '', p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select jsonb_build_object('total',(select count(*) from public.gym_clients c where
    (p_category='' or c.category=p_category) and (p_search='' or c.full_name ilike '%'||p_search||'%' or coalesce(c.phone,'') ilike '%'||p_search||'%' or c.client_number::text=p_search)),
    'rows',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into result from (
    select c.*,p.name_es as plan_name,
      (select count(*)::int from public.client_visits v where v.client_id=c.id and v.local_day >= (now() at time zone 'America/Managua')::date-29) as visits_30,
      (select max(v.visited_at) from public.client_visits v where v.client_id=c.id) as last_visit
    from public.gym_clients c left join public.plans p on p.id=c.plan_id
    where (p_category='' or c.category=p_category) and (p_search='' or c.full_name ilike '%'||p_search||'%' or coalesce(c.phone,'') ilike '%'||p_search||'%' or c.client_number::text=p_search)
    order by c.full_name,c.id limit 30 offset greatest(0,least(coalesce(p_offset,0),1000000))
  ) r;
  return result;
end $$;
create or replace function public.crm_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_client public.gym_clients; v_result jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select * into v_client from public.gym_clients where id=p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select jsonb_build_object('client',to_jsonb(v_client),'card',public.crm_get_card(p_id),
    'visits',coalesce((select jsonb_agg(to_jsonb(v)) from (select * from public.client_visits where client_id=p_id order by visited_at desc limit 60)v),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.client_events where client_id=p_id order by created_at desc limit 40)e),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(t)) from (select id,occurred_at,concept,amount,currency,status from public.transactions where client_id=p_id or (v_client.profile_id is not null and member_id=v_client.profile_id) order by occurred_at desc limit 40)t),'[]'::jsonb),
    'balance',case when v_client.profile_id is null then null else (select balance_nio from public.member_balances where member_id=v_client.profile_id) end) into v_result;
  return v_result;
end $$;

-- Perfil web existente/nuevo: crea una ficha vinculada sin exigir login a
-- quienes se registran en recepción. Nunca vincular por simple coincidencia de email.
create or replace function public.crm_profile_created()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role='member' then
    insert into public.gym_clients(profile_id,full_name,phone,email,plan_id)
      values(new.id,coalesce(nullif(trim(new.full_name),''),'Cliente Strong'),new.phone,new.email,new.plan_id)
      on conflict(profile_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists crm_profile_created on public.profiles;
create trigger crm_profile_created after insert on public.profiles for each row execute function public.crm_profile_created();
insert into public.gym_clients(profile_id,full_name,phone,email,plan_id)
  select id,coalesce(nullif(trim(full_name),''),'Cliente Strong'),phone,email,plan_id from public.profiles where role='member'
  on conflict(profile_id) do nothing;
insert into public.client_cards(client_id) select id from public.gym_clients on conflict(client_id) do nothing;

create or replace function public.crm_my_pass()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.gym_clients;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select * into c from public.gym_clients where profile_id=auth.uid();
  if not found then return null; end if;
  return jsonb_build_object('name',c.full_name,'number',c.client_number,'token',public.crm_get_card(c.id));
end $$;

-- Importación sin auth.users ficticios; una fila por RPC, con deduplicación.
create or replace function public.crm_import_client(p_row jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_name text := trim(p_row->>'fullName'); v_email text := nullif(lower(trim(p_row->>'email')),''); v_phone text := nullif(trim(p_row->>'phone'),'');
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if v_name is null or length(v_name) not between 2 and 120 then raise exception 'INVALID_NAME'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_email,lower(v_name)||coalesce(v_phone,'')),0));
  select id into v_id from public.gym_clients where (v_email is not null and email=v_email)
    or (lower(full_name)=lower(v_name) and phone is not distinct from v_phone) order by created_at limit 1;
  if found then return jsonb_build_object('id',v_id,'imported',false); end if;
  v_id := public.crm_create_client(v_name,v_phone,v_email,p_row->>'planId');
  update public.gym_clients set status=coalesce(nullif(p_row->>'status',''),'active'),
    birthdate=nullif(p_row->>'birthdate','')::date,address=nullif(p_row->>'address',''),
    emergency_contact_name=nullif(p_row->>'emergencyContactName',''),emergency_contact_phone=nullif(p_row->>'emergencyContactPhone',''),
    medical_notes=nullif(p_row->>'medicalNotes','') where id=v_id;
  return jsonb_build_object('id',v_id,'imported',true);
end $$;
revoke all on function public.crm_import_client(jsonb) from public;
grant execute on function public.crm_import_client(jsonb) to authenticated;

-- Las funciones CRM dependen de roles reales. Impedir que un cliente cambie
-- su propio role mediante la antigua política de edición del perfil propio.
create or replace function public.crm_protect_profile_role()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null
    and not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'ADMIN_ONLY';
  end if;
  return new;
end $$;
revoke all on function public.crm_protect_profile_role() from public;
drop trigger if exists crm_protect_profile_role on public.profiles;
create trigger crm_protect_profile_role before update of role on public.profiles for each row execute function public.crm_protect_profile_role();

-- PostgreSQL concede EXECUTE a PUBLIC por defecto: revocación explícita.
revoke all on function public.crm_create_client(text,text,text,text,boolean), public.crm_update_client(uuid,text,text,text,text,text,text,text), public.crm_get_card(uuid), public.crm_rotate_card(uuid), public.crm_find_card(uuid), public.crm_check_in(uuid,text,uuid), public.crm_record_payment(uuid,uuid,numeric,text,text,text,text,numeric), public.crm_directory(text,text,integer), public.crm_detail(uuid), public.crm_my_pass(), public.crm_profile_created() from public;
grant execute on function public.crm_create_client(text,text,text,text,boolean), public.crm_update_client(uuid,text,text,text,text,text,text,text), public.crm_get_card(uuid), public.crm_rotate_card(uuid), public.crm_find_card(uuid), public.crm_check_in(uuid,text,uuid), public.crm_record_payment(uuid,uuid,numeric,text,text,text,text,numeric), public.crm_directory(text,text,integer), public.crm_detail(uuid), public.crm_my_pass() to authenticated;
commit;


-- COMPATIBILIDAD CRM: estructura del repositorio y bank_accounts/saldos separados.
-- Base existente: aplicar sólo este archivo, después de FASE 2. Hacer backup.
-- No crea cuentas/tablas financieras, no cambia RLS, no recalcula saldos ni carga ejemplos.
-- Sustituye crm_detail/cobro y agrega opciones con guard de staff.
-- En bank_accounts los cobros quedan BLOQUEADOS hasta revisar su escritor financiero.
begin;

-- Clasificación conservadora: no adivinar modelos parcialmente mezclados.
create or replace function public.crm_finance_layout()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  with expected(model, tab, cols) as (values
    ('repository', 'accounts', array['id','name','currency','is_active']),
    ('repository', 'payment_methods', array['id','name_es','accepts_nio','accepts_usd','is_active','sort_order']),
    ('repository', 'member_balances', array['member_id','balance_nio']),
    ('repository', 'transactions', array['direction','payment_method_id','fx_rate','base_amount']),
    ('bank_accounts_split', 'bank_accounts', array['id','name','currency','is_active','display_order']),
    ('bank_accounts_split', 'payment_methods', array['id','name','currency','is_active','display_order']),
    ('bank_accounts_split', 'member_balances', array['member_id','credit_nio','credit_usd','debt_nio','debt_usd']),
    ('bank_accounts_split', 'transactions', array['type','method_id','amount_nio','amount_usd','fx_used'])
  ), supported as (
    select model from expected e group by model
    having bool_and(not exists (
      select 1 from unnest(e.cols) required(col)
      where not exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid=to_regclass('public.' || e.tab)
          and a.attname=required.col and a.attnum>0 and not a.attisdropped
      )
    ))
  )
  select case when count(*)=1 then min(model) else 'unsupported' end from supported;
$$;
revoke all on function public.crm_finance_layout() from public, anon, authenticated;

create or replace function public.crm_options()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_layout text; v_methods jsonb; v_accounts jsonb; v_plans jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  v_layout := public.crm_finance_layout();
  if v_layout='unsupported' then raise exception 'FINANCE_SCHEMA_UNSUPPORTED'; end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by sort_order),'[]'::jsonb) into v_plans
    from (select id,name_es,sort_order from public.plans where is_active) p;
  if v_layout='repository' then
    select coalesce(jsonb_agg(to_jsonb(m) order by sort_order),'[]'::jsonb) into v_methods
      from (select id,name_es,accepts_nio,accepts_usd,sort_order from public.payment_methods where is_active) m;
    select coalesce(jsonb_agg(to_jsonb(a) order by name),'[]'::jsonb) into v_accounts
      from (select id,name,currency from public.accounts where is_active) a;
  else
    select coalesce(jsonb_agg(to_jsonb(m) order by display_order),'[]'::jsonb) into v_methods
      from (select id,name as name_es,currency in ('NIO','BOTH') as accepts_nio,
        currency in ('USD','BOTH') as accepts_usd,display_order from public.payment_methods where is_active) m;
    select coalesce(jsonb_agg(to_jsonb(a) order by display_order),'[]'::jsonb) into v_accounts
      from (select id,name,currency,display_order from public.bank_accounts where is_active) a;
  end if;
  return jsonb_build_object('plans',v_plans,'methods',v_methods,'accounts',v_accounts,
    'finance_layout',v_layout,'payments_enabled',v_layout='repository',
    'payment_block_reason',case when v_layout<>'repository' then
      'Cobros CRM pendientes de compatibilidad con esta Caja. No se guardará ningún cobro desde esta ficha; no lo repitas en otra pantalla sin revisar el historial.' else null end);
end $$;
revoke all on function public.crm_options() from public, anon, authenticated;
grant execute on function public.crm_options() to authenticated;

create or replace function public.crm_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_client public.gym_clients; v_layout text; v_balance numeric; v_balances jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select * into v_client from public.gym_clients where id=p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_layout := public.crm_finance_layout();
  if v_client.profile_id is not null then
    if v_layout='repository' then
      select balance_nio into v_balance from public.member_balances where member_id=v_client.profile_id;
    elsif v_layout='bank_accounts_split' then
      select jsonb_build_object('credit_nio',credit_nio,'credit_usd',credit_usd,'debt_nio',debt_nio,'debt_usd',debt_usd)
        into v_balances from public.member_balances where member_id=v_client.profile_id;
    end if;
  end if;
  return jsonb_build_object('client',to_jsonb(v_client),'card',public.crm_get_card(p_id),
    'visits',coalesce((select jsonb_agg(to_jsonb(v)) from (select * from public.client_visits where client_id=p_id order by visited_at desc limit 60)v),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.client_events where client_id=p_id order by created_at desc limit 40)e),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(t)) from (select id,occurred_at,concept,amount,currency,status from public.transactions where client_id=p_id or (v_client.profile_id is not null and member_id=v_client.profile_id) order by occurred_at desc limit 40)t),'[]'::jsonb),
    'balance',v_balance,'balances',v_balances,'finance_layout',v_layout);
end $$;
revoke all on function public.crm_detail(uuid) from public, anon, authenticated;
grant execute on function public.crm_detail(uuid) to authenticated;

-- Implementación original conservada, privada; sólo el wrapper puede invocarla.
create or replace function public.crm_record_payment_repository(p_id uuid, p_request uuid, p_amount numeric, p_currency text, p_method text, p_account text, p_concept text, p_fx numeric default 1)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_profile uuid; v_existing public.transactions;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into v_existing from public.transactions where crm_request_id=p_request;
  if found then
    if v_existing.client_id is distinct from p_id or v_existing.amount is distinct from p_amount
      or v_existing.currency::text is distinct from p_currency or v_existing.payment_method_id is distinct from p_method
      or v_existing.account_id is distinct from p_account or v_existing.concept is distinct from trim(p_concept)
      or v_existing.fx_rate is distinct from p_fx then raise exception 'REQUEST_CONFLICT'; end if;
    return v_existing.id;
  end if;
  if p_amount is null or p_amount<=0 or p_amount>99999999 or p_amount<>round(p_amount,2)
    or p_currency is null or p_currency not in ('NIO','USD') or p_fx is null or p_fx<=0 or p_fx>10000
    or p_fx<>round(p_fx,4) or round(p_amount*p_fx,2)>9999999999.99
    or (p_currency='NIO' and p_fx<>1) or p_concept is null or length(trim(p_concept)) not between 2 and 200 then raise exception 'INVALID_PAYMENT'; end if;
  select profile_id into v_profile from public.gym_clients where id=p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not exists(select 1 from public.payment_methods where id=p_method and is_active
    and ((p_currency='NIO' and accepts_nio) or (p_currency='USD' and accepts_usd))) then raise exception 'INVALID_METHOD'; end if;
  if not exists(select 1 from public.accounts where id=p_account and is_active and currency::text=p_currency) then raise exception 'INVALID_ACCOUNT'; end if;
  insert into public.transactions(direction,status,amount,currency,fx_rate,base_amount,payment_method_id,account_id,member_id,client_id,crm_request_id,concept,created_by)
    values('income','completed',p_amount,p_currency::public.currency_code,p_fx,round(p_amount*p_fx,2),p_method,p_account,v_profile,p_id,p_request,trim(p_concept),auth.uid()) returning id into v_id;
  insert into public.client_events(client_id,action,details,actor_id) values(p_id,'payment',jsonb_build_object('transaction_id',v_id),auth.uid());
  return v_id;
end $$;

revoke all on function public.crm_record_payment_repository(uuid,uuid,numeric,text,text,text,text,numeric) from public, anon, authenticated;

create or replace function public.crm_record_payment(p_id uuid, p_request uuid, p_amount numeric, p_currency text, p_method text, p_account text, p_concept text, p_fx numeric default 1)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if public.crm_finance_layout()<>'repository' then raise exception 'FINANCE_REVIEW_REQUIRED'; end if;
  return public.crm_record_payment_repository(p_id,p_request,p_amount,p_currency,p_method,p_account,p_concept,p_fx);
end $$;
revoke all on function public.crm_record_payment(uuid,uuid,numeric,text,text,text,text,numeric) from public, anon, authenticated;
grant execute on function public.crm_record_payment(uuid,uuid,numeric,text,text,text,text,numeric) to authenticated;
commit;


-- LECTURA FINANCIERA compatible con el esquema recibido por CSV.
-- Requiere CRM + 00022. No altera datos, tablas, saldos, RLS ni vistas existentes.
-- Mantiene BLOQUEADOS los cobros CRM y bloquea record_payment antiguo en este modelo.
begin;

create or replace function public.finance_read(p_section text, p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_data jsonb; v_limit integer := greatest(1,least(coalesce(p_limit,30),366));
  v_today date := (now() at time zone 'America/Managua')::date;
  v_month date := date_trunc('month',now() at time zone 'America/Managua')::date;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if public.crm_finance_layout()<>'bank_accounts_split' then raise exception 'FINANCE_SCHEMA_UNSUPPORTED'; end if;
  case p_section
  when 'methods' then
    select coalesce(jsonb_agg(to_jsonb(r) order by sort_order,id),'[]'::jsonb) into v_data from (
      select id,id as slug,null::text as kind,name as name_es,null::text as name_en,
        ''::text as details_es,''::text as details_en,'Wallet'::text as icon,
        currency in ('NIO','BOTH') as accepts_nio,currency in ('USD','BOTH') as accepts_usd,
        is_active,display_order as sort_order
      from public.payment_methods where is_active
    ) r;
  when 'accounts' then
    select coalesce(jsonb_agg(to_jsonb(r) order by sort_order,id),'[]'::jsonb) into v_data from (
      select id,id as slug,name,
        case account_type when 'caja_fuerte' then 'cash' when 'banco' then 'bank' when 'billetera' then 'wallet' else account_type end as kind,
        currency,is_active,balance,display_order as sort_order
      from public.bank_accounts where is_active
    ) r;
  when 'categories' then
    select coalesce(jsonb_agg(to_jsonb(r) order by sort_order,id),'[]'::jsonb) into v_data from (
      select id,id as slug,name as name_es,null::text as name_en,'Receipt'::text as icon,
        null::boolean as is_active,display_order as sort_order
      from public.expense_categories
    ) r;
  when 'transactions' then
    select coalesce(jsonb_agg(to_jsonb(r) order by occurred_at desc,id),'[]'::jsonb) into v_data from (
      select t.id,t.occurred_at,t.type::text as direction,t.status::text as status,t.amount,t.currency,
        t.fx_used as fx_rate,t.amount_nio as base_amount,t.method_id as payment_method_id,
        t.account_id,t.member_id,null::uuid as invoice_id,t.category_id as expense_category_id,
        t.concept,t.notes,t.created_by,
        case when p.id is not null then jsonb_build_object('full_name',p.full_name) end as member,
        case when c.id is not null then jsonb_build_object('full_name',c.full_name) end as client
      from public.transactions t left join public.profiles p on p.id=t.member_id
        left join public.gym_clients c on c.id=t.client_id
      order by t.occurred_at desc,t.id limit v_limit
    ) r;
  when 'daily' then
    select coalesce(jsonb_agg(to_jsonb(r) order by day desc),'[]'::jsonb) into v_data from (
      select (occurred_at at time zone 'America/Managua')::date as day,
        sum(case when type::text='income' then amount_nio else 0 end) as income_nio,
        sum(case when type::text='expense' then amount_nio else 0 end) as expense_nio,
        sum(case when type::text='income' then amount_nio when type::text='expense' then -amount_nio else 0 end) as net_nio,
        count(*) as tx_count from public.transactions where status::text='completed'
      group by 1 order by 1 desc limit v_limit
    ) r;
  when 'monthly' then
    select coalesce(jsonb_agg(to_jsonb(r) order by month desc),'[]'::jsonb) into v_data from (
      select date_trunc('month',occurred_at at time zone 'America/Managua')::date as month,
        sum(case when type::text='income' then amount_nio else 0 end) as income_nio,
        sum(case when type::text='expense' then amount_nio else 0 end) as expense_nio,
        sum(case when type::text='income' then amount_nio when type::text='expense' then -amount_nio else 0 end) as net_nio
      from public.transactions where status::text='completed'
      group by 1 order by 1 desc limit v_limit
    ) r;
  when 'method_totals' then
    select coalesce(jsonb_agg(to_jsonb(r) order by total_nio desc,payment_method_id),'[]'::jsonb) into v_data from (
      select t.method_id as payment_method_id,m.name as name_es,'Wallet'::text as icon,count(*) as tx_count,
        sum(t.amount_nio) as total_nio,
        sum(case when t.type::text='income' then t.amount_nio else 0 end) as income_nio,
        sum(case when t.type::text='expense' then t.amount_nio else 0 end) as expense_nio
      from public.transactions t left join public.payment_methods m on m.id=t.method_id
      where t.status::text='completed' and t.type::text in ('income','expense') group by t.method_id,m.name
    ) r;
  when 'receivables' then
    select coalesce(jsonb_agg(to_jsonb(r) order by total_owed_nio desc,member_id),'[]'::jsonb) into v_data from (
      select b.member_id,p.full_name,p.email,p.phone,null::bigint as invoices_open,
        b.debt_nio as total_owed_nio,b.debt_usd as total_owed_usd,
        null::date as oldest_due,null::integer as days_overdue
      from public.member_balances b join public.profiles p on p.id=b.member_id
      where b.debt_nio>0 or b.debt_usd>0
    ) r;
  when 'summary' then
    select jsonb_build_object(
      'incomeToday',coalesce(sum(case when type::text='income' and (occurred_at at time zone 'America/Managua')::date=v_today then amount_nio else 0 end),0),
      'expenseToday',coalesce(sum(case when type::text='expense' and (occurred_at at time zone 'America/Managua')::date=v_today then amount_nio else 0 end),0),
      'netToday',coalesce(sum(case when (occurred_at at time zone 'America/Managua')::date=v_today then case when type::text='income' then amount_nio when type::text='expense' then -amount_nio else 0 end else 0 end),0),
      'txToday',count(*) filter(where (occurred_at at time zone 'America/Managua')::date=v_today),
      'incomeMonth',coalesce(sum(case when type::text='income' then amount_nio else 0 end),0),
      'expenseMonth',coalesce(sum(case when type::text='expense' then amount_nio else 0 end),0),
      'netMonth',coalesce(sum(case when type::text='income' then amount_nio when type::text='expense' then -amount_nio else 0 end),0),
      'txMonth',count(*),'pendingInvoices',null,'sourceModel','bank_accounts_split',
      'totalOwed',coalesce((select sum(debt_nio) from public.member_balances where debt_nio>0),0),
      'totalOwedUsd',coalesce((select sum(debt_usd) from public.member_balances where debt_usd>0),0),
      'openRegisterCount',(select count(*) from public.cash_sessions where closed_at is null),
      'openRegister',(select jsonb_build_object('id',id,'openedAt',opened_at,'openingAmount',opening_balance_nio,'openingAmountUsd',opening_balance_usd) from public.cash_sessions where closed_at is null order by opened_at desc,id limit 1)
    ) into v_data from public.transactions where status::text='completed'
      and (occurred_at at time zone 'America/Managua')::date>=v_month
      and (occurred_at at time zone 'America/Managua')::date<(v_month+interval '1 month')::date;
  else raise exception 'INVALID_FINANCE_SECTION';
  end case;
  return jsonb_build_object('finance_layout','bank_accounts_split','section',p_section,'data',v_data);
end $$;
revoke all on function public.finance_read(text,integer) from public,anon,authenticated;
grant execute on function public.finance_read(text,integer) to authenticated;

-- El escritor antiguo comprobado no verifica rol, no es idempotente y mezcla unidades.
-- Decisión del usuario: mantener cobros bloqueados. No se invoca ni se conserva como RPC accesible.
do $block$
begin
  if public.crm_finance_layout()='bank_accounts_split'
    and to_regprocedure('public.record_payment(uuid,numeric,text,text,text,text,text,text)') is not null then
    execute $definition$
      create or replace function public.record_payment(p_member_id uuid,p_amount numeric,p_currency text,p_method_id text,p_account_id text,p_plan_id text default null,p_concept text default 'Pago de membresía',p_reference text default null)
      returns uuid language plpgsql security definer set search_path=public,pg_temp as $guard$
      begin
        if not public.crm_is_staff() then raise exception 'AUTH'; end if;
        raise exception 'FINANCE_REVIEW_REQUIRED';
      end $guard$;
    $definition$;
    execute 'revoke all on function public.record_payment(uuid,numeric,text,text,text,text,text,text) from public,anon,authenticated';
    execute 'grant execute on function public.record_payment(uuid,numeric,text,text,text,text,text,text) to authenticated';
  end if;
end $block$;
commit;


-- Plan asignado en la ficha CRM: consulta propia, sin modificar datos.
-- Requiere FASE2. No cobra, no renueva ni establece fechas de vigencia.
begin;
create or replace function public.crm_my_assigned_plan()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_plan text;
  v_details jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select plan_id into v_plan from public.gym_clients where profile_id=auth.uid();
  if not found then
    return jsonb_build_object('linked',false,'plan',null);
  end if;
  if v_plan is not null then
    select jsonb_build_object('id',id,'name_es',name_es,'name_en',name_en,'is_active',is_active)
      into v_details from public.plans where id=v_plan;
    if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  end if;
  return jsonb_build_object('linked',true,'plan',v_details);
end $$;
revoke all on function public.crm_my_assigned_plan() from public, anon, authenticated;
grant execute on function public.crm_my_assigned_plan() to authenticated;
notify pgrst, 'reload schema';
commit;
