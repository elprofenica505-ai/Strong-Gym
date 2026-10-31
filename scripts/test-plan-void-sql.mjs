// Prueba de la migración 00085 en PGlite: anular un cobro da de baja su
// vigencia, adelanta los días encadenados, respeta los huecos reales y no
// borra nada. Corre en CI (`npm run test:plan:void`).
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
const CLIENT = randomUUID();
const OTHER = randomUUID();

async function asAdmin(fn) {
  await db.exec('delete from auth.current_user');
  await db.query('insert into auth.current_user values($1)', [ADMIN]);
  try {
    return await fn();
  } finally {
    await db.exec('delete from auth.current_user');
  }
}

async function asVisitor(fn) {
  await db.exec('delete from auth.current_user');
  return fn();
}

const segment = async (client, from, to, transaction) =>
  (
    await row(
      `insert into payment_plans(client_id, plan_id, access, started_on, expires_on, price_paid, transaction_id, request_id)
       values ($1,'pln_gimnasio','gym',$2::date,$3::date,560,$4,$5) returning *`,
      [client, from, to, transaction, randomUUID()],
    )
  ).id;

const dates = async (id) =>
  await row('select started_on::text, expires_on::text, voided_at from payment_plans where id=$1', [id]);

const voidMovement = (transaction, reason = 'Cobro equivocado') =>
  db.query(
    `insert into finance_voids(original_id, reason, actor_id) values ($1,$2,$3) returning id`,
    [transaction, reason, ADMIN],
  );

const snapshot = async () =>
  JSON.stringify(
    await rows(`select id, started_on::text, expires_on::text, voided_at, voided_reason, void_id
                  from payment_plans order by id`),
  );

try {
  await db.exec(sql('tests/fixtures/plan-validity.sql'));
  const migration = sql('supabase/migrations/00085_anular_da_de_baja_la_vigencia.sql');
  await db.exec(migration);
  await db.exec(migration);
  check('la migración se puede correr dos veces', true);

  await db.query('insert into gym_clients(id, full_name) values($1, $2), ($3, $4)', [CLIENT, 'Socia de prueba', OTHER, 'Otra persona']);
  await db.exec(`insert into classes(id,name_es) values('boxeo','Boxeo');
    insert into plans(id,name_es,duration_days) values('pln_gimnasio','Gimnasio',30),('pln_boxeo','Boxeo',30);`);

  // ---- El caso real: tres meses encadenados, se anulan el primero y el último.
  const tx1 = randomUUID(), tx2 = randomUUID(), tx3 = randomUUID();
  const one = await segment(CLIENT, '2026-10-28', '2026-11-26', tx1);
  const two = await segment(CLIENT, '2026-11-27', '2026-12-26', tx2);
  const three = await segment(CLIENT, '2026-12-27', '2027-01-25', tx3);
  const before = await snapshot();

  const err = await asVisitor(() =>
    db.query('select plan_void_segments($1,$2,$3)', [tx1, 'sin permiso', randomUUID()]).then(() => null, (e) => e),
  );
  check('sin sesión de personal la baja de vigencia se rechaza', /AUTH/.test(String(err)));
  check('un rechazo no deja marcas ni fechas movidas', before === (await snapshot()));

  await asAdmin(async () => {
    const result = await row('select plan_void_segments($1,$2,$3) as value', [tx1, 'Cobro equivocado', randomUUID()]);
    assert.equal(result.value.voided, 1);
  });

  const d1 = await dates(one), d2 = await dates(two), d3 = await dates(three);
  check('el segmento del cobro anulado queda marcado y no se borra', d1.voided_at !== null);
  check('las fechas del segmento anulado se conservan tal cual', d1.started_on === '2026-10-28' && d1.expires_on === '2026-11-26');
  check('el mes siguiente se adelanta al lugar que dejó el anulado', d2.started_on === '2026-10-28' && d2.expires_on === '2026-11-26');
  check('el mes de más adelante también corre, sin perder días', d3.started_on === '2026-11-27' && d3.expires_on === '2026-12-26');
  check('no se borró ninguna vigencia', (await row('select count(*)::int as n from payment_plans')).n === 3);

  const log = await rows('select action, before, after from plan_validity_log order by created_at');
  check('queda bitácora del segmento anulado', log.some((l) => l.action === 'void_segment'));
  check('queda bitácora con las fechas de antes y de después', log.some((l) => l.action === 'shift' && l.before?.started_on === '2026-11-27' && l.after?.started_on === '2026-10-28'));

  const frozen = await snapshot();
  await asAdmin(async () => {
    const again = await row('select plan_void_segments($1,$2,$3) as value', [tx1, 'Cobro equivocado', randomUUID()]);
    assert.equal(again.value.voided, 0);
  });
  check('anular dos veces no vuelve a mover fechas', frozen === (await snapshot()));

  // El cobro del tercer mes también se anula: queda un solo mes vivo.
  await asAdmin(() => voidMovement(tx3, 'El cliente se enfermó'));
  const d2b = await dates(two), d3b = await dates(three);
  check('el tercer segmento también queda anulado', d3b.voided_at !== null);
  check('lo que queda vivo es un solo mes desde el primer día pagado', d2b.started_on === '2026-10-28' && d2b.expires_on === '2026-11-26');

  const summary = await row(`select plan_validity_summary($1) as value`, [CLIENT]);
  check('la ficha solo lista segmentos vivos', summary.value.segments.length === 1);
  const onDate = await row(`select plan_class_state($1, null::text, $2::date) as value`, [CLIENT, '2026-10-30']);
  check('el día pagado sigue vigente', onDate.value.state === 'active');
  const afterEnd = await row(`select plan_class_state($1, null::text, $2::date) as value`, [CLIENT, '2026-11-27']);
  check('el día siguiente al mes que pagó ya no tiene vigencia', afterEnd.value.state === 'expired');

  // ---- Un hueco real no se rellena.
  const gapA = randomUUID(), gapB = randomUUID();
  const g1 = await segment(OTHER, '2026-01-01', '2026-01-30', gapA);
  const g2 = await segment(OTHER, '2026-03-01', '2026-03-30', gapB);
  await asAdmin(() => voidMovement(gapA, 'Se devolvió el dinero'));
  const ga = await dates(g1), gb = await dates(g2);
  check('anular el mes viejo no mueve al que vino después de un hueco', gb.started_on === '2026-03-01' && gb.expires_on === '2026-03-30');
  check('el segmento del hueco sí queda anulado', ga.voided_at !== null);

  // ---- Anular algo sin vigencia (un producto) no toca nada.
  const beforeProduct = await snapshot();
  await asAdmin(() => voidMovement(randomUUID(), 'Venta de agua'));
  check('anular una venta de producto no cambia vigencias', beforeProduct === (await snapshot()));

  // ---- Lo que la pantalla lee antes de anular.
  const impact = await asAdmin(() => row('select finance_void_plan_impact($1) as value', [tx2]));
  check('el impacto dice qué vigencia activó el cobro', impact.value.length === 1 && impact.value[0].state === 'active');
  const impactVoided = await asAdmin(() => row('select finance_void_plan_impact($1) as value', [tx3]));
  check('el impacto marca como anulada la vigencia de un cobro ya anulado', impactVoided.value[0].voided === true && impactVoided.value[0].state === 'voided');
  const impactNone = await asAdmin(() => row('select finance_void_plan_impact($1) as value', [randomUUID()]));
  check('un cobro sin vigencia devuelve lista vacía', Array.isArray(impactNone.value) && impactNone.value.length === 0);
  const impactErr = await asVisitor(() => row('select finance_void_plan_impact($1) as value', [tx2]).then(() => null, (e) => e));
  check('sin sesión de personal no se puede consultar el impacto', /AUTH/.test(String(impactErr)));

  // ---- Un cobro nuevo se encadena a lo que quedó vivo, no a lo anulado.
  const newTx = randomUUID();
  const chain = await asAdmin(() =>
    row(
      `select plan_register_segment($1,'pln_gimnasio',560,'NIO',$2,$3,'movement') as value`,
      [CLIENT, randomUUID(), newTx],
    ),
  );
  check('la renovación arranca donde termina lo vivo', chain.value.started_on === '2026-11-27');

  console.log(`\n${count} comprobaciones en verde.`);
} finally {
  await db.close();
}
