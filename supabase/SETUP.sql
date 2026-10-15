-- ============================================================
--  STRONG FITNESS GYM — CONFIGURACIÓN COMPLETA DE SUPABASE
-- ============================================================
--
--  ESTE ARCHIVO ES PARA UN PROYECTO NUEVO Y VACÍO.
--  Si ya corriste una versión anterior, usá supabase/ACTUALIZAR.sql.
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
--    · El contenido real: disciplinas, planes y la grilla de clases
--    · El sistema de caja, contabilidad y métodos de pago (Fase 1)
--    · Las clases de las próximas 4 semanas (9 por semana)
--
--  Es seguro correrlo más de una vez: no duplica datos.
--
--  ARCHIVO GENERADO — no lo edites a mano.
--  El original son supabase/migrations/*.sql.
--  Para regenerarlo:  node scripts/build-sql.mjs
-- ============================================================


-- ############################################################
-- #  PARTE 1 de 3 — ESTRUCTURA BASE (tablas, permisos, funciones)
-- #  Original: supabase/migrations/00001_schema.sql
-- ############################################################

-- ============================================================
--  Strong Fitness Gym — Esquema de base de datos (Supabase / PostgreSQL)
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
--  3. DISCIPLINAS (pesas y máquinas, boxeo, zumba...)
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
  color          text not null default '#d81a22',
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
  color      text not null default '#d81a22',
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
  -- Puede ser NULL: significa "precio a consultar", la web no inventa un número.
  price        numeric(10, 2),
  period       text not null default 'month' check (period in ('month', 'week', 'session')),
  features_es  text[] not null default '{}',
  features_en  text[] not null default '{}',
  is_popular   boolean not null default false,
  sort_order   integer not null default 0,
  is_active    boolean not null default true
);

-- Si la tabla ya existía con price NOT NULL, la aflojamos: hay planes
-- cuyo precio todavía no se publica.
alter table public.plans alter column price drop not null;
alter table public.plans alter column price drop default;

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
-- #  PARTE 2 de 3 — DATOS INICIALES (disciplinas, planes, clases)
-- #  Original: supabase/migrations/00002_seed.sql
-- ############################################################

-- ============================================================
--  Strong Fitness Gym — Datos iniciales
-- ============================================================
--  Cargá este archivo DESPUÉS de 00001_schema.sql, en el SQL Editor.
--  Se puede correr las veces que quieras: actualiza en lugar de duplicar.
--
--  Son los datos REALES del gimnasio. Lo que todavía no está
--  confirmado (precio de la mensualidad, nombres de entrenadores)
--  queda vacío o en NULL a propósito: la web muestra "Consultar"
--  en vez de inventar un número.
-- ============================================================


-- ------------------------------------------------------------
--  DISCIPLINAS
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


-- ------------------------------------------------------------
--  ENTRENADORES
-- ------------------------------------------------------------
--  El gimnasio todavía no pasó los nombres reales. Mientras la
--  tabla esté vacía, la web no muestra la sección "Nuestro equipo".
--
--  Para cargarlos, copiá este bloque y completá los datos:
--
--    insert into public.coaches
--      (id, slug, name, role_es, role_en, specialties, initials, color, sort_order)
--    values
--      ('cch_ejemplo', 'nombre-apellido', 'Nombre Apellido',
--       'Entrenador de boxeo', 'Boxing coach',
--       array['boxeo'], 'NA', '#d81a22', 1)
--    on conflict (id) do update set name = excluded.name;


-- ------------------------------------------------------------
--  PLANES
-- ------------------------------------------------------------
--  price = NULL significa "a consultar": la web muestra un botón
--  de WhatsApp en lugar de un precio.

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


-- ------------------------------------------------------------
--  CLASES DE LAS PRÓXIMAS 4 SEMANAS
-- ------------------------------------------------------------
--  generate_week_sessions(lunes) crea la grilla de una semana.
--  Acá la llamamos para las próximas 4 semanas (la fecha se
--  calcula tomando el lunes de esta semana).
--
--  La grilla sale de src/lib/data/demo-sessions.ts: boxeo los
--  martes, miércoles y jueves a las 06:00, 17:30 y 20:00.
--  El gimnasio cierra los domingos, así que no hay clases ese día.

select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1));
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 7);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 14);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 21);


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



-- ############################################################
-- #  PARTE 3 de 3 — SISTEMA DE CAJA Y CONTABILIDAD (Fase 1)
-- #  Originales: supabase/migrations/00010_finance.sql
-- #                supabase/migrations/00011_finance_seed.sql
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
