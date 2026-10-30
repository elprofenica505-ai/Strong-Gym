// OP-05 (quinta etapa): sesiones sueltas y días especiales (00078).
// Verifica que se pueda crear, mover y cancelar una clase con fecha sin tocar
// la grilla semanal, que no se pueda sobrevender ni pisar una sala o un
// entrenador, que cancelar no borre nada, y que caja, entrenador y anónimo no
// puedan hacerlo.
import { createTestDb } from "./helpers/sql-test-db.mjs";
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
    "supabase/migrations/00077_disciplinas_administrables.sql",
    "supabase/migrations/00078_sesiones_sueltas.sql",
  ],
});
ok("00078 se aplica sobre 00077 sin error", true);

const row = async (query, args = []) => (await db.query(query, args)).rows[0];
const makeUser = async (email, role) => {
  const id = (
    await row(
      "insert into auth.users(email, raw_user_meta_data) values ($1,$2) returning id",
      [email, JSON.stringify({ full_name: "EJEMPLO " + email })],
    )
  ).id;
  if (role)
    await db.query("update public.profiles set role=$2::public.user_role where id=$1", [
      id,
      role,
    ]);
  return id;
};
const admin = await makeUser("admin@test.invalid", "admin");
const cashier = await makeUser("caja@test.invalid", "cashier");
const trainer = await makeUser("profe@test.invalid", "trainer");
const member = await makeUser("socio@test.invalid", "member");

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
const rpc = async (actor, aal, name, args) =>
  (
    await as(
      actor,
      aal,
      `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`,
      args,
    )
  ).rows[0].value;
const adminRpc = (name, args) => rpc(admin, "aal2", name, args);

const addDays = (value, days) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const today = (await row("select (now() at time zone 'America/Managua')::date::text as d")).d;
const day = (offset) => addDays(today, offset);

// Una disciplina activa propia para no depender de cómo venga la semilla.
const zumba = await adminRpc("admin_save_class", [
  null,
  "zumba-sueltas",
  "Zumba de prueba",
  "Test Zumba",
  "Clase de prueba.",
  "Test class.",
  "medium",
  60,
  20,
  "#e11d48",
  150,
]);
ok("La disciplina de prueba queda activa", zumba.class.is_active === true);

const save = (over = {}) => {
  const base = {
    0: null, // id
    1: "cls_zumba_sueltas", // disciplina
    2: day(5), // fecha
    3: "10:00", // hora
    4: 60, // duración
    5: 15, // cupo
    6: "Salón de baile", // sala
    7: null, // entrenador
    8: "Día especial de Zumba", // nota
    9: null, // fecha y hora esperadas
  };
  const merged = { ...base, ...over };
  return Object.keys(merged)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => merged[key]);
};

// 1. Crear una clase suelta.
const loose = await adminRpc("admin_save_session", save());
ok("Una clase suelta se crea fuera de la grilla",
  loose.ok === true && loose.action === "alta" && !!loose.session.id);
ok("Queda marcada como suelta, con su nota de día especial",
  loose.session.origin === "manual" &&
  loose.session.note === "Día especial de Zumba" &&
  loose.session.status === "scheduled");
const created = await row(
  "select to_char(starts_at at time zone 'America/Managua','YYYY-MM-DD HH24:MI') as local, capacity, room, note from public.sessions where id=$1",
  [loose.session.id],
);
ok("La fecha y la hora se interpretan en la hora del gimnasio",
  created.local === `${day(5)} 10:00` &&
  created.capacity === 15 &&
  created.room === "Salón de baile" &&
  created.note === "Día especial de Zumba");
ok("La clase suelta no toca la grilla semanal",
  (await row("select count(*)::int as n from public.class_schedule_slots")).n === 9);

const listed = await adminRpc("admin_schedule_sessions", [day(0), day(10)]);
const listedRow = listed.sessions.find((s) => s.id === loose.session.id);
ok("La lista del período trae la clase suelta con lo que tiene encima",
  !!listedRow &&
  listedRow.class_name === "Zumba de prueba" &&
  listedRow.booked === 0 &&
  listedRow.origin === "manual" &&
  listedRow.is_past === false);
ok("La lista dice qué período muestra", listed.from === day(0) && listed.to === day(10));

// 2. No se duplica ni se pisa la sala.
await denied("La misma clase a la misma hora no se repite",
  adminRpc("admin_save_session", save()), /SESSION_EXISTS/);

const other = await adminRpc("admin_save_class", [
  null,
  "cross-sueltas",
  "Cross de prueba",
  "Test Cross",
  "Clase de prueba.",
  "Test class.",
  "high",
  60,
  20,
  "#0ea5e9",
  151,
]);
await denied("Dos clases en la misma sala y a la misma hora chocan",
  adminRpc("admin_save_session", save({ 1: "cls_cross_sueltas", 8: null })),
  /SCHEDULE_CONFLICT/);
const otherRoom = await adminRpc("admin_save_session", save({
  1: "cls_cross_sueltas",
  6: "Área de pesas",
  8: null,
}));
ok("En otra sala sí se puede",
  otherRoom.ok === true && otherRoom.session.origin === "manual");

// 3. Fechas y datos imposibles.
await denied("Una clase en el pasado no se crea",
  adminRpc("admin_save_session", save({ 2: day(-1), 3: "10:00" })), /PAST_SESSION/);
await denied("Una fecha inventada se rechaza",
  adminRpc("admin_save_session", save({ 2: "2026-13-45" })), /INVALID_DATE/);
await denied("Una hora inventada se rechaza",
  adminRpc("admin_save_session", save({ 2: day(6), 3: "25:99" })), /INVALID_TIME/);
await denied("Una duración imposible se rechaza",
  adminRpc("admin_save_session", save({ 2: day(6), 4: 5 })), /INVALID_DURATION/);
await denied("Un cupo imposible se rechaza",
  adminRpc("admin_save_session", save({ 2: day(6), 5: 0 })), /INVALID_CAPACITY/);
await denied("Una sala sin nombre se rechaza",
  adminRpc("admin_save_session", save({ 2: day(6), 6: " " })), /INVALID_ROOM/);
await denied("Una nota demasiado larga se rechaza",
  adminRpc("admin_save_session", save({ 2: day(6), 8: "x".repeat(201) })), /INVALID_NOTE/);
await denied("Una disciplina que no existe se rechaza",
  adminRpc("admin_save_session", save({ 1: "cls_nada", 2: day(6) })), /INVALID_CLASS/);

// 4. Disciplina apagada: no se crean clases nuevas, pero las que hay se editan.
await adminRpc("admin_set_class_active", ["cls_cross_sueltas", false, true]);
await denied("No se crea una clase de una disciplina apagada",
  adminRpc("admin_save_session", save({ 1: "cls_cross_sueltas", 2: day(7), 6: "Área de pesas", 8: null })),
  /CLASS_INACTIVE/);
const editedOff = await adminRpc("admin_save_session", save({
  0: otherRoom.session.id,
  1: "cls_cross_sueltas",
  6: "Área de pesas",
  8: null,
}));
ok("Una clase que ya existía se puede corregir aunque la disciplina esté apagada",
  editedOff.ok === true);
await adminRpc("admin_set_class_active", ["cls_cross_sueltas", true, false]);

// 5. Reservas: no se puede bajar el cupo por debajo de lo reservado.
await db.query(
  "insert into public.bookings (session_id, user_id, status) values ($1,$2,'confirmed'), ($1,$3,'confirmed')",
  [loose.session.id, member, cashier],
);
await denied("Bajar el cupo por debajo de lo reservado se rechaza",
  adminRpc("admin_save_session", save({ 0: loose.session.id, 5: 1 })), /CAPACITY_BELOW_BOOKINGS/);
const widened = await adminRpc("admin_save_session", save({ 0: loose.session.id, 5: 25, 4: 75 }));
ok("Se puede ampliar el cupo y cambiar la duración",
  widened.action === "edicion" &&
  widened.changed_fields.includes("capacity") &&
  widened.changed_fields.includes("duration_min") &&
  widened.session.capacity === 25);

// 6. Mover una clase con reservas: las reservas siguen a su clase.
const moved = await adminRpc("admin_save_session", save({
  0: loose.session.id,
  2: day(6),
  3: "11:30",
  5: 25,
  4: 75,
}));
ok("Mover la clase con reservas encima está permitido",
  moved.action === "edicion" && moved.changed_fields.includes("starts_at"));
const movedRow = await row(
  "select to_char(starts_at at time zone 'America/Managua','YYYY-MM-DD HH24:MI') as local, (select count(*)::int from public.bookings where session_id=$1 and status='confirmed') as reservas from public.sessions where id=$1",
  [loose.session.id],
);
ok("La clase se movió de verdad y las reservas se conservan",
  movedRow.local === `${day(6)} 11:30` && movedRow.reservas === 2);

const noop = await adminRpc("admin_save_session", save({
  0: loose.session.id,
  2: day(6),
  3: "11:30",
  5: 25,
  4: 75,
}));
ok("Guardar sin cambios lo dice en vez de inventar una edición",
  noop.action === "sin_cambios" && noop.changed_fields.length === 0);

await denied("Si otro administrador ya movió la clase, se avisa en vez de pisarlo",
  adminRpc("admin_save_session", save({
    0: loose.session.id,
    2: day(6),
    3: "11:30",
    5: 25,
    4: 75,
    9: `${day(6)}T08:00`,
  })),
  /STALE_SESSION/);

// 7. Un día cerrado no recibe clases sueltas.
await adminRpc("admin_save_schedule_block", [
  null,
  "class",
  "cls_zumba_sueltas",
  null,
  `${day(12)}T00:00`,
  `${day(13)}T00:00`,
  "holiday",
  "Feriado de prueba",
  null,
  true,
]);
await denied("Una clase en un día bloqueado se rechaza",
  adminRpc("admin_save_session", save({ 2: day(12), 3: "09:00" })), /BLOCKED/);

// 8. Cancelar una clase con reservas pide confirmación y no borra nada.
await denied("Cancelar con reservas encima pide confirmación primero",
  adminRpc("admin_cancel_session", [loose.session.id, "Se enfermó el entrenador", false]),
  /CONFIRM_REQUIRED/);
await denied("Cancelar sin motivo se rechaza",
  adminRpc("admin_cancel_session", [loose.session.id, "  ", false]), /INVALID_REASON/);
const cancelled = await adminRpc("admin_cancel_session", [
  loose.session.id,
  "Se enfermó el entrenador",
  true,
]);
ok("Al confirmar, la clase queda cancelada con su motivo",
  cancelled.ok === true && cancelled.changed === true && cancelled.cancelled_bookings === 2);
const cancelledRow = await row(
  "select status, cancel_reason, cancelled_by, cancelled_at is not null as cuando, (select count(*)::int from public.bookings where session_id=$1 and status='cancelled' and cancel_reason='Se enfermó el entrenador') as reservas from public.sessions where id=$1",
  [loose.session.id],
);
ok("La clase no se borra: queda cancelada con motivo, autor y fecha",
  cancelledRow.status === "cancelled" &&
  cancelledRow.cancel_reason === "Se enfermó el entrenador" &&
  cancelledRow.cancelled_by === admin &&
  cancelledRow.cuando === true);
ok("Las reservas tampoco se borran: quedan canceladas con el mismo motivo",
  cancelledRow.reservas === 2);
const twice = await adminRpc("admin_cancel_session", [loose.session.id, "Otra vez", true]);
ok("Cancelar dos veces no cambia nada", twice.changed === false && twice.cancelled_bookings === 0);
await denied("Una clase cancelada no se edita",
  adminRpc("admin_save_session", save({ 0: loose.session.id, 2: day(6), 3: "11:30" })),
  /SESSION_CANCELLED/);
const stillListed = (await adminRpc("admin_schedule_sessions", [day(0), day(10)])).sessions.find(
  (s) => s.id === loose.session.id,
);
ok("La clase cancelada sigue apareciendo en la lista con su motivo",
  !!stillListed && stillListed.status === "cancelled" &&
  stillListed.cancel_reason === "Se enfermó el entrenador");
ok("Una clase cancelada ya no cuenta reservas activas",
  stillListed.booked === 0);

// 9. Períodos imposibles.
await denied("Un período al revés se rechaza",
  adminRpc("admin_schedule_sessions", [day(10), day(0)]), /INVALID_RANGE/);
await denied("Un período demasiado largo se rechaza",
  adminRpc("admin_schedule_sessions", [day(0), day(400)]), /RANGE_TOO_LONG/);

// 10. Permisos por rol.
await denied("Caja no puede ver las clases del período",
  rpc(cashier, "aal2", "admin_schedule_sessions", [day(0), day(10)]), /AUTH/);
await denied("Caja no puede crear una clase suelta",
  rpc(cashier, "aal2", "admin_save_session", save({ 2: day(8) })), /AUTH/);
await denied("Un entrenador no puede cancelar clases",
  rpc(trainer, "aal2", "admin_cancel_session", [otherRoom.session.id, "motivo", true]), /AUTH/);
await denied("Sin sesión iniciada no se puede crear una clase",
  as(null, null, "select public.admin_save_session(null,'cls_zumba_sueltas','2030-01-01','10:00',60,10,'Sala X',null,null,null)"),
  /AUTH|permission denied/);

console.log(`\n${checks} comprobaciones PASS (OP-05 sesiones sueltas, 00078)`);
