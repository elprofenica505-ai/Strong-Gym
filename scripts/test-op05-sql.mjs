// OP-05 (primera etapa): la grilla semanal administrable.
// Verifica que el calendario salga de datos y no de una plantilla fija, que
// guardar un horario cree sus sesiones sin duplicar, que se rechacen choques
// de sala y de entrenador, que anular no borre nada y que sólo administración
// con MFA pueda tocar la grilla.
import { createTestDb, sqlFile } from "./helpers/sql-test-db.mjs";
import assert from "node:assert/strict";

let checks = 0;
const ok = (label, cond) => {
  assert.ok(cond, label);
  checks += 1;
  console.log(`✅ ${label}`);
};
const denied = async (label, promise, pattern) => {
  await assert.rejects(promise, pattern, label);
  ok(label, true);
};

const db = await createTestDb({
  extra: [
    "supabase/migrations/00072_grilla_horarios.sql",
    "supabase/migrations/00073_grilla_nombre_entrenador.sql",
    "supabase/migrations/00074_generar_sesiones_preview.sql",
    "supabase/migrations/00075_bloqueos_calendario.sql",
    "supabase/migrations/00076_horario_no_genera_solo.sql",
  ],
});
ok("00072 a 00076 se aplican sobre 00071 sin error", true);

const row = async (query, args = []) => (await db.query(query, args)).rows[0];
const makeUser = async (email, role) => {
  const id = (
    await row(
      "insert into auth.users(email, raw_user_meta_data) values ($1,$2) returning id",
      [email, JSON.stringify({ full_name: "EJEMPLO " + email })],
    )
  ).id;
  if (role) await db.query("update public.profiles set role=$2::public.user_role where id=$1", [id, role]);
  return id;
};
const admin = await makeUser("admin@test.invalid", "admin");
const cashier = await makeUser("caja@test.invalid", "cashier");
const trainer = await makeUser("profe@test.invalid", "trainer");

async function as(actor, aal, query, args = []) {
  await db.exec("reset role; delete from auth.current_user");
  if (actor) await db.query("insert into auth.current_user values($1,$2)", [actor, aal]);
  await db.exec("set role authenticated");
  try {
    return await db.query(query, args);
  } finally {
    await db.exec("reset role; delete from auth.current_user");
  }
}
const asAdmin = (q, a = []) => as(admin, "aal2", q, a);
const rpc = async (actor, aal, name, args) =>
  (await as(actor, aal, `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args))
    .rows[0].value;
const adminRpc = (name, args) => rpc(admin, "aal2", name, args);

const todayRaw = (await row("select public.plan_local_today() as d")).d;
const today = todayRaw instanceof Date
  ? todayRaw.toISOString().slice(0, 10)
  : String(todayRaw).slice(0, 10);
const addDays = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const monday = (() => {
  const d = new Date(`${today}T12:00:00Z`);
  const delta = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - delta);
  return d.toISOString().slice(0, 10);
})();
const addWeeks = (n) => {
  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
};

const slugs = async () =>
  (
    await asAdmin(
      `select c.slug, count(*)::int as n from public.sessions s
         join public.classes c on c.id = s.class_id
        group by c.slug order by c.slug`,
    )
  ).rows;

// 1. La semilla conserva exactamente el Boxeo que ya había.
// La tabla queda cerrada a la API: se lee como dueño de la base, igual que
// haría una consulta de mantenimiento.
const seed = await db.query("select day_of_week, to_char(start_time,'HH24:MI') as h from public.class_schedule_slots order by day_of_week, start_time");
ok("La grilla arranca con los 9 horarios de Boxeo que ya existían", seed.rows.length === 9);
ok("Los horarios son martes, miércoles y jueves a las 06:00, 17:30 y 20:00",
  seed.rows.every((s) => [1, 2, 3].includes(s.day_of_week) && ["06:00", "17:30", "20:00"].includes(s.h)));

// 2. El generador lee la grilla y no duplica.
const week8 = addWeeks(8);
const firstRun = await adminRpc("generate_week_sessions", [week8]);
ok("Una semana vacía se llena con las 9 sesiones de la grilla", firstRun === 9);
ok("Repetir la generación no duplica sesiones",
  (await adminRpc("generate_week_sessions", [week8])) === 0);

// 3. Un horario nuevo entra al calendario sin tocar código.
const zumba = await adminRpc("admin_save_schedule_slot", [
  null, "cls_zumba", 2, "18:00", 60, 20, "Salón de clases", null, false, 4,
]);
ok("Guardar un horario lo devuelve en la grilla",
  zumba.slots.some((s) => s.class_slug === "zumba" && s.day_of_week === 2 && s.start_time === "18:00"));
const zumbaId = zumba.slot_id;
ok("Un horario guardado como inactivo no crea sesiones",
  zumba.created_sessions === 0 &&
  (await row("select count(*)::int as n from public.sessions where class_id='cls_zumba'")).n === 0);

// 3b. Guardar o reactivar un horario no escribe en el calendario (00076).
const activated = await adminRpc("admin_set_schedule_slot_active", [zumbaId, true, 4]);
ok("Reactivar un horario no crea clases por su cuenta",
  activated.created_sessions === 0 &&
  (await row("select count(*)::int as n from public.sessions where class_id='cls_zumba'")).n === 0);
const zumbaPass = await adminRpc("admin_apply_schedule", [monday, 4]);
ok("Las clases se crean recién al pasar la semana al calendario",
  zumbaPass.created >= 3 &&
  zumbaPass.items.some((i) => i.class_id === "cls_zumba") &&
  zumbaPass.totals.create === 0);
const zumbaSessions = (
  await asAdmin(
    `select count(*)::int as n from public.sessions
      where class_id='cls_zumba' and starts_at >= now() + interval '1 day'`,
  )
).rows[0].n;
ok("El calendario queda con las clases de Zumba de las próximas semanas",
  zumbaSessions >= 3);
const zumbaFirst = (
  await asAdmin(
    `select room,
            extract(epoch from (ends_at - starts_at))/60 as mins,
            extract(isodow from (starts_at at time zone 'America/Managua')) as dow,
            to_char(starts_at at time zone 'America/Managua', 'HH24:MI') as h
       from public.sessions where class_id='cls_zumba' order by starts_at limit 1`,
  )
).rows[0];
ok("La sesión creada cae el día y la hora del horario (miércoles 18:00)",
  Number(zumbaFirst.dow) === 3 && zumbaFirst.h === "18:00");
ok("La sesión creada usa la sala y la duración del horario",
  zumbaFirst.room === "Salón de clases" && Number(zumbaFirst.mins) === 60);

// 4. Choques: misma sala y mismo entrenador no se permiten.
await denied("Dos clases a la misma hora en la misma sala se rechazan",
  adminRpc("admin_save_schedule_slot", [null, "cls_boxeo", 2, "18:30", 60, 20, "Salón de clases", null, true, 1]),
  /SCHEDULE_CONFLICT/);
const coachId = "coach_test";
// Igual que en producción: el nombre vive en `full_name`. `name` se deja
// vacío a propósito para comprobar que la grilla no depende de esa columna.
await db.query(
  `insert into public.coaches(id, slug, name, full_name, specialties, is_active)
   values ($1, 'coach-test', '', 'Profe Uno', array['boxeo','zumba'], true)`,
  [coachId],
);
await adminRpc("admin_save_schedule_slot", [
  zumbaId, "cls_zumba", 2, "18:00", 60, 20, "Salón de clases", coachId, true, 1,
]);
await denied("El mismo entrenador en otra sala a la misma hora se rechaza",
  adminRpc("admin_save_schedule_slot", [null, "cls_boxeo", 2, "18:30", 60, 20, "Área de boxeo", coachId, true, 1]),
  /SCHEDULE_CONFLICT/);
const free = await adminRpc("admin_save_schedule_slot", [
  null, "cls_boxeo", 5, "09:00", 60, 20, "Área de boxeo", null, true, 1,
]);
ok("Un horario sin choque en otro día se guarda", free.slot_id !== zumbaId);
ok("Guardar un horario activo tampoco crea clases solo",
  free.created_sessions === 0);

// 4b. El nombre del entrenador no depende de que la columna se llame `name`.
const named = await adminRpc("admin_schedule_board", []);
ok("La grilla muestra el nombre del entrenador desde full_name",
  named.slots.some((s) => s.coach_id === coachId && s.coach_name === "Profe Uno"));
ok("La lista de entrenadores usa el mismo nombre",
  named.coaches.some((c) => c.id === coachId && c.name === "Profe Uno"));
ok("Los especialidades se devuelven como lista",
  Array.isArray(named.coaches.find((c) => c.id === coachId)?.specialties));

// 5. Anular no borra: la fila y las sesiones ya creadas siguen.
const beforeOff = (await row("select count(*)::int as n from public.sessions where class_id='cls_zumba'")).n;
const off = await adminRpc("admin_set_schedule_slot_active", [zumbaId, false, 4]);
ok("Anular el horario lo deja inactivo sin borrar la fila",
  off.slots.filter((s) => s.id === zumbaId).every((s) => s.is_active === false));
ok("Anular no borra las sesiones ya creadas",
  beforeOff > 0 &&
  (await row("select count(*)::int as n from public.sessions where class_id='cls_zumba'")).n === beforeOff);
const nextWeek = addWeeks(5);
await adminRpc("generate_week_sessions", [nextWeek]);
ok("Una semana nueva no recibe la clase anulada", (
  await row(
    `select count(*)::int as n from public.sessions
      where class_id='cls_zumba'
        and starts_at >= ($1::date::timestamp at time zone 'America/Managua')
        and starts_at < (($1::date + 7)::timestamp at time zone 'America/Managua')`,
    [nextWeek],
  )
).n === 0);

// 6. Disciplina inactiva: no se generan sesiones nuevas.
await db.query("update public.classes set is_active = false where id = 'cls_zumba'");
const afterClassOff = await adminRpc("generate_week_sessions", [addWeeks(6)]);
const zumbaWeek6 = (
  await asAdmin(
    `select count(*)::int as n from public.sessions
      where class_id='cls_zumba'
        and starts_at >= ($1::date::timestamp at time zone 'America/Managua')
        and starts_at < (($1::date + 7)::timestamp at time zone 'America/Managua')`,
    [addWeeks(6)],
  )
).rows[0].n;
ok("Una disciplina desactivada no se programa", zumbaWeek6 === 0 && afterClassOff >= 0);
await db.query("update public.classes set is_active = true where id = 'cls_zumba'");
await adminRpc("admin_set_schedule_slot_active", [zumbaId, true, 1]);

// 7. Permisos por rol.
await denied("Caja no puede ver la grilla para editarla", rpc(cashier, "aal2", "admin_schedule_board", []), /AUTH/);
await denied("Un entrenador no puede ver la grilla para editarla", rpc(trainer, "aal2", "admin_schedule_board", []), /AUTH/);
await denied("Caja no puede guardar horarios",
  rpc(cashier, "aal2", "admin_save_schedule_slot", [null, "cls_boxeo", 4, "07:00", 60, 20, "Área de boxeo", null, true, 1]),
  /AUTH/);
await denied("Un entrenador no puede anular horarios",
  rpc(trainer, "aal2", "admin_set_schedule_slot_active", [zumbaId, false, 1]), /AUTH/);
await denied("Sin sesión iniciada no se puede leer la grilla",
  as(null, null, "select public.admin_schedule_board()"), /AUTH/);

// 8. Validaciones de datos.
await denied("Un día fuera de la semana se rechaza",
  adminRpc("admin_save_schedule_slot", [null, "cls_boxeo", 9, "07:00", 60, 20, "Área de boxeo", null, true, 1]),
  /INVALID_DAY/);
await denied("Una duración imposible se rechaza",
  adminRpc("admin_save_schedule_slot", [null, "cls_boxeo", 4, "07:00", 5, 20, "Área de boxeo", null, true, 1]),
  /INVALID_DURATION/);
await denied("Una sala vacía se rechaza",
  adminRpc("admin_save_schedule_slot", [null, "cls_boxeo", 4, "07:00", 60, 20, " ", null, true, 1]),
  /INVALID_ROOM/);
await denied("Una disciplina inexistente se rechaza",
  adminRpc("admin_save_schedule_slot", [null, "cls_nada", 4, "07:00", 60, 20, "Área de boxeo", null, true, 1]),
  /INVALID_CLASS/);
await denied("Editar un horario que no existe avisa sin inventar",
  adminRpc("admin_save_schedule_slot", ["00000000-0000-4000-8000-000000000000", "cls_boxeo", 4, "07:00", 60, 20, "Área de boxeo", null, true, 1]),
  /NOT_FOUND/);

// 9. La pantalla muestra semanas y disciplinas para elegir.
const board = await adminRpc("admin_schedule_board", []);
ok("La pantalla trae disciplinas y entrenadores para elegir",
  board.classes.length >= 3 && board.coaches.length >= 1);
ok("La pantalla muestra las próximas cuatro semanas", board.weeks.length === 4);
ok("Las próximas semanas ya tienen sesiones programadas", board.weeks.every((w) => w.scheduled > 0));

// 10. Generar con previsualización (00074): mirar antes de escribir.
const totalSessions = async () =>
  (await row("select count(*)::int as n from public.sessions")).n;
const activeSlots = (
  await row(
    `select count(*)::int as n from public.class_schedule_slots s
       join public.classes c on c.id = s.class_id
      where s.is_active and c.is_active`,
  )
).n;

const emptyWeek = addWeeks(20);
const previewEmpty = await adminRpc("admin_preview_schedule", [emptyWeek, 1]);
ok("La previsualización de una semana vacía marca lo que se crearía",
  previewEmpty.totals.create === activeSlots && previewEmpty.created === 0);
ok("Previsualizar no crea ninguna sesión",
  (await totalSessions()) === (await totalSessions()) &&
  (await row(
    `select count(*)::int as n from public.sessions
      where starts_at >= ($1::date::timestamp at time zone 'America/Managua')
        and starts_at < (($1::date + 7)::timestamp at time zone 'America/Managua')`,
    [emptyWeek],
  )).n === 0);
const plusDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
ok("La previsualización devuelve el rango pedido",
  previewEmpty.from === emptyWeek &&
  previewEmpty.to === plusDays(emptyWeek, 6) &&
  previewEmpty.weeks === 1);

const applied = await adminRpc("admin_apply_schedule", [emptyWeek, 1]);
ok("Generar crea exactamente lo que se previsualizó",
  applied.created === previewEmpty.totals.create);
const appliedAgain = await adminRpc("admin_apply_schedule", [emptyWeek, 1]);
ok("Generar dos veces no duplica nada", appliedAgain.created === 0);
ok("La segunda previsualización solo ve duplicados",
  appliedAgain.totals.create === 0 && appliedAgain.totals.duplicate === activeSlots);

const previewDup = await adminRpc("admin_preview_schedule", [emptyWeek, 1]);
ok("Repetir la previsualización sobre una semana llena da todo duplicado",
  previewDup.totals.duplicate === activeSlots && previewDup.totals.create === 0);

// 10b. Motivos: choque de sala y de entrenador se explican, no se crean.
const weekFuture = addWeeks(22);
const dowDate = (from, dow) => {
  const d = new Date(`${from}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dow);
  return d.toISOString().slice(0, 10);
};
const martes = dowDate(weekFuture, 1);
const miercoles = dowDate(weekFuture, 2);
await db.query(
  `insert into public.sessions (class_id, coach_id, starts_at, ends_at, capacity, room)
   values ('cls_boxeo', null,
           ($1::date + time '06:30') at time zone 'America/Managua',
           ($1::date + time '07:30') at time zone 'America/Managua', 20, 'Área de boxeo')`,
  [martes],
);
await db.query(
  `insert into public.sessions (class_id, coach_id, starts_at, ends_at, capacity, room)
   values ('cls_boxeo', $2,
           ($1::date + time '18:00') at time zone 'America/Managua',
           ($1::date + time '19:00') at time zone 'America/Managua', 20, 'Otra sala')`,
  [miercoles, coachId],
);
const previewConflict = await adminRpc("admin_preview_schedule", [weekFuture, 1]);
ok("Un choque de sala se detecta y se explica antes de crear",
  previewConflict.totals.room_conflict >= 1 &&
  previewConflict.items.some((i) => i.status === "room_conflict" && i.room === "Área de boxeo"));
ok("Un choque de entrenador se detecta y se explica antes de crear",
  previewConflict.totals.coach_conflict >= 1 &&
  previewConflict.items.some((i) => i.status === "coach_conflict" && i.coach_id === coachId));
const conflictApplied = await adminRpc("admin_apply_schedule", [weekFuture, 1]);
ok("Generar no crea lo que choca con una sesión existente",
  conflictApplied.created === previewConflict.totals.create);

// 10c. Una disciplina desactivada no se programa y el motivo se ve.
await db.query("update public.classes set is_active = false where id = 'cls_zumba'");
const previewInactive = await adminRpc("admin_preview_schedule", [addWeeks(24), 1]);
ok("La previsualización avisa que la disciplina está desactivada",
  previewInactive.totals.inactive >= 1 &&
  previewInactive.items.some((i) => i.status === "inactive" && i.class_id === "cls_zumba"));
ok("Nada desactivado se crea al generar",
  (await adminRpc("admin_apply_schedule", [addWeeks(24), 1])).items
    .every((i) => i.class_id !== "cls_zumba" || i.status !== "create"));
await db.query("update public.classes set is_active = true where id = 'cls_zumba'");

// 10d. Nunca se crean sesiones pasadas, aunque se pida un rango viejo.
const previewPast = await adminRpc("admin_preview_schedule", [addDays(-28), 1]);
ok("Un rango viejo se marca como pasado",
  previewPast.totals.past >= 1 && previewPast.totals.create === 0);
ok("Generar un rango viejo no crea sesiones pasadas",
  (await adminRpc("admin_apply_schedule", [addDays(-28), 1])).created === 0);

// 10e. Permisos y validaciones.
await denied("Caja no puede previsualizar la generación",
  rpc(cashier, "aal2", "admin_preview_schedule", [addWeeks(26), 1]), /AUTH/);
await denied("Caja no puede generar sesiones",
  rpc(cashier, "aal2", "admin_apply_schedule", [addWeeks(26), 1]), /AUTH/);
await denied("Sin sesión iniciada no se puede generar",
  as(null, null, "select public.admin_apply_schedule(date '2030-01-07', 1)"), /AUTH|permission denied/);
await denied("Más de ocho semanas se rechaza",
  adminRpc("admin_preview_schedule", [addWeeks(26), 9]), /INVALID_WEEKS/);
await denied("Cero semanas se rechaza",
  adminRpc("admin_apply_schedule", [addWeeks(26), 0]), /INVALID_WEEKS/);
const defaultFrom = await adminRpc("admin_preview_schedule", [null, 1]);
ok("Sin fecha usa el lunes de la semana en curso",
  defaultFrom.from === monday && defaultFrom.weeks === 1);

// 11. Bloqueos y cierres (00075).
const closeWeek = addWeeks(30);
const closeTuesday = plusDays(closeWeek, 1);
const closeWednesday = plusDays(closeWeek, 2);
const dt = (date, time) => `${date}T${time}`;
const daySessions = async (date, extra = "true") =>
  (await row(
    `select count(*)::int as n from public.sessions
      where ${extra}
        and starts_at >= ($1::date::timestamp at time zone 'America/Managua')
        and starts_at < (($1::date + 1)::timestamp at time zone 'America/Managua')`,
    [date],
  )).n;

await adminRpc("admin_apply_schedule", [closeWeek, 1]);
ok("La semana del cierre queda programada antes de bloquearla",
  (await daySessions(closeTuesday, "status = 'scheduled'")) === 3);

const previewBlock = await adminRpc("admin_preview_schedule_block", [
  "gym", null, null, dt(closeTuesday, "00:00"), dt(closeTuesday, "23:59"), null,
]);
ok("Un cierre de un día muestra las tres sesiones que toca",
  previewBlock.session_count === 3 &&
  previewBlock.sessions.every((s) => s.class_name === "Boxeo"));
ok("El cierre avisa cuántas reservas hay encima", previewBlock.booking_count === 0);

// Una reserva encima obliga a confirmar antes de cancelar.
const firstSession = previewBlock.sessions[0].id;
const clientId = await makeUser("socio@test.invalid", "member");
await db.query(
  "insert into public.bookings(session_id, user_id, status) values ($1,$2,'confirmed')",
  [firstSession, clientId],
);
const previewWithBooking = await adminRpc("admin_preview_schedule_block", [
  "gym", null, null, dt(closeTuesday, "00:00"), dt(closeTuesday, "23:59"), null,
]);
ok("Con una reserva encima, el cierre avisa y pide confirmación",
  previewWithBooking.booking_count === 1 && previewWithBooking.action === "cancel");
await denied("Sin confirmar no se cancela una clase con reservas",
  adminRpc("admin_save_schedule_block", [
    null, "gym", null, null, dt(closeTuesday, "00:00"), dt(closeTuesday, "23:59"),
    "holiday", "Feriado nacional", null, false,
  ]), /CONFIRM_REQUIRED/);

const closed = await adminRpc("admin_save_schedule_block", [
  null, "gym", null, null, dt(closeTuesday, "00:00"), dt(closeTuesday, "23:59"),
  "holiday", "Feriado nacional", null, true,
]);
ok("Confirmar el cierre cancela las tres sesiones del día", closed.cancelled_sessions === 3);
ok("Las sesiones canceladas no se borran, quedan con su estado",
  (await daySessions(closeTuesday, "status = 'cancelled'")) === 3);
const cancelledBooking = await row(
  "select status, cancel_reason, cancelled_by from public.bookings where user_id = $1",
  [clientId],
);
ok("La reserva queda cancelada con el motivo escrito y quién la canceló",
  cancelledBooking.status === "cancelled" &&
  cancelledBooking.cancel_reason === "Feriado nacional" &&
  cancelledBooking.cancelled_by === admin);

// 11b. Lo bloqueado no se programa ni se vuelve a crear.
const blockWeek = addWeeks(34);
const blockMonday = blockWeek;
await adminRpc("admin_save_schedule_block", [
  null, "gym", null, null, dt(blockMonday, "00:00"), dt(plusDays(blockMonday, 6), "23:59"),
  "maintenance", "Pintura del salón", null, true,
]);
const planBlocked = await adminRpc("admin_preview_schedule", [blockWeek, 1]);
ok("La previsualización explica que todo está bloqueado",
  planBlocked.totals.blocked === activeSlots && planBlocked.totals.create === 0 &&
  planBlocked.items.some((i) => i.status === "blocked"));
ok("Generar una semana bloqueada no crea nada",
  (await adminRpc("admin_apply_schedule", [blockWeek, 1])).created === 0 &&
  (await daySessions(plusDays(blockWeek, 1), "true")) === 0);
ok("El generador de semanas tampoco crea lo bloqueado",
  (await adminRpc("generate_week_sessions", [blockWeek])) === 0);

// 11c. La lista de bloqueos y levantar sin resucitar.
const blocksList = await adminRpc("admin_schedule_blocks", []);
ok("La lista muestra los bloqueos activos con su motivo",
  blocksList.length === 2 &&
  blocksList.every((b) => b.is_active) &&
  blocksList.some((b) => b.reason_kind === "holiday" && b.reason === "Feriado nacional") &&
  blocksList.some((b) => b.reason_kind === "maintenance" && b.cancelled_sessions === 0));
const maintenance = blocksList.find((b) => b.reason_kind === "maintenance");
const lifted = await adminRpc("admin_lift_schedule_block", [maintenance.id]);
ok("Levantar el bloqueo lo deja inactivo sin borrarlo",
  lifted.blocks.length === 2 &&
  lifted.blocks.find((b) => b.id === maintenance.id).is_active === false);
ok("Levantar el bloqueo no resucita las sesiones canceladas",
  (await daySessions(closeTuesday, "status = 'scheduled'")) === 0);
ok("Después de levantarlo, la semana se puede generar de nuevo",
  (await adminRpc("admin_apply_schedule", [blockWeek, 1])).created === activeSlots);

// 11d. Bloqueo de una disciplina: no toca las demás.
const zumbaClosed = await adminRpc("admin_save_schedule_block", [
  null, "class", "cls_zumba", null, dt(closeWednesday, "00:00"), dt(closeWednesday, "23:59"),
  "vacation", "Vacaciones de la instructora", null, true,
]);
ok("El bloqueo de una disciplina cancela solo esa clase",
  zumbaClosed.cancelled_sessions === 1 &&
  (await daySessions(closeWednesday, "status = 'scheduled' and class_id = 'cls_boxeo'")) === 3);

// 11e. Bloqueo de un entrenador con sustituto: reasigna, no cancela.
await db.query(
  `insert into public.coaches(id, slug, name, full_name, specialties, is_active)
   values ('coach_sub', 'coach-sub', '', 'Profe Suplente', array['boxeo'], true)`,
);
const coachWeek = addWeeks(36);
const coachTuesday = plusDays(coachWeek, 1);
await adminRpc("admin_apply_schedule", [coachWeek, 1]);
await db.query(
  `update public.sessions set coach_id = $2
    where class_id = 'cls_boxeo' and status = 'scheduled'
      and starts_at >= ($1::date::timestamp at time zone 'America/Managua')
      and starts_at < (($1::date + 1)::timestamp at time zone 'America/Managua')`,
  [coachTuesday, coachId],
);
const substitutePreview = await adminRpc("admin_preview_schedule_block", [
  "coach", null, coachId, dt(coachTuesday, "00:00"), dt(coachTuesday, "23:59"), "coach_sub",
]);
ok("Con sustituto, el bloqueo avisa que reasigna en vez de cancelar",
  substitutePreview.action === "reassign" && substitutePreview.session_count === 3);
const substituted = await adminRpc("admin_save_schedule_block", [
  null, "coach", null, coachId, dt(coachTuesday, "00:00"), dt(coachTuesday, "23:59"),
  "sick", "Reposo médico", "coach_sub", true,
]);
ok("El sustituto toma las clases y no se cancela ninguna sesión",
  substituted.reassigned_sessions === 3 && substituted.cancelled_sessions === 0);
ok("Las sesiones quedan a cargo del sustituto",
  (await daySessions(coachTuesday, "status = 'scheduled' and coach_id = 'coach_sub'")) === 3);

// 11f. Validaciones y permisos.
await denied("Un bloqueo con fin anterior al inicio se rechaza",
  adminRpc("admin_preview_schedule_block", [
    "gym", null, null, dt(closeTuesday, "23:00"), dt(closeTuesday, "01:00"), null,
  ]), /INVALID_RANGE/);
await denied("Un bloqueo sin motivo válido se rechaza",
  adminRpc("admin_save_schedule_block", [
    null, "gym", null, null, dt(addWeeks(38), "00:00"), dt(addWeeks(38), "23:59"),
    "fiesta", "Cumpleaños", null, true,
  ]), /INVALID_REASON/);
await denied("Un sustituto en un cierre general se rechaza",
  adminRpc("admin_save_schedule_block", [
    null, "gym", null, null, dt(addWeeks(38), "00:00"), dt(addWeeks(38), "23:59"),
    "other", "Motivo de prueba", "coach_sub", true,
  ]), /INVALID_SUBSTITUTE/);
await denied("El mismo sustituto que el bloqueado se rechaza",
  adminRpc("admin_preview_schedule_block", [
    "coach", null, coachId, dt(addWeeks(38), "00:00"), dt(addWeeks(38), "23:59"), coachId,
  ]), /INVALID_SUBSTITUTE/);
await denied("Caja no puede ver ni cargar bloqueos",
  rpc(cashier, "aal2", "admin_schedule_blocks", []), /AUTH/);
await denied("Caja no puede cerrar el gimnasio",
  rpc(cashier, "aal2", "admin_save_schedule_block", [
    null, "gym", null, null, dt(addWeeks(38), "00:00"), dt(addWeeks(38), "23:59"),
    "holiday", "Feriado", null, true,
  ]), /AUTH/);
await denied("Un entrenador no puede cerrar el gimnasio",
  rpc(trainer, "aal2", "admin_save_schedule_block", [
    null, "gym", null, null, dt(addWeeks(38), "00:00"), dt(addWeeks(38), "23:59"),
    "holiday", "Feriado", null, true,
  ]), /AUTH/);

console.log(`\n${checks} comprobaciones PASS (OP-05 grilla administrable, 00072)`);
