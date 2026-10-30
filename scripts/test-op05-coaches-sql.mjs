// OP-05 (sexta etapa): entrenadores administrables y asignación con choques
// (00079). Verifica el catálogo, el alta y la edición, que las disciplinas se
// elijan de una lista y no por texto libre, el interruptor de alta/baja con
// bitácora, el paso del entrenador del horario a las clases ya creadas con
// detección de choques, la paridad entre previsualización y generación, y que
// la misma migración funcione en el esquema productivo de `coaches` (sin
// `slug`, `name` ni `sort_order`, con `full_name` y `specialty`).
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

const extra = [
  "supabase/migrations/00072_grilla_horarios.sql",
  "supabase/migrations/00073_grilla_nombre_entrenador.sql",
  "supabase/migrations/00074_generar_sesiones_preview.sql",
  "supabase/migrations/00075_bloqueos_calendario.sql",
  "supabase/migrations/00076_horario_no_genera_solo.sql",
  "supabase/migrations/00077_disciplinas_administrables.sql",
  "supabase/migrations/00078_sesiones_sueltas.sql",
  "supabase/migrations/00079_entrenadores_admin.sql",
];

const db = await createTestDb({ extra });
ok("00079 se aplica sobre 00078 sin error", true);

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
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
const monday = await row(
  "select date_trunc('week', (now() at time zone 'America/Managua')::date::timestamp)::date::text as d",
).then((r) => r.d);
// Se trabaja sobre una semana futura, para no pelear con clases ya pasadas.
const week = addDays(monday, 7);

// El calendario de prueba arranca limpio: lo que se mide acá es la asignación,
// no lo que traiga la semilla.
await db.exec(`
  delete from public.bookings;
  delete from public.sessions;
  delete from public.schedule_blocks;
  delete from public.class_schedule_slots;
`);

// 1. Alta de un entrenador con las disciplinas elegidas de la lista.
const created = await adminRpc("admin_save_coach", [
  null,
  "Karla Méndez",
  "Zumba y bailoterapia",
  ["zumba", "musculacion"],
]);
ok(
  "Un entrenador nuevo se crea activo, con identificador propio",
  created.ok === true &&
    created.action === "alta" &&
    created.coach.is_active === true &&
    created.coach.id.startsWith("coa_"),
);
ok(
  "Guarda nombre, especialidad y las disciplinas que dicta",
  created.coach.full_name === "Karla Méndez" &&
    created.coach.specialty === "Zumba y bailoterapia" &&
    created.coach.specialties.includes("zumba") &&
    created.coach.specialties.includes("musculacion"),
);
const coachId = created.coach.id;

let catalog = await adminRpc("admin_coaches_catalog", []);
const listed = catalog.coaches.find((c) => c.id === coachId);
ok(
  "El catálogo trae al entrenador con sus disciplinas y lo que tiene encima",
  !!listed &&
    listed.specialties.length === 2 &&
    listed.slots_active === 0 &&
    listed.sessions_upcoming === 0,
);
ok(
  "El catálogo trae las disciplinas para elegir, sin escribir texto libre",
  catalog.classes.some((c) => c.slug === "zumba") &&
    catalog.classes.some((c) => c.slug === "boxeo"),
);

// 2. Editar: cambia datos y deja bitácora sin valores.
const edited = await adminRpc("admin_save_coach", [
  coachId,
  "Karla Méndez Rivas",
  "Zumba y bailoterapia",
  ["zumba"],
]);
ok(
  "Editar devuelve qué campos cambiaron",
  edited.action === "edicion" &&
    edited.changed_fields.includes("full_name") &&
    edited.changed_fields.includes("specialties"),
);
ok(
  "Los cambios quedan guardados y el identificador no cambia",
  edited.coach.full_name === "Karla Méndez Rivas" &&
    edited.coach.specialties.length === 1 &&
    edited.coach.specialties[0] === "zumba" &&
    edited.coach.id === coachId,
);

const noop = await adminRpc("admin_save_coach", [
  coachId,
  "Karla Méndez Rivas",
  "Zumba y bailoterapia",
  ["zumba"],
]);
ok(
  "Guardar sin cambios no ensucia la bitácora",
  noop.action === "sin_cambios" && noop.changed_fields.length === 0,
);

const audit = (await adminRpc("admin_coaches_catalog", [])).audit;
ok(
  "La bitácora registra el alta y la edición",
  audit.filter((a) => a.coach_id === coachId).length === 2 &&
    audit.some((a) => a.action === "alta"),
);
ok(
  "La bitácora guarda nombres de campos, nunca valores",
  audit.every((a) => a.changed_fields.every((f) => /^[a-z_]+$/.test(f))) &&
    audit.every((a) => typeof a.changed_by_name === "string"),
);

// 3. Validaciones.
await denied(
  "Un nombre demasiado corto se rechaza",
  adminRpc("admin_save_coach", [null, "Ka", "", []]),
  /INVALID_NAME/,
);
await denied(
  "Una especialidad larguísima se rechaza",
  adminRpc("admin_save_coach", [null, "Profe Largo", "x".repeat(81), []]),
  /INVALID_SPECIALTY/,
);
await denied(
  "Una disciplina que no existe se rechaza en vez de guardarse",
  adminRpc("admin_save_coach", [null, "Profe Inventado", "", ["karate"]]),
  /INVALID_CLASS_SLUG/,
);
await denied(
  "Más de doce disciplinas se rechaza",
  adminRpc("admin_save_coach", [
    null,
    "Profe Todo",
    "",
    ["boxeo", "zumba", "musculacion", "boxeo", "zumba", "musculacion", "boxeo", "zumba", "musculacion", "boxeo", "zumba", "musculacion", "boxeo"],
  ]),
  /TOO_MANY_SPECIALTIES/,
);
await denied(
  "Repetir el nombre se rechaza",
  adminRpc("admin_save_coach", [null, "Karla Méndez Rivas", "", []]),
  /COACH_EXISTS/,
);
await denied(
  "Editar un entrenador que no existe avisa sin inventar",
  adminRpc("admin_save_coach", ["coa_nadie", "Profe Nadie", "", []]),
  /NOT_FOUND/,
);

// 4. El interruptor de alta/baja y su bitácora.
const off = await adminRpc("admin_set_coach_active", [coachId, false, true]);
ok("Se puede dar de baja sin borrar al entrenador", off.changed === true && off.is_active === false);
ok(
  "La baja queda en la bitácora",
  (await adminRpc("admin_coaches_catalog", [])).audit.some(
    (a) => a.coach_id === coachId && a.action === "baja",
  ),
);
ok(
  "El entrenador sigue existiendo después de la baja",
  (await row("select count(*)::int as n from public.coaches where id=$1", [coachId])).n === 1,
);
await denied(
  "Cambiar el estado con datos viejos se rechaza",
  adminRpc("admin_set_coach_active", [coachId, true, true]),
  /STALE_ACTIVE_STATE/,
);
const on = await adminRpc("admin_set_coach_active", [coachId, true, false]);
ok("Se puede volver a activar", on.changed === true && on.is_active === true);

// 5. Un horario fijo de boxeo, sin entrenador, y sus clases ya creadas.
const slot = await adminRpc("admin_save_schedule_slot", [
  null,
  "cls_boxeo",
  2,
  "06:00",
  60,
  20,
  "Área de prueba entrenadores",
  null,
  true,
  4,
]);
ok("Se crea un horario fijo sin entrenador y no inventa clases", slot.created_sessions === 0);
const slotId = slot.slot_id;

const beforeGen = await adminRpc("admin_preview_schedule", [week, 3]);
const generated = await adminRpc("admin_apply_schedule", [week, 3]);
ok("Se generan tres clases sin entrenador", generated.created === 3);
ok(
  "La previsualización dice que esas clases van sin entrenador",
  beforeGen.items
    .filter((i) => i.slot_id === slotId && i.status === "create")
    .every((i) => i.coach_id === null && i.coach_auto === false),
);

// 6. Se le pone entrenador al horario: el plan dice a cuántas clases afecta.
await adminRpc("admin_save_schedule_slot", [
  slotId,
  "cls_boxeo",
  2,
  "06:00",
  60,
  20,
  "Área de prueba entrenadores",
  coachId,
  true,
  4,
]);
const plan = await adminRpc("admin_slot_coach_plan", [slotId]);
ok(
  "El plan dice cuántas clases se asignarían y con quién",
  plan.totals.sessions === 3 &&
    plan.totals.assign === 3 &&
    plan.totals.conflict === 0 &&
    plan.coach_id === coachId,
);
ok(
  "El plan no escribe nada: las clases siguen sin entrenador",
  (
    await row(
      "select count(*)::int as n from public.sessions where coach_id is null and status='scheduled' and starts_at > now()",
    )
  ).n === 3,
);

const applied = await adminRpc("admin_apply_slot_coach", [slotId]);
ok(
  "Aplicar asigna el entrenador a las clases ya creadas",
  applied.ok === true && applied.assigned === 3 && applied.remaining === 0,
);
ok(
  "Aplicar dos veces no vuelve a asignar",
  (await adminRpc("admin_apply_slot_coach", [slotId])).assigned === 0,
);
ok(
  "La asignación no toca las reservas",
  (await row("select count(*)::int as n from public.bookings")).n === 0,
);
const persisted = await row(
  "select count(*)::int as n from public.sessions where coach_id=$1 and status='scheduled'",
  [coachId],
);
ok("Las clases quedaron con el entrenador escrito en la base", persisted.n === 3);

// 7. Choques: la grilla no deja poner al mismo entrenador en dos clases a la vez.
await denied(
  "La grilla rechaza al mismo entrenador en dos clases a la misma hora",
  adminRpc("admin_save_schedule_slot", [
    null,
    "cls_musculacion",
    2,
    "06:00",
    60,
    20,
    "Otra sala de prueba",
    coachId,
    true,
    4,
  ]),
  /SCHEDULE_CONFLICT/,
);

// 8. Choques al pasar el entrenador a clases ya creadas: se saltean, no se pisan.
const firstSession = await row(
  `select id, starts_at, ends_at from public.sessions
    where coach_id = $1 and status = 'scheduled'
    order by starts_at limit 1`,
  [coachId],
);
await db.query("update public.sessions set coach_id = null where id = $1", [
  firstSession.id,
]);
await db.query(
  `insert into public.sessions (class_id, coach_id, starts_at, ends_at, capacity, room)
   values ('cls_musculacion', $1, $2, $3, 10, 'Sala libre')`,
  [coachId, firstSession.starts_at, firstSession.ends_at],
);
const withClash = await adminRpc("admin_slot_coach_plan", [slotId]);
ok(
  "El plan detecta el choque del entrenador y no lo cuenta para asignar",
  withClash.totals.sessions === 3 &&
    withClash.totals.same === 2 &&
    withClash.totals.conflict === 1 &&
    withClash.totals.assign === 0,
);
const appliedWithClash = await adminRpc("admin_apply_slot_coach", [slotId]);
ok(
  "Aplicar no pisa el choque: asigna 0 y avisa 1 salteada",
  appliedWithClash.assigned === 0 && appliedWithClash.skipped_conflict === 1,
);
ok(
  "La clase que chocaba sigue sin entrenador en vez de quedar duplicado",
  (
    await row(
      `select count(*)::int as n from public.sessions where id = $1 and coach_id is null`,
      [firstSession.id],
    )
  ).n === 1,
);

// 9. Paridad: el plan resuelve el entrenador por disciplina igual que el generador.
const zumbaSlot = await adminRpc("admin_save_schedule_slot", [
  null,
  "cls_zumba",
  3,
  "07:00",
  60,
  20,
  "Salón de baile de prueba",
  null,
  true,
  4,
]);
const autoPlan = await adminRpc("admin_preview_schedule", [week, 1]);
const autoItem = autoPlan.items.find(
  (i) => i.slot_id === zumbaSlot.slot_id && i.status === "create",
);
ok(
  "La previsualización resuelve el entrenador por sus disciplinas",
  !!autoItem && autoItem.coach_id === coachId && autoItem.coach_auto === true,
);
ok(
  "La previsualización muestra el nombre de ese entrenador",
  autoItem.coach_name === "Karla Méndez Rivas",
);
const autoApplied = await adminRpc("admin_apply_schedule", [week, 1]);
ok("Se genera la clase de Zumba", autoApplied.created === 1);
ok(
  "La clase generada lleva el mismo entrenador que mostró la previsualización",
  (
    await row(
      `select count(*)::int as n from public.sessions
        where class_id = 'cls_zumba' and coach_id = $1 and status = 'scheduled'`,
      [coachId],
    )
  ).n === 1,
);

// 10. Un entrenador apagado no se asigna.
await adminRpc("admin_set_coach_active", [coachId, false, true]);
await denied(
  "Un entrenador dado de baja no se puede poner en un horario",
  adminRpc("admin_save_schedule_slot", [
    null,
    "cls_boxeo",
    5,
    "08:00",
    60,
    20,
    "Área de prueba entrenadores",
    coachId,
    true,
    4,
  ]),
  /INVALID_COACH/,
);
await adminRpc("admin_set_coach_active", [coachId, true, false]);

// 11. El horario sin entrenador no se puede aplicar.
await db.query("update public.class_schedule_slots set coach_id = null where id = $1", [
  slotId,
]);
await denied(
  "Sin entrenador en el horario no hay nada que pasar a las clases",
  adminRpc("admin_apply_slot_coach", [slotId]),
  /NO_COACH/,
);

// 12. Permisos por rol.
await denied(
  "Caja no puede ver el catálogo de entrenadores",
  rpc(cashier, "aal2", "admin_coaches_catalog", []),
  /AUTH/,
);
await denied(
  "Caja no puede crear entrenadores",
  rpc(cashier, "aal2", "admin_save_coach", [null, "Profe de Caja", "", []]),
  /AUTH/,
);
await denied(
  "Un entrenador no puede darse de baja a sí mismo",
  rpc(trainer, "aal2", "admin_set_coach_active", [coachId, false, null]),
  /AUTH/,
);
await denied(
  "Sin sesión iniciada no se puede pasar el entrenador a las clases",
  as(
    null,
    null,
    `select public.admin_apply_slot_coach('${slotId}'::uuid)`,
  ),
  /AUTH|permission denied/,
);
ok(
  "La bitácora no es legible desde la API sin ser administrador",
  (
    await row(
      "select has_table_privilege('anon', 'public.coach_audit', 'select') as anon_select",
    )
  ).anon_select === false,
);

// 13. La misma migración funciona con el esquema productivo de `coaches`
//     (sin `slug`, `name` ni `sort_order`).
const prodDb = await createTestDb({ extra });
await prodDb.exec(`
  alter table public.coaches drop column slug;
  alter table public.coaches drop column name;
  alter table public.coaches drop column sort_order;
`);
await prodDb.query(
  "insert into auth.users(email, raw_user_meta_data) values ('admin@prod.invalid', $1)",
  [JSON.stringify({ full_name: "ADMIN PRUEBA" })],
);
await prodDb.query("update public.profiles set role='admin'");
const prodAdmin = (
  await prodDb.query("select id from public.profiles limit 1")
).rows[0].id;

async function prodRpc(name, args) {
  await prodDb.exec("reset role; delete from auth.current_user");
  await prodDb.query("insert into auth.current_user values($1,$2)", [prodAdmin, "aal2"]);
  await prodDb.exec("set role authenticated");
  try {
    return (
      await prodDb.query(
        `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`,
        args,
      )
    ).rows[0].value;
  } finally {
    await prodDb.exec("reset role; delete from auth.current_user");
  }
}

const prodCreated = await prodRpc("admin_save_coach", [
  null,
  "Douglas García",
  "Boxeo y acondicionamiento",
  ["boxeo"],
]);
ok(
  "En el esquema productivo también se crea el entrenador",
  prodCreated.ok === true && prodCreated.coach.full_name === "Douglas García",
);
const prodRow = (
  await prodDb.query("select full_name, specialty, specialties from public.coaches")
).rows[0];
ok(
  "Queda guardado en las columnas que la base productiva sí tiene",
  prodRow.full_name === "Douglas García" &&
    prodRow.specialty === "Boxeo y acondicionamiento" &&
    prodRow.specialties.includes("boxeo"),
);
const prodEdited = await prodRpc("admin_save_coach", [
  prodCreated.coach.id,
  "Douglas García López",
  "Boxeo",
  ["boxeo"],
]);
ok(
  "En el esquema productivo también se edita",
  prodEdited.action === "edicion" &&
    prodEdited.coach.full_name === "Douglas García López",
);
const prodCatalog = await prodRpc("admin_coaches_catalog", []);
ok(
  "El catálogo funciona sin las columnas viejas",
  prodCatalog.coaches.length === 1 &&
    prodCatalog.coaches[0].full_name === "Douglas García López",
);

console.log(`\n${checks} comprobaciones PASS (OP-05 entrenadores, 00079)`);
