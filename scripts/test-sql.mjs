#!/usr/bin/env node
/**
 * ============================================================
 *  Pruebas del SQL de Supabase
 * ============================================================
 *  Levanta un PostgreSQL real (PGlite, un Postgres en WebAssembly)
 *  le aplica los archivos de `supabase/migrations/` y verifica que
 *  todo funcione: reservas, cupos, cancelaciones, seguridad y fechas.
 *
 *  Sirve para dos cosas:
 *    · Confirmar que el SQL es correcto antes de pegarlo en Supabase.
 *    · Detectar si un cambio futuro rompe algo (corre en el CI).
 *
 *  Uso:  npm run test:sql
 *
 *  Nota: PGlite no trae los objetos que Supabase ya provee (el esquema
 *  `auth`, los roles y la función auth.uid()), así que abajo se crean
 *  versiones mínimas para poder probar en un entorno parecido.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Lo que Supabase ya trae hecho y acá tenemos que imitar. */
const STUBS = `
create schema if not exists auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Simula el JWT del request: quién está logueado.
create table if not exists auth.current_user (id uuid);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select id from auth.current_user limit 1 $$;

grant usage on schema auth to authenticated, anon;
grant select on auth.current_user to authenticated, anon;
`;

let failures = 0;
function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "  ✅" : "  ❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function expectError(label, sql, fragment) {
  try {
    await db.query(sql);
    check(label, false, "no lanzó error (debía fallar)");
  } catch (error) {
    const message = String(error.message ?? error);
    check(label, message.toUpperCase().includes(fragment.toUpperCase()), message.slice(0, 90));
  }
}

const db = new PGlite();

console.log("\n▶ Preparando el entorno tipo Supabase…");
await db.exec(STUBS);

console.log("\n▶ Ejecutando 00001_schema.sql…");
await db.exec(readFileSync(`${REPO}/supabase/migrations/00001_schema.sql`, "utf8"));
console.log("  ✅ esquema creado sin errores");

console.log("\n▶ Ejecutando 00002_seed.sql…");
await db.exec(readFileSync(`${REPO}/supabase/migrations/00002_seed.sql`, "utf8"));
console.log("  ✅ datos iniciales cargados sin errores");

console.log("\n▶ Ejecutando 00010_finance.sql (Fase 1: contabilidad)…");
await db.exec(readFileSync(`${REPO}/supabase/migrations/00010_finance.sql`, "utf8"));
console.log("  ✅ esquema de finanzas creado sin errores");

console.log("\n▶ Ejecutando 00011_finance_seed.sql (Fase 1: datos de ejemplo)…");
await db.exec(readFileSync(`${REPO}/supabase/migrations/00011_finance_seed.sql`, "utf8"));
console.log("  ✅ 40 socios, 3 coaches, 10 métodos de pago, ~50 transacciones");

console.log("\n▶ Contenido cargado");
const counts = await db.query(`
  select
    (select count(*) from public.classes)  as clases,
    (select count(*) from public.coaches)  as profes,
    (select count(*) from public.plans)    as planes,
    (select count(*) from public.sessions) as sesiones
`);
console.log("  ", counts.rows[0]);
check("3 disciplinas (pesas, boxeo, zumba)", Number(counts.rows[0].clases) === 3);
check("3 coaches cargados (Douglas, María, José Luis)", Number(counts.rows[0].profes) === 3);
check("3 planes", Number(counts.rows[0].planes) === 3);
check(
  "36 clases programadas (9 por semana × 4)",
  Number(counts.rows[0].sesiones) === 36,
  `${counts.rows[0].sesiones} sesiones`,
);
check(
  "el plan de boxeo cuesta 20 y los otros dos quedan a consultar",
  Number(
    (await db.query(`select count(*)::int as n from public.plans where price is null`)).rows[0].n,
  ) === 2 &&
    Number(
      (await db.query(`select price from public.plans where id = 'pln_boxeo'`)).rows[0].price,
    ) === 20,
);
check(
  "ningún domingo tiene clases (el gimnasio cierra)",
  Number(
    (
      await db.query(
        `select count(*)::int as n from public.sessions
          where extract(isodow from starts_at at time zone 'America/Managua') = 7`,
      )
    ).rows[0].n,
  ) === 0,
);

// El martes de esta semana, que es cuando empieza la grilla de boxeo.
const hoy = new Date();
const lunes = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
const martes = new Date(lunes);
martes.setUTCDate(martes.getUTCDate() + 1);
const martesISO = martes.toISOString().slice(0, 10);

const tzCheck = await db.query(`
  select
    to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc,
    to_char(starts_at at time zone 'America/Managua', 'YYYY-MM-DD HH24:MI') as local,
    extract(isodow from starts_at at time zone 'America/Managua') as dia
  from public.sessions
  where class_id = 'cls_boxeo'
  order by starts_at
  limit 1
`);
check(
  "la primera clase de boxeo es martes 06:00 en Managua",
  tzCheck.rows[0].local === `${martesISO} 06:00`,
  `hora local = ${tzCheck.rows[0].local}, en UTC = ${tzCheck.rows[0].utc}`,
);
check(
  "y en UTC son las 12:00 (Managua = UTC-6)",
  tzCheck.rows[0].utc === `${martesISO} 12:00`,
  tzCheck.rows[0].utc,
);
check("cae en martes (no se corrió de día)", Number(tzCheck.rows[0].dia) === 2, `isodow = ${tzCheck.rows[0].dia}`);
check(
  "los tres horarios del día son 06:00, 17:30 y 20:00",
  JSON.stringify(
    (
      await db.query(
        `select distinct to_char(starts_at at time zone 'America/Managua', 'HH24:MI') as h
           from public.sessions order by h`,
      )
    ).rows.map((r) => r.h),
  ) === JSON.stringify(["06:00", "17:30", "20:00"]),
);

console.log("\n▶ Idempotencia: correr el seed dos veces no debe duplicar");
await db.exec(readFileSync(`${REPO}/supabase/migrations/00002_seed.sql`, "utf8"));
const after = await db.query(`select
  (select count(*) from public.classes) as clases,
  (select count(*) from public.sessions) as sesiones`);
check("las disciplinas siguen siendo 3", Number(after.rows[0].clases) === 3);
check(
  "las clases programadas no se duplicaron",
  Number(after.rows[0].sesiones) === Number(counts.rows[0].sesiones),
  `${counts.rows[0].sesiones} → ${after.rows[0].sesiones}`,
);

console.log("\n▶ Registro de socios (trigger de auth.users → profiles)");
const userA = (
  await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ('ana@example.com', '{"full_name":"Ana Torres"}'::jsonb) returning id`,
  )
).rows[0].id;
const userB = (
  await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ('bruno@example.com', '{"full_name":"Bruno Diaz"}'::jsonb) returning id`,
  )
).rows[0].id;

const profiles = await db.query(`select full_name, email, role from public.profiles order by email`);
check("se crearon los 2 perfiles", profiles.rows.length === 2, JSON.stringify(profiles.rows[0]));
check("el rol por defecto es member", profiles.rows.every((r) => r.role === "member"));

async function loginAs(id) {
  await db.exec(`delete from auth.current_user; insert into auth.current_user values ('${id}');`);
}

console.log("\n▶ Reservar una clase");
await loginAs(userA);
const freeSession = (
  await db.query(
    `select id from public.sessions where starts_at > now() + interval '2 days'
     order by starts_at limit 1`,
  )
).rows[0].id;

const booking1 = await db.query(`select public.book_session($1) as r`, [freeSession]);
check("la reserva se creó", booking1.rows[0].r?.status === "confirmed", JSON.stringify(booking1.rows[0].r));

console.log("\n▶ Reservar la misma clase otra vez");
await expectError("avisa que ya hay reserva", `select public.book_session('${freeSession}')`, "ALREADY");

console.log("\n▶ Límite de 3 reservas activas");
const moreSessions = (
  await db.query(
    `select id from public.sessions
     where starts_at > now() + interval '2 days' and id <> $1
     order by starts_at limit 3`,
    [freeSession],
  )
).rows;
await db.query(`select public.book_session($1)`, [moreSessions[0].id]);
await db.query(`select public.book_session($1)`, [moreSessions[1].id]);
await expectError(
  "la cuarta choca con el límite",
  `select public.book_session('${moreSessions[2].id}')`,
  "LIMIT",
);

console.log("\n▶ Clase llena");
// La clase ya la reservó Ana; bajamos el cupo a 1 y probamos con Bruno
const antesDeLlenar = await db.query(
  `select capacity, (select count(*) from public.bookings where session_id = $1 and status = 'confirmed')::int as ocupados
   from public.sessions where id = $1`,
  [freeSession],
);
check(
  "Ana ocupa el único lugar",
  Number(antesDeLlenar.rows[0].ocupados) === 1,
  `${antesDeLlenar.rows[0].ocupados} reserva(s)`,
);
await db.exec(`update public.sessions set capacity = 1 where id = '${freeSession}'`);
await loginAs(userB);
await expectError("sin lugares disponibles", `select public.book_session('${freeSession}')`, "FULL");

console.log("\n▶ Clase que ya pasó");
const pastSession = (
  await db.query(`select id from public.sessions order by starts_at limit 1`)
).rows[0].id;
await expectError("rechaza reservar en el pasado", `select public.book_session('${pastSession}')`, "PAST");

console.log("\n▶ Cancelar una reserva");
// Volvemos a entrar como Ana (Bruno quedó sin reserva: la clase estaba llena)
await loginAs(userA);
const bookingId = (
  await db.query(
    `select id from public.bookings where user_id = $1 and status = 'confirmed' limit 1`,
    [userA],
  )
).rows[0]?.id;
check("Ana tiene una reserva para cancelar", Boolean(bookingId));
if (bookingId) {
  const cancelled = await db.query(`select public.cancel_booking($1) as r`, [bookingId]);
  check("la reserva quedó cancelada", cancelled.rows[0].r?.status === "cancelled");

  // Y el lugar se libera: la ocupación baja
  const liberado = await db.query(
    `select booked_count from public.session_occupancy where session_id = $1`,
    [cancelled.rows[0].r.session_id ?? freeSession],
  );
  check("el lugar volvió a estar libre", Number(liberado.rows[0]?.booked_count ?? 0) === 0,
    `ocupación = ${liberado.rows[0]?.booked_count}`);

  // Y puede volver a reservar la misma clase (se reutiliza la fila)
  const reReserva = await db.query(`select public.book_session($1) as r`, [freeSession]);
  check("puede volver a reservar la misma clase", reReserva.rows[0].r?.status === "confirmed");

  // Y no se duplicó la fila
  const filas = await db.query(
    `select count(*)::int as n from public.bookings where user_id = $1 and session_id = $2`,
    [userA, freeSession],
  );
  check("no se duplicó la reserva", Number(filas.rows[0].n) === 1, `${filas.rows[0].n} fila(s)`);
}

console.log("\n▶ Cancelar con menos de 3 horas de anticipación");
await db.exec(`delete from auth.current_user;`);
// Una clase que arranca en 1 hora, en una disciplina sin cupo lleno
await db.exec(`
  insert into public.sessions (id, class_id, coach_id, starts_at, ends_at, capacity, room)
  values ('ses_prueba_tarde', 'cls_zumba', null, now() + interval '1 hour', now() + interval '2 hours', 20, 'Salón de clases')
`);
await loginAs(userB);
const lateBooking = await db.query(`select public.book_session('ses_prueba_tarde') as r`);
check("Bruno reserva la clase que arranca en 1 hora", lateBooking.rows[0].r?.status === "confirmed");
const lateId = lateBooking.rows[0]?.r?.id;
if (lateId) {
  await expectError(
    "no lo deja cancelar tan sobre la hora",
    `select public.cancel_booking('${lateId}')`,
    "TOO_LATE",
  );
}

console.log("\n▶ Vista pública de ocupación");
const occ = await db.query(`select count(*)::int as n, sum(booked_count)::int as total from public.session_occupancy`);
check("la vista devuelve conteos", occ.rows[0].n > 0, `${occ.rows[0].n} clases con reservas`);

console.log("\n▶ Seguridad (RLS): cada socio sólo ve sus propias reservas");
await loginAs(userB);
const comoSuperusuario = await db.query(`select count(*)::int as total from public.bookings`);
const deBruno = await db.query(
  `select count(*)::int as propias from public.bookings where user_id = $1`,
  [userB],
);

// Nos ponemos en los zapatos de un socio logueado (rol `authenticated`)
await db.exec(`set role authenticated;`);
const comoSocio = await db.query(`select count(*)::int as visibles from public.bookings`);
await db.exec(`reset role;`);

check(
  "el socio sólo ve sus reservas, no las de los demás",
  Number(comoSocio.rows[0].visibles) === Number(deBruno.rows[0].propias),
  `ve ${comoSocio.rows[0].visibles} y tiene ${deBruno.rows[0].propias} · en total hay ${comoSuperusuario.rows[0].total}`,
);
check(
  "no ve la tabla completa",
  Number(comoSocio.rows[0].visibles) < Number(comoSuperusuario.rows[0].total),
);
check("hay más de una reserva en la base para que la prueba tenga sentido",
  Number(comoSuperusuario.rows[0].total) > 1);

// ¿Y los horarios? Esos sí son públicos
await db.exec(`set role anon;`);
const horariosPublicos = await db.query(`select count(*)::int as n from public.sessions`);
const ocupacionPublica = await db.query(`select count(*)::int as n from public.session_occupancy`);
await db.exec(`reset role;`);
check("los horarios se ven sin estar logueado", Number(horariosPublicos.rows[0].n) > 0, `${horariosPublicos.rows[0].n} clases`);
check("la ocupación también (pero sólo el conteo)", Number(ocupacionPublica.rows[0].n) > 0, `${ocupacionPublica.rows[0].n} filas`);

console.log("\n▶ Generar más semanas (función del panel)");
// Sin usuario logueado = equivalente a correrlo desde el SQL Editor de Supabase
await db.exec(`delete from auth.current_user;`);
const generated = await db.query(`select public.generate_week_sessions(current_date + 28) as nuevas`);
const again = await db.query(`select public.generate_week_sessions(current_date + 28) as repetidas`);
check("genera clases nuevas", Number(generated.rows[0].nuevas) > 0, `${generated.rows[0].nuevas} clases`);
check("no duplica si se corre de nuevo", Number(again.rows[0].repetidas) === 0, `${again.rows[0].repetidas} repetidas`);

console.log("\n▶ Sólo el staff puede generar horarios");
await loginAs(userB);
await expectError(
  "un socio común no puede tocar los horarios",
  `select public.generate_week_sessions(current_date + 56)`,
  "AUTH",
);
await db.exec(`update public.profiles set role = 'admin' where id = '${userB}';`);
const asAdmin = await db.query(`select public.generate_week_sessions(current_date + 56) as n`);
check("el admin sí puede", Number(asAdmin.rows[0].n) > 0, `${asAdmin.rows[0].n} clases`);

console.log("\n▶ El rol del panel se puede leer con RLS (no sólo desde el SQL Editor)");
await db.exec(`set role authenticated;`);
try {
  const propio = await db.query(`select id, role from public.profiles where id = auth.uid()`);
  const permiso = await db.query(`select public.is_staff() as allowed`);
  check("el admin autenticado puede leer su rol desde profiles", propio.rows[0]?.role === "admin");
  check("is_staff reconoce al mismo admin", permiso.rows[0]?.allowed === true);
} finally {
  await db.exec(`reset role;`);
}
await loginAs(userA);
await db.exec(`set role authenticated;`);
try {
  const propio = await db.query(`select id, role from public.profiles where id = auth.uid()`);
  const permiso = await db.query(`select public.is_staff() as allowed`);
  check("el socio autenticado puede leer su propio perfil", propio.rows[0]?.role === "member");
  check("el socio no obtiene permisos de staff", permiso.rows[0]?.allowed === false);
  const ajeno = await db.query(`select id from public.profiles where id = $1`, [userB]);
  check("el socio no puede leer el perfil del admin", ajeno.rows.length === 0);
} finally {
  await db.exec(`reset role;`);
}
await loginAs(userB);

console.log("\n▶ Regresión del panel: is_staff=true pero el perfil no es visible");
const selfReadFix = readFileSync(`${REPO}/supabase/migrations/00012_profiles_self_read.sql`, "utf8");
const profilesBeforeFix = (await db.query(`select id, role from public.profiles order by id`)).rows;
const helperWasDefiner = (await db.query(`select prosecdef from pg_proc
  where oid = 'public.is_staff()'::regprocedure`)).rows[0].prosecdef;
// Fixture: un helper SECURITY DEFINER permite reproducir el true observado
// aunque la lectura directa esté oculta. No presupone la definición real
// de la función de producción y la migración no altera esta función.
await db.exec(`alter function public.is_staff() security definer;`);
// Simular una base con la política SELECT original ausente. El SQL del
// dueño sigue viendo admin, como en las capturas; authenticated no ve su fila.
await db.exec(`drop policy "perfil: leer el propio" on public.profiles;`);
await db.exec(`set role authenticated;`);
try {
  const observed = (await db.query(`
    select (select role::text from public.profiles where id = auth.uid()) as rol_visible,
           public.is_staff() as permiso_staff
  `)).rows[0];
  check("reproduce la captura: rol_visible=NULL y permiso_staff=true",
    observed.rol_visible === null && observed.permiso_staff === true, JSON.stringify(observed));
} finally {
  await db.exec(`reset role;`);
}
await db.exec(selfReadFix);
await db.exec(selfReadFix);
check("00012 es idempotente: una sola política de lectura propia",
  (await db.query(`select count(*)::int as n from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_select_own_authenticated'`)).rows[0].n === 1);
await db.exec(`set role authenticated;`);
try {
  const fixed = (await db.query(`
    select (select role::text from public.profiles where id = auth.uid()) as rol_visible,
           public.is_staff() as permiso_staff
  `)).rows[0];
  check("00012 corrige el caso reproducido: admin visible y permiso_staff=true",
    fixed.rol_visible === "admin" && fixed.permiso_staff === true);
  const others = await db.query(`select id from public.profiles where id <> auth.uid()`);
  check("la nueva política no concede lectura de perfiles ajenos", others.rows.length === 0);
} finally {
  await db.exec(`reset role;`);
}
await loginAs(userA);
await db.exec(`set role authenticated;`);
try {
  const self = (await db.query(`select role::text from public.profiles where id = auth.uid()`)).rows[0];
  check("con 00012 el member sigue leyendo sólo su perfil sin convertirse en admin", self?.role === "member");
  const other = await db.query(`select id from public.profiles where id = $1`, [userB]);
  check("con 00012 el member no puede leer el perfil del admin", other.rows.length === 0);
} finally {
  await db.exec(`reset role;`);
}
check("00012 no modifica perfiles ni roles",
  JSON.stringify((await db.query(`select id, role from public.profiles order by id`)).rows) === JSON.stringify(profilesBeforeFix));
check("00012 conserva RLS activado",
  (await db.query(`select relrowsecurity from pg_class where oid = 'public.profiles'::regclass`)).rows[0].relrowsecurity === true);
// Una política permisiva no debe anular restricciones explícitas existentes.
await db.exec(`create policy regression_restrictive on public.profiles as restrictive
  for select to authenticated using (false);`);
await db.exec(`set role authenticated;`);
try {
  const blocked = await db.query(`select id from public.profiles where id = auth.uid()`);
  check("00012 no elude una política RESTRICTIVE existente", blocked.rows.length === 0);
} finally {
  await db.exec(`reset role; drop policy regression_restrictive on public.profiles;`);
}
// Restaurar la política original para verificar coexistencia y permiso del staff.
await db.exec(`create policy "perfil: leer el propio" on public.profiles
  for select using (id = auth.uid() or public.is_staff());`);
await loginAs(userB);
await db.exec(`set role authenticated;`);
try {
  const staffRows = await db.query(`select id from public.profiles where id = $1`, [userA]);
  check("00012 conserva el acceso staff de la política original", staffRows.rows.length === 1);
} finally {
  await db.exec(`reset role;`);
}

if (!helperWasDefiner) await db.exec(`alter function public.is_staff() security invoker;`);

console.log("\n▶ Cerrar clases pasadas (ausentes)");
const closed = await db.query(`select public.close_past_sessions() as n`);
check("la función corre sin errores", typeof closed.rows[0].n === "number", `${closed.rows[0].n} marcadas`);


/* ------------------------------------------------------------
   La migración 00003 sobre una base que YA estaba en uso
   ------------------------------------------------------------
   Este es el caso real del gimnasio: el proyecto de Supabase ya
   tenía cargados los datos de ejemplo (9 disciplinas, 6 profes,
   4 planes) y además socios registrados con reservas hechas.

   Acá reconstruimos ese estado anterior y le aplicamos la
   migración, para confirmar dos cosas:
     · que deja los datos reales del gimnasio, y
     · que NO le borra nada a los socios.
   ------------------------------------------------------------ */

console.log("\n▶ Migración 00003 sobre una base que ya estaba en uso");

try {
  const vieja = new PGlite();
  await vieja.exec(STUBS);
  await vieja.exec(readFileSync(`${REPO}/supabase/migrations/00001_schema.sql`, "utf8"));

  // --- Reconstruimos cómo estaba la base antes de esta migración ---
  await vieja.exec(`
    -- Antes el precio era obligatorio y había un verde lima por defecto
    update public.plans set price = 0 where price is null;
    alter table public.plans alter column price set not null;
    alter table public.plans alter column price set default 0;

    insert into public.classes
      (id, slug, name_es, name_en, description_es, description_en,
       intensity, duration_min, capacity, color, sort_order)
    values
      ('cls_funcional', 'funcional', 'Funcional', 'Functional', 'x', 'x', 'high', 50, 20, '#cbf73f', 1),
      ('cls_spinning',  'spinning',  'Spinning',  'Spinning',   'x', 'x', 'high', 45, 24, '#cbf73f', 2),
      ('cls_yoga',      'yoga',      'Yoga',      'Yoga',       'x', 'x', 'low',  60, 18, '#cbf73f', 3),
      ('cls_boxeo',     'boxeo',     'Boxeo',     'Boxing',     'x', 'x', 'high', 60, 20, '#cbf73f', 4);

    insert into public.coaches
      (id, slug, name, role_es, role_en, specialties, initials, color, sort_order)
    values
      ('cch_diego', 'diego', 'Diego Falso', 'Coach', 'Coach', array['funcional','boxeo'], 'DF', '#cbf73f', 1),
      ('cch_sofia', 'sofia', 'Sofía Falsa', 'Coach', 'Coach', array['yoga'],              'SF', '#cbf73f', 2);

    insert into public.plans
      (id, slug, name_es, name_en, tagline_es, tagline_en, price, period,
       features_es, features_en, is_popular, sort_order)
    values
      ('pln_basico', 'basico', 'Básico', 'Basic', 'x', 'x', 25, 'month', array['x'], array['x'], false, 1),
      ('pln_full',   'full',   'Full',   'Full',  'x', 'x', 39, 'month', array['x'], array['x'], true,  2);
  `);

  // Clases viejas: una ya pasada, dos futuras (a una se anota un socio)
  await vieja.exec(`
    insert into public.sessions (id, class_id, starts_at, ends_at, capacity, room) values
      ('ses_pasada',  'cls_spinning',  now() - interval '10 days', now() - interval '10 days' + interval '45 min', 24, 'Sala Cycling'),
      ('ses_futura',  'cls_yoga',      now() + interval '3 days',  now() + interval '3 days'  + interval '60 min', 18, 'Salón Zen'),
      ('ses_ocupada', 'cls_funcional', now() + interval '4 days',  now() + interval '4 days'  + interval '50 min', 20, 'Salón A');
  `);

  const socio = (
    await vieja.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('socia@example.com', '{"full_name":"Socia Real"}'::jsonb) returning id`,
    )
  ).rows[0].id;
  await vieja.query(`update public.profiles set plan_id = 'pln_full' where id = $1`, [socio]);
  await vieja.query(
    `insert into public.bookings (session_id, user_id) values ('ses_ocupada', $1)`,
    [socio],
  );
  await vieja.exec(`
    insert into public.messages (name, email, message)
    values ('Andrea Solís', 'andrea.solis@example.com', 'consulta de ejemplo'),
           ('Clienta Real', 'real@example.com', 'hola, quiero info de boxeo');
  `);

  // --- Y ahora corremos la migración ---
  await vieja.exec(readFileSync(`${REPO}/supabase/migrations/00003_datos_reales.sql`, "utf8"));
  console.log("  ✅ 00003_datos_reales.sql se ejecutó sin errores");

  const r = async (sql) => (await vieja.query(sql)).rows[0];

  const GRILLA = `
    select count(*) as n
      from public.sessions s
      join public.classes c on c.id = s.class_id
     where c.is_active
       and s.status = 'scheduled'
       and s.starts_at >= date_trunc('week', now())`;

  const estado = await r(`
    select
      (select count(*) from public.classes where is_active) as activas,
      (select count(*) from public.coaches)                 as profes,
      (select count(*) from public.plans)                   as planes,
      (${GRILLA})                                           as grilla
  `);
  check("quedan 3 disciplinas activas", Number(estado.activas) === 3, `${estado.activas}`);
  check("se fueron los entrenadores inventados", Number(estado.profes) === 0, `${estado.profes}`);
  check("quedan 3 planes", Number(estado.planes) === 3, `${estado.planes}`);
  check("quedó cargada la grilla nueva de 4 semanas", Number(estado.grilla) === 36, `${estado.grilla}`);

  check(
    "ya no hay rastro del verde lima",
    Number((await r(`select count(*) as n from public.classes where color = '#cbf73f'`)).n) === 0,
  );
  check(
    "el plan de boxeo cuesta 20 y los otros dos quedan a consultar",
    Number((await r(`select price from public.plans where id = 'pln_boxeo'`)).price) === 20 &&
      Number((await r(`select count(*) as n from public.plans where price is null`)).n) === 2,
  );
  check(
    "los planes viejos ya no están",
    Number(
      (await r(`select count(*) as n from public.plans where id in ('pln_basico','pln_full')`)).n,
    ) === 0,
  );

  /* --- Lo importante: que no se haya perdido nada de los socios --- */
  check(
    "la cuenta de la socia sigue ahí",
    Number((await r(`select count(*) as n from public.profiles where id = '${socio}'`)).n) === 1,
  );
  check(
    "su reserva sigue ahí",
    Number(
      (await r(`select count(*) as n from public.bookings where user_id = '${socio}'`)).n,
    ) === 1,
  );
  check(
    "la clase que tenía reservada no se borró, se canceló",
    (await r(`select status::text as s from public.sessions where id = 'ses_ocupada'`)).s ===
      "cancelled",
  );
  check(
    "la clase ya pasada quedó intacta (es historial)",
    Number((await r(`select count(*) as n from public.sessions where id = 'ses_pasada'`)).n) === 1,
  );
  check(
    "la clase futura a la que nadie se anotó se borró",
    Number((await r(`select count(*) as n from public.sessions where id = 'ses_futura'`)).n) === 0,
  );
  check(
    "la disciplina con historial queda guardada pero desactivada",
    (await r(`select is_active from public.classes where id = 'cls_spinning'`)).is_active === false,
  );
  check(
    "la disciplina sin historial sí se borra",
    Number((await r(`select count(*) as n from public.classes where id = 'cls_yoga'`)).n) === 0,
  );
  check(
    "a la socia le quedó el plan vacío, no uno inexistente",
    (await r(`select plan_id from public.profiles where id = '${socio}'`)).plan_id === null,
  );
  check(
    "se borró la consulta de ejemplo pero no la de una clienta real",
    Number((await r(`select count(*) as n from public.messages`)).n) === 1 &&
      (await r(`select email from public.messages`)).email === "real@example.com",
  );

  /* --- Correrla dos veces tiene que dar lo mismo --- */
  await vieja.exec(readFileSync(`${REPO}/supabase/migrations/00003_datos_reales.sql`, "utf8"));
  const repetida = await r(`
    select
      (select count(*) from public.classes where is_active) as activas,
      (select count(*) from public.plans)                   as planes,
      (select count(*) from public.bookings)                as reservas,
      (${GRILLA})                                           as grilla
  `);
  check(
    "correrla de nuevo no cambia nada ni duplica clases",
    Number(repetida.activas) === 3 &&
      Number(repetida.planes) === 3 &&
      Number(repetida.reservas) === 1 &&
      Number(repetida.grilla) === 36,
    JSON.stringify(repetida),
  );

  /* --- Y el socio puede seguir reservando --- */
  await vieja.exec(`insert into auth.current_user values ('${socio}')`);
  const nueva = await vieja.query(
    `select public.book_session(
       (select id from public.sessions
         where starts_at > now() + interval '1 day' and status = 'scheduled'
         order by starts_at limit 1)) as r`,
  );
  check(
    "después de migrar se puede reservar una clase nueva",
    nueva.rows[0].r?.status === "confirmed",
    JSON.stringify(nueva.rows[0].r),
  );
} catch (error) {
  check("00003_datos_reales.sql se ejecuta sin errores", false, String(error.message ?? error).slice(0, 160));
}


/* ------------------------------------------------------------
   El archivo único que se pega en Supabase
   ------------------------------------------------------------
   `supabase/SETUP.sql` es el que la gente copia y pega en el SQL
   Editor. Acá lo probamos aparte, desde cero, para asegurarnos de
   que la unión de los dos archivos funciona igual de bien.
   ------------------------------------------------------------ */

console.log("\n▶ El archivo único supabase/SETUP.sql (lo que se pega en Supabase)");

try {
  const unico = new PGlite();
  await unico.exec(STUBS);
  await unico.exec(readFileSync(`${REPO}/supabase/SETUP.sql`, "utf8"));

  const resumen = (
    await unico.query(`
      select
        (select count(*) from public.classes)  as clases,
        (select count(*) from public.coaches)  as profes,
        (select count(*) from public.plans)    as planes,
        (select count(*) from public.sessions) as sesiones
    `)
  ).rows[0];

  check(
    "crea 16 tablas (8 base + 8 de Fase 1)",
    (
      await unico.query(
        `select count(*)::int as n from pg_tables where schemaname = 'public'`,
      )
    ).rows[0].n === 16,
  );
  check("carga 3 disciplinas", Number(resumen.clases) === 3);
  check("3 coaches cargados (seed de Fase 1)", Number(resumen.profes) === 3);
  check("carga 3 planes", Number(resumen.planes) === 3);
  check("carga 36 clases (4 semanas)", Number(resumen.sesiones) === 36, `${resumen.sesiones}`);

  const funciones = (
    await unico.query(`
      select count(*)::int as n
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('book_session', 'cancel_booking', 'generate_week_sessions',
                          'close_past_sessions', 'is_staff', 'handle_new_user')
    `)
  ).rows[0].n;
  check("crea las 6 funciones (reservar, cancelar, generar...)", funciones === 6, `${funciones}`);

  // Reserva de punta a punta usando sólo este archivo
  const socio = (
    await unico.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('prueba@example.com', '{"full_name":"Prueba"}'::jsonb) returning id`,
    )
  ).rows[0].id;
  await unico.exec(`insert into auth.current_user values ('${socio}')`);

  const clase = (
    await unico.query(
      `select id from public.sessions where starts_at > now() + interval '1 day' order by starts_at limit 1`,
    )
  ).rows[0].id;

  const reserva = await unico.query(`select public.book_session($1) as r`, [clase]);
  check("permite reservar", reserva.rows[0].r?.status === "confirmed");

  const cancelacion = await unico.query(`select public.cancel_booking($1) as r`, [
    reserva.rows[0].r?.id,
  ]);
  check("permite cancelar", cancelacion.rows[0].r?.status === "cancelled");
} catch (error) {
  check("SETUP.sql se ejecuta sin errores", false, String(error.message ?? error).slice(0, 120));
}

console.log(`\n${failures === 0 ? "🎉 Todo pasó" : `⚠️  ${failures} prueba(s) fallaron`}\n`);
process.exit(failures === 0 ? 0 : 1);
