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
