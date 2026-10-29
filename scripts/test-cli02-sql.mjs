// CLI-02: categoría automática por vigencia real.
// Verifica que dos clientes con las mismas visitas ya no queden en la misma
// categoría si uno tiene el mes pagado y el otro está vencido, que las reglas
// se puedan cambiar sin código y que la decisión manual del administrador
// quede auditada.
import { createTestDb, sqlFile } from "./helpers/sql-test-db.mjs";
import assert from "node:assert/strict";

let checks = 0;
const ok = (label, cond) => {
  assert.ok(cond, label);
  checks += 1;
  console.log(`✅ ${label}`);
};

const db = await createTestDb();
await db.exec(sqlFile("supabase/migrations/00070_categorias_automaticas.sql"));
ok("00070 se aplica sobre 00069 sin error", true);
await db.exec(sqlFile("supabase/migrations/00071_directorio_categoria_en_vivo.sql"));
ok("00071 se aplica sobre 00070 sin error", true);

const row = async (query, args = []) => (await db.query(query, args)).rows[0];
const makeUser = async (email, role) => {
  const id = (await row("insert into auth.users(email, raw_user_meta_data) values ($1,$2) returning id", [
    email,
    JSON.stringify({ full_name: "EJEMPLO " + email }),
  ])).id;
  if (role) await db.query("update public.profiles set role=$2::public.user_role where id=$1", [id, role]);
  return id;
};
const admin = await makeUser("admin@test.invalid", "admin");
const cashier = await makeUser("caja@test.invalid", "cashier");
const trainer = await makeUser("entrenador@test.invalid", "trainer");

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
const rpc = async (name, args) =>
  (await asAdmin(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value;
const denied = async (label, promise, pattern) => {
  await assert.rejects(promise, pattern, label);
  ok(label, true);
};

// Clientes de prueba: Ana (mes pagado), Luis (sin vigencia, 3 visitas) y
// Marta (sin vigencia, una visita).
const makeClient = async (name) =>
  (await row("insert into gym_clients(full_name, status) values ($1,'active') returning id", [name])).id;
const ana = await makeClient("ANA EJEMPLO");
const luis = await makeClient("LUIS EJEMPLO");
const marta = await makeClient("MARTA EJEMPLO");
const todayRaw = (await row("select public.plan_local_today() as d")).d;
const today = todayRaw instanceof Date ? todayRaw.toISOString().slice(0, 10) : String(todayRaw).slice(0, 10);

const visits = async (client, days) => {
  for (const d of days) {
    await db.query(
      "insert into client_visits(client_id, local_day, source) values ($1, $2, 'manual') on conflict do nothing",
      [client, d],
    );
  }
};
const dayAgo = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

await visits(luis, [dayAgo(2), dayAgo(9), dayAgo(20)]);
await visits(marta, [dayAgo(4)]);
await visits(ana, [dayAgo(3), dayAgo(11), dayAgo(21)]);

// Ana paga el mes de gimnasio: un segmento real de 30 días con fechas.
const pay = async (client) =>
  db.query(
    `insert into payment_plans(client_id, plan_id, access, started_on, expires_on, price_paid, currency, request_id, source)
     values ($1, 'pln_gimnasio', 'gym', $2::date, $2::date + 29, 560, 'NIO', gen_random_uuid(), 'movement')`,
    [client, today],
  );
await pay(ana);

const categoryOf = async (client) => (await rpc("client_category", [client])).category;

// 1. La diferencia que antes no existía.
ok("Ana, con el mes de gimnasio vigente, es Familia", (await categoryOf(ana)) === "familia");
ok("Luis, sin vigencia y con 3 visitas, es Amigo", (await categoryOf(luis)) === "amigo");
ok("Marta, sin vigencia y una visita, es Común", (await categoryOf(marta)) === "comun");
ok("Ana y Luis ya no comparten categoría aunque tengan visitas parecidas",
  (await categoryOf(ana)) !== (await categoryOf(luis)));

const anaData = await rpc("client_category", [ana]);
ok("La ficha explica el motivo de la categoría", /gimnasio vigente/.test(anaData.reason));
ok("La categoría informa los días comprados", anaData.validity_days === 30);
ok("La vigencia ya no sale del plan asignado (membership_source)", anaData.membership_source === "payment_plans");

// 2. La compra de producto distingue Strong Gym de Familia.
const product = (await row(
  "insert into products(name, category, price) values ('AGUA EJEMPLO','bebidas',25) returning id",
)).id;
await db.query(
  `insert into stock_movements(product_id, kind, qty, unit_price, client_id, created_at)
   values ($1, 'venta', -1, 25, $2, now())`,
  [product, ana],
);
ok("Con el mes vigente y una compra, Ana pasa a Strong Gym", (await categoryOf(ana)) === "strong_gym");

// 3. Al vencer, la categoría cambia sola (el bug original).
await db.query(
  "update payment_plans set started_on = started_on - 60, expires_on = expires_on - 60 where client_id = $1",
  [ana],
);
ok("Al vencer el mes, Ana deja de ser Strong Gym", (await categoryOf(ana)) !== "strong_gym");
ok("Vencida y con 3 visitas, Ana queda Amiga", (await categoryOf(ana)) === "amigo");

// 4. Las reglas son datos: cambiar el umbral cambia el resultado sin código.
const rules = (await rpc("admin_category_rules", [])).rules;
const conCinco = rules.map((r) => (r.category === "amigo" ? { ...r, visits_min: 5 } : r));
await rpc("admin_save_category_rules", [conCinco]);
ok("Subir el mínimo de visitas a 5 mueve a Ana a Común", (await categoryOf(ana)) === "comun");
ok("Guardar reglas deja historial", (await row("select count(*)::int as n from category_rules_history")).n === 1);

const conPrioridad = conCinco.map((r) =>
  r.category === "strong_gym" ? { ...r, requires_purchase_window_days: null } : r,
);
await rpc("admin_save_category_rules", [conPrioridad]);
await pay(ana);
ok("Quitar la exigencia de compra hace que el mes vigente alcance para Strong Gym",
  (await categoryOf(ana)) === "strong_gym");

// 5. La decisión manual del administrador gana sobre el cálculo y se audita.
const manual = await rpc("crm_set_client_category", [ana, "comun", "Acuerdo con el dueño"]);
ok("El administrador fija la categoría a mano", manual.category === "comun");
const afterManual = await rpc("client_category", [ana]);
ok("La categoría fijada gana sobre el cálculo", afterManual.category === "comun" && afterManual.source === "manual");
ok("La ficha guarda el motivo de la decisión manual", afterManual.manual_reason === "Acuerdo con el dueño");
ok("La decisión manual queda en la bitácora del cliente",
  (await row("select count(*)::int as n from client_events where client_id=$1 and action='category_override_set'", [ana])).n === 1);

await rpc("crm_clear_client_category", [ana, "Volver al cálculo automático"]);
ok("Liberar la decisión manual vuelve al cálculo", (await rpc("client_category", [ana])).source === "auto");
ok("La liberación también queda auditada",
  (await row("select count(*)::int as n from client_events where client_id=$1 and action='category_override_cleared'", [ana])).n === 1);

// 6. Recalcular guarda la categoría y registra solo los cambios reales.
await rpc("admin_save_category_rules", [rules]);
const applied = await rpc("client_category_apply", [null]);
ok("El recálculo revisa a todos los clientes", applied.reviewed >= 3);
ok("El recálculo guarda la categoría calculada",
  (await row("select category_auto from gym_clients where id=$1", [luis])).category_auto === "amigo");
const again = await rpc("client_category_apply", [null]);
ok("Repetir el recálculo no duplica eventos", again.changed === 0);

// 7. Permisos: caja y entrenador no cambian reglas ni categorías.
await denied("La caja no puede fijar la categoría de un cliente",
  as(cashier, "aal2", "select public.crm_set_client_category($1,'comun','Intento de caja')", [luis]), /AUTH/);
await denied("La caja no puede leer las reglas",
  as(cashier, "aal2", "select public.admin_category_rules()"), /AUTH/);
await denied("El entrenador no puede guardar reglas",
  as(trainer, "aal2", "select public.admin_save_category_rules($1::jsonb)", [JSON.stringify(rules)]), /AUTH/);
await denied("El administrador sin segundo factor no cambia la categoría",
  as(admin, "aal1", "select public.crm_set_client_category($1,'comun','Prueba sin MFA')", [luis]), /AUTH/);

// 8. Validaciones del guardado.
await denied("Tres reglas en lugar de cuatro se rechazan",
  rpc("admin_save_category_rules", [rules.slice(0, 3)]), /INVALID_RULES/);
await denied("La reserva tiene que ser Común",
  rpc("admin_save_category_rules", [rules.map((r) => (r.category === "familia" ? { ...r, is_fallback: true } : r))]),
  /INVALID_FALLBACK/);
await denied("Una categoría desconocida se rechaza",
  rpc("admin_save_category_rules", [rules.map((r) => (r.category === "amigo" ? { ...r, category: "vip" } : r))]),
  /INVALID_CATEGORY/);
await denied("Una razón demasiado corta se rechaza",
  rpc("crm_set_client_category", [luis, "comun", "ok"]), /INVALID_REASON/);
await denied("Una categoría manual desconocida se rechaza",
  rpc("crm_set_client_category", [luis, "vip", "Prueba de categoría"]), /INVALID_CATEGORY/);

// 9. Nada se borra: los segmentos y las reglas previas siguen ahí.
ok("Los cobros y vigencias siguen intactos",
  (await row("select count(*)::int as n from payment_plans where client_id=$1", [ana])).n >= 2);
ok("El historial conserva las versiones anteriores de las reglas",
  (await row("select count(*)::int as n from category_rules_history")).n >= 2);

// 10. El directorio filtra por la categoría calculada.
const directory = await rpc("crm_directory", ["", "amigo", 0]);
ok("El directorio encuentra a los Amigo por categoría calculada",
  directory.rows.some((r) => r.id === luis));
ok("Cada fila del directorio informa si la categoría es manual o automática",
  directory.rows.every((r) => r.category_source === "auto" || r.category_source === "manual"));

// 11. Un cliente creado después del último recálculo ya aparece con su
//     categoría real en el directorio, sin esperar otro recálculo.
const nuevo = await makeClient("NUEVO EJEMPLO");
await pay(nuevo);
const live = await rpc("crm_directory", ["NUEVO EJEMPLO", "familia", 0]);
ok("El directorio encuentra por categoría a quien todavía no fue recalculado",
  live.rows.length === 1 && live.rows[0].id === nuevo);
ok("La fila avisa que la categoría no estaba guardada y se calculó en el momento",
  live.rows[0].category_saved === false && live.rows[0].category_calc === "familia");
const afterSave = await rpc("client_category_apply", [nuevo]);
ok("Guardar la categoría de ese cliente deja de recalcular en vivo",
  afterSave.changed === 1 &&
  (await rpc("crm_directory", ["NUEVO EJEMPLO", "familia", 0])).rows[0].category_saved === true);

console.log(`\n${checks} comprobaciones PASS (CLI-02 categorías automáticas, 00070 + 00071)`);
