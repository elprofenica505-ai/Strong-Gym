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
  extra: ["supabase/migrations/00072_grilla_horarios.sql"],
});
ok("00072 se aplica sobre 00071 sin error", true);

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

const activated = await adminRpc("admin_set_schedule_slot_active", [zumbaId, true, 4]);
const zumbaSessions = (
  await asAdmin(
    `select count(*)::int as n from public.sessions
      where class_id='cls_zumba' and starts_at >= now() + interval '1 day'`,
  )
).rows[0].n;
ok("Activar el horario crea sus sesiones de las próximas semanas",
  activated.created_sessions >= 1 && zumbaSessions >= 3);
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
await db.query(
  `insert into public.coaches(id, slug, name, specialties, is_active)
   values ($1, 'coach-test', 'Profe de prueba', array['boxeo','zumba'], true)`,
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

console.log(`\n${checks} comprobaciones PASS (OP-05 grilla administrable, 00072)`);
