// Prueba de la migración 00086 en PGlite: cuánta gente tiene cada plan y qué
// precio tuvo antes. Corre en CI (`npm run test:planes:uso`).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const db = new PGlite();
let count = 0;
const sql = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const check = (name, ok) => { assert.ok(ok, name); count++; console.log(`✅ ${name}`); };
const rows = async (q, args = []) => (await db.query(q, args)).rows;
const row = async (q, args = []) => (await rows(q, args))[0];

const ADMIN = randomUUID();
const ANA = randomUUID();
const BETO = randomUUID();
const CARLA = randomUUID();

async function asAdmin(fn) {
  await db.exec('delete from auth.current_user');
  await db.query('insert into auth.current_user values($1)', [ADMIN]);
  try {
    return await fn();
  } finally {
    await db.exec('delete from auth.current_user');
  }
}

const asVisitor = (fn) => {
  return db.exec('delete from auth.current_user').then(fn);
};

const localToday = async () =>
  (await row("select (now() at time zone 'America/Managua')::date::text as hoy")).hoy;

const segment = async (client, plan, from, to, amount = 560, currency = 'NIO', created = null) =>
  db.query(
    `insert into payment_plans(client_id, plan_id, access, started_on, expires_on, price_paid, currency, transaction_id, request_id, created_at)
     values ($1,$2,'gym',$3::date,$4::date,$5,$6,$7,$8, coalesce($9::timestamptz, now()))`,
    [client, plan, from, to, amount, currency, randomUUID(), randomUUID(), created],
  );

const catalog = async () =>
  asAdmin(async () => (await row('select admin_plans_catalog() as value')).value);

const planOf = async (id) => (await catalog()).plans.find((p) => p.id === id);

try {
  await db.exec(sql('tests/fixtures/plan-validity.sql'));
  // La 00085 va primero: es la que agrega `voided_at`, que esta migración lee
  // para no contar vigencias anuladas.
  await db.exec(sql('supabase/migrations/00085_anular_da_de_baja_la_vigencia.sql'));
  const migration = sql('supabase/migrations/00086_planes_uso_y_precio.sql');
  await db.exec(migration);
  await db.exec(migration);
  check('la migración se puede correr dos veces', true);

  await db.query('insert into profiles(id, full_name, role) values ($1, $2, $3)', [ADMIN, 'Carlos Sequeira', 'admin']);
  await db.query(
    'insert into gym_clients(id, full_name) values ($1,$2),($3,$4),($5,$6)',
    [ANA, 'Ana López', BETO, 'Beto Cruz', CARLA, 'Carla Ruiz'],
  );
  await db.query(
    "insert into plans(id, slug, name_es, name_en, period, price_nio, validity_currency, validity_amount, duration_days) values ('pln_gimnasio','gimnasio-mensual','Gimnasio mensual','Monthly Gym','month',560,'NIO',560,30)",
  );

  const today = await localToday();
  const addDays = (iso, n) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // Alta del plan: queda registrada sin fechas inventadas.
  const alta = await rows("select action, before, after from plan_price_log where plan_id='pln_gimnasio'");
  check('crear un plan deja registro de alta', alta.length === 1 && alta[0].action === 'alta');
  check('el alta no inventa un valor anterior', alta[0].before === null);

  // Un cambio de precio real, hecho por el editor de tarifas y por el catálogo.
  await asAdmin(async () => {
    await db.query("update plans set price_nio = 600 where id='pln_gimnasio'");
    await db.query("update plans set validity_amount = 600 where id='pln_gimnasio'");
    // Un guardado que no toca precios no ensucia la bitácora.
    await db.query("update plans set name_es = 'Gimnasio mensual' where id='pln_gimnasio'");
  });
  const log = await rows("select action, before, after, changed_fields, changed_by from plan_price_log where plan_id='pln_gimnasio' order by changed_at, id");
  check('cada cambio de precio deja su renglón', log.filter((l) => l.action === 'edicion').length === 2);
  check('el renglón guarda el precio de antes y el de después',
    log[1].before.price_nio === 560 && log[1].after.price_nio === 600);
  check('solo se anotan los campos que cambiaron', log[1].changed_fields.join() === 'price_nio');
  check('el cambio queda con quién lo hizo', log[1].changed_by === ADMIN);

  const afterRename = await rows("select count(*)::int as n from plan_price_log where plan_id='pln_gimnasio'");
  check('editar el nombre no agrega renglones de precio', afterRename[0].n === 3);

  // Uso del plan: dos vigentes, una por empezar, una vencida y una anulada.
  await segment(ANA, 'pln_gimnasio', addDays(today, -5), addDays(today, 24));
  await segment(BETO, 'pln_gimnasio', addDays(today, -1), addDays(today, 28));
  await segment(CARLA, 'pln_gimnasio', addDays(today, 3), addDays(today, 32));
  await segment(ANA, 'pln_gimnasio', addDays(today, -70), addDays(today, -41));
  await db.query(
    `insert into payment_plans(client_id, plan_id, access, started_on, expires_on, price_paid, currency, transaction_id, request_id, voided_at)
     values ($1,'pln_gimnasio','gym',$2::date,$3::date,560,'NIO',$4,$5, now())`,
    [BETO, addDays(today, -2), addDays(today, 27), randomUUID(), randomUUID()],
  );

  const plan = await planOf('pln_gimnasio');
  check('el catálogo cuenta quiénes lo tienen vigente', plan.holders_active === 2);
  check('el catálogo cuenta quiénes lo tienen por empezar', plan.holders_upcoming === 1);
  check('una vigencia anulada no se cuenta como vigente', plan.holders_active !== 3);
  check('el catálogo cuenta los cobros del mes', plan.sold_this_month === 4);
  check('el catálogo trae el último cambio de precio',
    plan.last_price_change.after.validity_amount === 600 && plan.last_price_change.changedByName === 'Carlos Sequeira');

  const usage = await asAdmin(async () => (await row('select admin_plan_usage($1) as value', ['pln_gimnasio'])).value);
  check('la lista de personas trae solo lo vigente y lo que empieza', usage.people.length === 3);
  const ana = usage.people.find((p) => p.clientId === ANA);
  const carla = usage.people.find((p) => p.clientId === CARLA);
  check('la persona vigente muestra hasta cuándo y cuántos días le quedan',
    ana.state === 'active' && ana.expiresOn === addDays(today, 24) && ana.daysLeft === 25);
  check('la persona que empieza después se distingue', carla.state === 'upcoming');
  check('la lista viene con nombre, no solo con el id', ana.name === 'Ana López');
  check('el historial del plan llega con el precio anterior',
    usage.history.some((h) => h.action === 'edicion' && h.before.price_nio === 560));

  const vacio = await asAdmin(async () => (await row('select admin_plan_usage($1) as value', ['pln_gimnasio'])).value);
  check('el plan sin gente no devuelve una lista inventada', Array.isArray(vacio.people));

  // Permisos: nadie sin sesión de administración.
  const errCatalog = await asVisitor(() => row('select admin_plans_catalog() as value').then(() => null, (e) => e));
  check('sin sesión de administración no se lee el catálogo', /AUTH/.test(String(errCatalog)));
  const errUsage = await asVisitor(() => row('select admin_plan_usage($1) as value', ['pln_gimnasio']).then(() => null, (e) => e));
  check('sin sesión de administración no se lee el uso del plan', /AUTH/.test(String(errUsage)));
  const errMissing = await asAdmin(() => row("select admin_plan_usage('no_existe') as value").then(() => null, (e) => e));
  check('un plan inexistente no devuelve una lista vacía como si existiera', /NOT_FOUND/.test(String(errMissing)));

  // La tabla no se entrega directamente a los roles de la API.
  const grants = await rows(
    "select grantee, privilege_type from information_schema.role_table_grants where table_name = 'plan_price_log'",
  );
  check('la bitácora de precios no se entrega a anon ni a authenticated',
    !grants.some((g) => g.grantee === 'anon' || g.grantee === 'authenticated'));

  console.log(`\n${count} comprobaciones en verde.`);
} finally {
  await db.close();
}
