-- ============================================================
--  STRONG GYM — CONFIGURACIÓN COMPLETA DE SUPABASE
-- ============================================================
--
--  CÓMO USARLO
--    1. Entrá a tu proyecto en https://supabase.com
--    2. Menú lateral → "SQL Editor" → "New query"
--    3. Copiá TODO este archivo y pegalo en el editor
--    4. Apretá "Run" (o Ctrl + Enter) y esperá unos segundos
--
--  Qué crea:
--    · Las tablas (socios, clases, reservas, consultas, novedades)
--    · Las reglas de seguridad: cada socio sólo ve sus propias reservas
--    · Las funciones de reservar y cancelar, sin sobreventa de cupos
--    · El contenido inicial: disciplinas, profes, planes
--    · Las clases de las próximas 4 semanas (47 por semana)
--
--  Es seguro correrlo más de una vez: no duplica datos.
--
--  ARCHIVO GENERADO — no lo edites a mano.
--  El original son supabase/migrations/00001_schema.sql y 00002_seed.sql.
--  Para regenerarlo:  node scripts/build-sql.mjs
-- ============================================================


-- ############################################################
-- #  PARTE 1 de 2 — ESTRUCTURA (tablas, permisos y funciones)
-- #  Original: supabase/migrations/00001_schema.sql
-- ############################################################

-- ============================================================
--  Strong Gym — Esquema de base de datos (Supabase / PostgreSQL)
-- ============================================================
--  Cómo usarlo:
--    1. Entrá a tu proyecto en https://supabase.com
--    2. Menú lateral → SQL Editor → New query
--    3. Pegá TODO este archivo y apretá "Run"
--
--  Este archivo se puede correr varias veces sin romper nada
--  (usa IF NOT EXISTS y CREATE OR REPLACE).
-- ============================================================


-- ------------------------------------------------------------
--  1. TIPOS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('member', 'staff', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('confirmed', 'cancelled', 'attended', 'no_show');
  end if;

  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type public.session_status as enum ('scheduled', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'intensity_level') then
    create type public.intensity_level as enum ('low', 'medium', 'high');
  end if;
end $$;


-- ------------------------------------------------------------
--  2. PERFILES  (extiende auth.users de Supabase)
-- ------------------------------------------------------------
--  No guardamos la contraseña: de eso se encarga Supabase Auth.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  phone       text,
  role        public.user_role not null default 'member',
  plan_id     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Datos públicos del socio. Se crea solo al registrarse (trigger).';

-- Índice para buscar por email desde el panel
create index if not exists profiles_email_idx on public.profiles (lower(email));


-- ------------------------------------------------------------
--  3. DISCIPLINAS (funcional, spinning, yoga...)
-- ------------------------------------------------------------

create table if not exists public.classes (
  id             text primary key,
  slug           text not null unique,
  name_es        text not null,
  name_en        text not null,
  description_es text not null default '',
  description_en text not null default '',
  intensity      public.intensity_level not null default 'medium',
  duration_min   integer not null default 45 check (duration_min between 10 and 180),
  capacity       integer not null default 16 check (capacity between 1 and 200),
  color          text not null default '#cbf73f',
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists classes_active_idx on public.classes (is_active, sort_order);


-- ------------------------------------------------------------
--  4. PROFES
-- ------------------------------------------------------------

create table if not exists public.coaches (
  id         text primary key,
  slug       text not null unique,
  name       text not null,
  role_es    text not null default '',
  role_en    text not null default '',
  bio_es     text not null default '',
  bio_en     text not null default '',
  specialties text[] not null default '{}',
  initials   text not null default '',
  color      text not null default '#cbf73f',
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists coaches_active_idx on public.coaches (is_active, sort_order);


-- ------------------------------------------------------------
--  5. PLANES
-- ------------------------------------------------------------

create table if not exists public.plans (
  id           text primary key,
  slug         text not null unique,
  name_es      text not null,
  name_en      text not null,
  tagline_es   text not null default '',
  tagline_en   text not null default '',
  price        numeric(10, 2) not null default 0,
  period       text not null default 'month' check (period in ('month', 'week', 'session')),
  features_es  text[] not null default '{}',
  features_en  text[] not null default '{}',
  is_popular   boolean not null default false,
  sort_order   integer not null default 0,
  is_active    boolean not null default true
);

-- El perfil referencia el plan por id (sin FK estricta para poder
-- cambiar los IDs de los planes sin romper cuentas existentes).
alter table public.profiles
  drop constraint if exists profiles_plan_id_fkey;


-- ------------------------------------------------------------
--  6. CLASES PROGRAMADAS (con fecha y hora)
-- ------------------------------------------------------------
--  Cada fila es UNA clase en UN horario concreto.
--  Podés generarlas desde el panel: ver la función generate_sessions.

create table if not exists public.sessions (
  id         text primary key default gen_random_uuid()::text,
  class_id   text not null references public.classes (id) on delete cascade,
  coach_id   text references public.coaches (id) on delete set null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  capacity   integer not null check (capacity between 1 and 200),
  room       text not null default 'Salón principal',
  status     public.session_status not null default 'scheduled',
  created_at timestamptz not null default now(),

  constraint sessions_time_valid check (ends_at > starts_at)
);

create index if not exists sessions_starts_at_idx on public.sessions (starts_at);
create index if not exists sessions_class_idx on public.sessions (class_id, starts_at);


-- ------------------------------------------------------------
--  7. RESERVAS
-- ------------------------------------------------------------

create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  session_id   text not null references public.sessions (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  status       public.booking_status not null default 'confirmed',
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,

  -- Un solo registro por socio y clase (si cancela, se reutiliza la fila)
  unique (session_id, user_id)
);

create index if not exists bookings_user_idx on public.bookings (user_id, status);
create index if not exists bookings_session_idx on public.bookings (session_id, status);


-- ------------------------------------------------------------
--  8. CONSULTAS DEL FORMULARIO DE CONTACTO
-- ------------------------------------------------------------

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text,
  subject    text not null default 'info',
  message    text not null,
  locale     text not null default 'es',
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_created_idx on public.messages (created_at desc);


-- ------------------------------------------------------------
--  9. SUSCRIPTORES DEL NEWSLETTER
-- ------------------------------------------------------------

create table if not exists public.subscribers (
  email      text primary key,
  locale     text not null default 'es',
  created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
--  9-bis. OCUPACIÓN DE CADA CLASE (vista pública)
-- ------------------------------------------------------------
--  El sitio necesita mostrar "quedan 4 lugares" a todo el mundo,
--  pero las reservas están protegidas por RLS: cada socio sólo ve
--  las suyas. Esta vista expone ÚNICAMENTE el conteo por clase
--  (nunca quién reservó), así nadie puede espiar a los demás.

create or replace view public.session_occupancy as
  select
    session_id,
    count(*) filter (where status in ('confirmed', 'attended'))::int as booked_count
  from public.bookings
  group by session_id;

comment on view public.session_occupancy is
  'Cuántos lugares ocupados tiene cada clase. Sólo conteos, sin datos de socios.';

grant select on public.session_occupancy to anon, authenticated;


-- ============================================================
--  10. PERFIL AUTOMÁTICO AL REGISTRARSE
-- ============================================================
--  Cuando alguien crea una cuenta, Supabase inserta la fila en
--  auth.users y este trigger copia los datos a public.profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
--  11. FUNCIONES DE NEGOCIO
-- ============================================================
--  Las reservas pasan por estas funciones para evitar que dos
--  personas ocupen el último lugar al mismo tiempo.

-- ---------- Reservar ----------
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
  v_existing boolean := false;   -- ¿ya tenía una reserva cancelada en esta clase?
  v_booked   integer;            -- lugares ocupados
  v_active   integer;            -- reservas activas del socio
  v_max      integer := 3;       -- máximo de reservas activas a la vez
begin
  if v_user_id is null then
    raise exception 'AUTH: tenés que iniciar sesión';
  end if;

  -- Bloqueamos la fila: nadie más puede reservar al mismo tiempo
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

  -- ¿Ya tiene una reserva en esta clase?
  select * into v_booking
  from public.bookings
  where session_id = p_session_id and user_id = v_user_id;

  if found then
    if v_booking.status in ('confirmed', 'attended') then
      raise exception 'ALREADY_BOOKED: ya tenés una reserva en esa clase';
    end if;
    -- Estaba cancelada: después reutilizamos la fila
    v_existing := true;
  end if;

  -- Cupos disponibles (las canceladas no ocupan lugar)
  select count(*) into v_booked
  from public.bookings
  where session_id = p_session_id and status in ('confirmed', 'attended');

  if v_booked >= v_session.capacity then
    raise exception 'FULL: no quedan lugares';
  end if;

  -- Límite de reservas activas por socio
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


-- ---------- Cancelar ----------
create or replace function public.cancel_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings;
  v_starts  timestamptz;
  v_window  interval := interval '3 hours';   -- margen para cancelar
begin
  if v_user_id is null then
    raise exception 'AUTH: tenés que iniciar sesión';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: la reserva no existe';
  end if;

  select starts_at into v_starts from public.sessions where id = v_booking.session_id;

  if v_starts - now() < v_window then
    raise exception 'TOO_LATE: ya no podés cancelar (faltan menos de 3 horas)';
  end if;

  update public.bookings
    set status = 'cancelled', cancelled_at = now()
    where id = p_booking_id
    returning * into v_booking;

  return jsonb_build_object('id', v_booking.id, 'status', v_booking.status);
end;
$$;


-- ---------- Generar la grilla semanal ----------
--  Crea las clases de una semana a partir de una plantilla.
--  Uso:  select public.generate_week_sessions('2026-10-19'::date);
create or replace function public.generate_week_sessions(p_monday date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_template record;
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
      -- Lunes
      (0, '06:00'::time, 'funcional'),
      (0, '07:00'::time, 'spinning'),
      (0, '08:30'::time, 'stretching'),
      (0, '10:00'::time, 'zumba'),
      (0, '17:00'::time, 'funcional'),
      (0, '18:00'::time, 'spinning'),
      (0, '19:00'::time, 'cross-training'),
      (0, '20:00'::time, 'boxeo'),
      -- Martes
      (1, '06:00'::time, 'funcional'),
      (1, '07:00'::time, 'hiit'),
      (1, '09:00'::time, 'pilates'),
      (1, '12:30'::time, 'spinning'),
      (1, '17:30'::time, 'funcional'),
      (1, '18:30'::time, 'boxeo'),
      (1, '19:30'::time, 'cross-training'),
      (1, '20:30'::time, 'stretching'),
      -- Miércoles
      (2, '06:00'::time, 'cross-training'),
      (2, '07:00'::time, 'spinning'),
      (2, '10:00'::time, 'zumba'),
      (2, '12:30'::time, 'hiit'),
      (2, '17:00'::time, 'funcional'),
      (2, '18:00'::time, 'pilates'),
      (2, '19:00'::time, 'spinning'),
      (2, '20:00'::time, 'boxeo'),
      -- Jueves
      (3, '06:00'::time, 'funcional'),
      (3, '07:00'::time, 'spinning'),
      (3, '10:30'::time, 'stretching'),
      (3, '12:30'::time, 'hiit'),
      (3, '17:30'::time, 'funcional'),
      (3, '18:30'::time, 'cross-training'),
      (3, '19:30'::time, 'boxeo'),
      (3, '20:30'::time, 'yoga'),
      -- Viernes
      (4, '06:00'::time, 'funcional'),
      (4, '07:00'::time, 'spinning'),
      (4, '08:30'::time, 'yoga'),
      (4, '10:00'::time, 'zumba'),
      (4, '17:00'::time, 'funcional'),
      (4, '18:00'::time, 'spinning'),
      (4, '19:00'::time, 'cross-training'),
      (4, '20:00'::time, 'boxeo'),
      -- Sábado
      (5, '08:00'::time, 'funcional'),
      (5, '09:00'::time, 'spinning'),
      (5, '10:00'::time, 'cross-training'),
      (5, '11:00'::time, 'stretching'),
      (5, '12:00'::time, 'zumba'),
      -- Domingo
      (6, '09:30'::time, 'yoga'),
      (6, '11:00'::time, 'stretching')
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
        when 'spinning' then 'Sala Cycling'
        when 'yoga' then 'Salón Zen'
        when 'pilates' then 'Salón Zen'
        when 'stretching' then 'Salón Zen'
        when 'boxeo' then 'Ring'
        when 'hiit' then 'Salón B'
        when 'zumba' then 'Salón B'
        else 'Salón A'
      end
    );

    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end;
$$;


-- ---------- Marcar ausentes automáticamente ----------
--  Pasadas 2 horas del inicio, las reservas confirmadas que nadie
--  marcó pasan a "no_show". Programalo con pg_cron si querés.
create or replace function public.close_past_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.bookings b
    set status = 'no_show'
    from public.sessions s
    where b.session_id = s.id
      and b.status = 'confirmed'
      and s.ends_at < now() - interval '2 hours';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ============================================================
--  12. SEGURIDAD A NIVEL DE FILA (RLS)
-- ============================================================
--  Sin esto, cualquiera con la clave pública podría leer o
--  escribir toda la base. Cada tabla define quién ve qué.

alter table public.profiles    enable row level security;
alter table public.classes     enable row level security;
alter table public.coaches     enable row level security;
alter table public.plans       enable row level security;
alter table public.sessions    enable row level security;
alter table public.bookings    enable row level security;
alter table public.messages    enable row level security;
alter table public.subscribers enable row level security;


-- ---------- ¿Es staff? ----------
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  );
$$;


-- ---------- profiles ----------
drop policy if exists "perfil: leer el propio" on public.profiles;
create policy "perfil: leer el propio" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists "perfil: editar el propio" on public.profiles;
create policy "perfil: editar el propio" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "perfil: el staff edita todo" on public.profiles;
create policy "perfil: el staff edita todo" on public.profiles
  for update using (public.is_staff());

drop policy if exists "perfil: el staff agrega" on public.profiles;
create policy "perfil: el staff agrega" on public.profiles
  for insert with check (public.is_staff());


-- ---------- contenido público ----------
drop policy if exists "clases: lectura pública" on public.classes;
create policy "clases: lectura pública" on public.classes
  for select using (true);

drop policy if exists "clases: el staff escribe" on public.classes;
create policy "clases: el staff escribe" on public.classes
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "profes: lectura pública" on public.coaches;
create policy "profes: lectura pública" on public.coaches
  for select using (true);

drop policy if exists "profes: el staff escribe" on public.coaches;
create policy "profes: el staff escribe" on public.coaches
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "planes: lectura pública" on public.plans;
create policy "planes: lectura pública" on public.plans
  for select using (true);

drop policy if exists "planes: el staff escribe" on public.plans;
create policy "planes: el staff escribe" on public.plans
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "horarios: lectura pública" on public.sessions;
create policy "horarios: lectura pública" on public.sessions
  for select using (true);

drop policy if exists "horarios: el staff escribe" on public.sessions;
create policy "horarios: el staff escribe" on public.sessions
  for all using (public.is_staff()) with check (public.is_staff());


-- ---------- bookings ----------
drop policy if exists "reservas: ver las propias" on public.bookings;
create policy "reservas: ver las propias" on public.bookings
  for select using (user_id = auth.uid() or public.is_staff());

drop policy if exists "reservas: cancelar la propia" on public.bookings;
create policy "reservas: cancelar la propia" on public.bookings
  for update using (user_id = auth.uid() or public.is_staff());

drop policy if exists "reservas: el staff gestiona" on public.bookings;
create policy "reservas: el staff gestiona" on public.bookings
  for all using (public.is_staff()) with check (public.is_staff());

-- Las altas se hacen por la función book_session(), no directo a la tabla.
-- (La función es "security definer", así que saltea estas reglas.)


-- ---------- messages ----------
--  El formulario web inserta sin estar logueado; sólo el staff lee.
drop policy if exists "consultas: cualquiera puede escribir" on public.messages;
create policy "consultas: cualquiera puede escribir" on public.messages
  for insert with check (true);

drop policy if exists "consultas: el staff lee" on public.messages;
create policy "consultas: el staff lee" on public.messages
  for select using (public.is_staff());

drop policy if exists "consultas: el staff actualiza" on public.messages;
create policy "consultas: el staff actualiza" on public.messages
  for update using (public.is_staff());


-- ---------- subscribers ----------
drop policy if exists "novedades: cualquiera se suscribe" on public.subscribers;
create policy "novedades: cualquiera se suscribe" on public.subscribers
  for insert with check (true);

drop policy if exists "novedades: el staff lee" on public.subscribers;
create policy "novedades: el staff lee" on public.subscribers
  for select using (public.is_staff());


-- ============================================================
--  13. PERMISOS
-- ============================================================

grant usage on schema public to anon, authenticated;
grant select on public.classes, public.coaches, public.plans, public.sessions to anon, authenticated;
grant select, insert, update on public.bookings to authenticated;
grant select, update on public.profiles to authenticated;
grant insert on public.messages, public.subscribers to anon, authenticated;
grant select, update on public.messages to authenticated;
grant select on public.subscribers to authenticated;
grant execute on function public.book_session(text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.is_staff() to authenticated;



-- ############################################################
-- #  PARTE 2 de 2 — DATOS INICIALES (disciplinas, profes, clases)
-- #  Original: supabase/migrations/00002_seed.sql
-- ############################################################

-- ============================================================
--  Strong Gym — Datos iniciales
-- ============================================================
--  Cargá este archivo DESPUÉS de 00001_schema.sql, en el SQL Editor.
--  Se puede correr las veces que quieras: actualiza en lugar de duplicar.
-- ============================================================


-- ------------------------------------------------------------
--  DISCIPLINAS
-- ------------------------------------------------------------

insert into public.classes
  (id, slug, name_es, name_en, description_es, description_en, intensity, duration_min, capacity, color, sort_order)
values
  ('cls_funcional', 'funcional', 'Funcional', 'Functional Training',
   'Trabajo de fuerza y resistencia con el peso del cuerpo, kettlebells, TRX y sogas. Mejora todo lo que necesitás para el día a día.',
   'Strength and endurance work with bodyweight, kettlebells, TRX and ropes. Builds everything you need for daily life.',
   'high', 50, 18, '#cbf73f', 1),

  ('cls_cross', 'cross-training', 'Cross Training', 'Cross Training',
   'Circuitos de alta intensidad que combinan levantamiento, gimnasia y cardio. La clase más exigente del gimnasio.',
   'High-intensity circuits combining lifting, gymnastics and cardio. The toughest class we run.',
   'high', 60, 16, '#ff5b26', 2),

  ('cls_spinning', 'spinning', 'Spinning', 'Spinning',
   'Pedaleo con música, luces y mucha energía. Quemá calorías y mejorá tu capacidad cardiovascular sin impacto en las rodillas.',
   'Pedal to music, lights and high energy. Burn calories and improve your cardio with zero impact on your knees.',
   'high', 45, 24, '#38bdf8', 3),

  ('cls_hiit', 'hiit', 'HIIT', 'HIIT',
   'Intervalos cortos de máxima intensidad con descansos medidos. 40 minutos que rinden como dos horas.',
   'Short bursts of maximum intensity with measured rest. 40 minutes that pay off like two hours.',
   'high', 40, 20, '#f472b6', 4),

  ('cls_boxeo', 'boxeo', 'Boxeo', 'Boxing',
   'Técnica, bolsa y guanteo controlado. Aprendés a moverte, ganás reflejos y descargás todo el estrés de la semana.',
   'Technique, heavy bag and controlled sparring. Learn to move, sharpen your reflexes and burn off the week''s stress.',
   'high', 55, 14, '#ef4444', 5),

  ('cls_zumba', 'zumba', 'Zumba', 'Zumba',
   'Coreografías de ritmos latinos para entrenar sin darte cuenta. La clase donde más te vas a reír.',
   'Latin rhythm choreographies that sneak the workout in. The class where you''ll laugh the most.',
   'medium', 45, 26, '#fbbf24', 6),

  ('cls_pilates', 'pilates', 'Pilates', 'Pilates',
   'Trabajo profundo de core, postura y respiración. Ideal si pasás muchas horas sentado o si estás volviendo de una lesión.',
   'Deep core work, posture and breathing. Ideal if you sit for long hours or are coming back from an injury.',
   'low', 50, 16, '#a78bfa', 7),

  ('cls_yoga', 'yoga', 'Yoga', 'Yoga',
   'Posturas, respiración y estiramiento para cerrar el día. Bajá el ritmo, soltá la espalda y dormí mejor.',
   'Poses, breathing and stretching to close the day. Slow down, release your back and sleep better.',
   'low', 60, 20, '#4ade80', 8),

  ('cls_stretching', 'stretching', 'Stretching y movilidad', 'Stretching & Mobility',
   'Rutina de movilidad articular y elongación guiada. La mejor manera de evitar lesiones y recuperarte más rápido.',
   'Joint mobility and guided stretching routine. The best way to avoid injuries and recover faster.',
   'low', 45, 22, '#22d3ee', 9)
on conflict (id) do update set
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  description_es = excluded.description_es,
  description_en = excluded.description_en,
  intensity = excluded.intensity,
  duration_min = excluded.duration_min,
  capacity = excluded.capacity,
  color = excluded.color,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  PROFES
-- ------------------------------------------------------------

insert into public.coaches
  (id, slug, name, role_es, role_en, bio_es, bio_en, specialties, initials, color, sort_order)
values
  ('cch_diego', 'diego-farias', 'Diego Farías',
   'Head Coach · Funcional y Cross', 'Head Coach · Functional & Cross',
   'Ex jugador de rugby y entrenador hace 12 años. Especialista en fuerza y acondicionamiento. Si querés resultados, Diego te los va a sacar.',
   'Former rugby player and coach for 12 years. Strength and conditioning specialist. If you want results, Diego will get them out of you.',
   array['funcional', 'cross-training'], 'DF', '#cbf73f', 1),

  ('cch_sofia', 'sofia-mendez', 'Sofía Méndez',
   'Spinning e HIIT', 'Spinning & HIIT',
   'Instructora de ciclismo indoor certificada. Sus clases tienen lista de espera todos los martes: la energía que pone es difícil de igualar.',
   'Certified indoor cycling instructor. Her classes have a waiting list every Tuesday: her energy is hard to match.',
   array['spinning', 'hiit'], 'SM', '#38bdf8', 2),

  ('cch_nicolas', 'nicolas-ruiz', 'Nicolás Ruiz',
   'Boxeo', 'Boxing',
   'Boxeador amateur con 40 peleas y entrenador de la escuela juvenil del club. Enseña técnica desde cero, sin apuro.',
   'Amateur boxer with 40 fights and coach of the club''s youth school. Teaches technique from scratch, no rush.',
   array['boxeo', 'funcional'], 'NR', '#ef4444', 3),

  ('cch_valentina', 'valentina-sosa', 'Valentina Sosa',
   'Yoga y Pilates', 'Yoga & Pilates',
   'Kinesióloga y profesora de yoga. Trabaja con rehabilitación postural y adapta cada postura a tu cuerpo.',
   'Physiotherapist and yoga teacher. She works with postural rehab and adapts every pose to your body.',
   array['yoga', 'pilates', 'stretching'], 'VS', '#4ade80', 4),

  ('cch_marcos', 'marcos-leiva', 'Marcos Leiva',
   'Zumba y Stretching', 'Zumba & Stretching',
   'Bailarín y profesor de danza. Hace que la clase más divertida sea también la que más te hace transpirar.',
   'Dancer and dance teacher. He makes the most fun class also the one that makes you sweat the most.',
   array['zumba', 'stretching'], 'ML', '#fbbf24', 5),

  ('cch_julieta', 'julieta-barrios', 'Julieta Barrios',
   'Funcional y HIIT', 'Functional & HIIT',
   'Profesora de educación física y atleta de crossfit. Especialista en entrenamiento para principiantes y embarazadas.',
   'Physical education teacher and crossfit athlete. Specialist in training for beginners and pregnant members.',
   array['funcional', 'hiit', 'cross-training'], 'JB', '#f472b6', 6)
on conflict (id) do update set
  name = excluded.name,
  role_es = excluded.role_es,
  role_en = excluded.role_en,
  bio_es = excluded.bio_es,
  bio_en = excluded.bio_en,
  specialties = excluded.specialties,
  initials = excluded.initials,
  color = excluded.color,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  PLANES  (cambiá los precios a los tuyos)
-- ------------------------------------------------------------

insert into public.plans
  (id, slug, name_es, name_en, tagline_es, tagline_en, price, period, features_es, features_en, is_popular, sort_order)
values
  ('pln_basico', 'basico', 'Básico', 'Basic',
   'Para arrancar y armar el hábito', 'To get started and build the habit',
   25, 'month',
   array['3 clases dirigidas por semana', 'Acceso a la sala de musculación', 'Evaluación física inicial', 'Sin matrícula ni contrato'],
   array['3 instructor-led classes per week', 'Access to the weights room', 'Initial fitness assessment', 'No joining fee, no contract'],
   false, 1),

  ('pln_full', 'full', 'Full', 'Full',
   'Clases ilimitadas y musculación 24/7', 'Unlimited classes and 24/7 weights room',
   39, 'month',
   array['Clases dirigidas ilimitadas', 'Acceso 24/7 con llave digital', 'Plan de entrenamiento personalizado', 'Seguimiento mensual con tu profe', '1 invitado por mes, sin cargo'],
   array['Unlimited instructor-led classes', '24/7 access with digital key', 'Personalised training plan', 'Monthly check-in with your coach', '1 free guest pass per month'],
   true, 2),

  ('pln_duo', 'duo', 'Dúo', 'Duo',
   'Dos personas, un precio, mismos beneficios', 'Two people, one price, same benefits',
   65, 'month',
   array['Todo lo del plan Full para 2 personas', 'Ideal para parejas, hermanos o amigos', 'Congelá el plan hasta 30 días por año', 'Vestuarios y lockers individuales'],
   array['Everything in the Full plan for 2 people', 'Ideal for couples, siblings or friends', 'Freeze your plan up to 30 days a year', 'Locker rooms and individual lockers'],
   false, 3),

  ('pln_personal', 'personal-trainer', 'Personal Trainer', 'Personal Trainer',
   'Entrenamiento 1 a 1 con profe exclusivo', 'One-on-one training with a dedicated coach',
   99, 'month',
   array['8 sesiones personales al mes', 'Plan y dieta derivada a nutricionista', 'Clases grupales incluidas', 'Mediciones y control de progreso cada 2 semanas'],
   array['8 personal sessions per month', 'Training plan plus nutritionist referral', 'Group classes included', 'Measurements and progress tracking every 2 weeks'],
   false, 4)
on conflict (id) do update set
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  tagline_es = excluded.tagline_es,
  tagline_en = excluded.tagline_en,
  price = excluded.price,
  features_es = excluded.features_es,
  features_en = excluded.features_en,
  is_popular = excluded.is_popular,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  CLASES DE LAS PRÓXIMAS 4 SEMANAS
-- ------------------------------------------------------------
--  generate_week_sessions(lunes) crea la grilla de una semana.
--  Acá la llamamos para las próximas 4 semanas (la fecha se
--  calcula tomando el lunes de esta semana).

select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1));
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 7);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 14);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 21);


-- ------------------------------------------------------------
--  CONSULTAS DE EJEMPLO (borralas cuando estés en producción)
-- ------------------------------------------------------------

--  (Si volvés a correr este archivo, no se duplican.)
insert into public.messages (name, email, phone, subject, message, locale, is_read)
select * from (values
  ('Andrea Solís', 'andrea.solis@example.com', '+505 8712 4490', 'trial',
   '¡Buenas! Quiero aprovechar la clase de prueba gratis. ¿Puedo ir un martes por la tarde a probar funcional?',
   'es', false),
  ('Kevin Ramírez', 'kevin.ramirez@example.com', null, 'plans',
   'Consulto por el plan Full: ¿incluye el acceso 24/7 desde el primer mes?',
   'es', false)
) as nueva(name, email, phone, subject, message, locale, is_read)
where not exists (
  select 1 from public.messages m where m.email = nueva.email
);


-- ============================================================
--  ¿CÓMO DARME PERMISOS DE ADMIN?
-- ============================================================
--  1. Creá tu cuenta desde la web (/es/registro)
--  2. Volvé al SQL Editor y corré esto con tu email:
--
--     update public.profiles
--        set role = 'admin'
--      where email = 'tu-correo@ejemplo.com';
--
--  3. Salí y volvé a entrar a la web. Vas a ver el Panel.
-- ============================================================
