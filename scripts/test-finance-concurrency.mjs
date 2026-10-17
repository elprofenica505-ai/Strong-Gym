// Sólo PostgreSQL LOCAL desechable; nunca lee las variables de Supabase.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

const url = process.env.TEST_POSTGRES_URL;
if (!url) throw new Error("Falta TEST_POSTGRES_URL para una base local vacía strong_gym_test*. No usar Supabase.");
const parsed = new URL(url);
if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.search || parsed.hash ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/^\/strong_gym_test[a-z0-9_]*$/.test(parsed.pathname))
  throw new Error("Seguridad: sólo host loopback y base strong_gym_test*.");
const connections = [];
async function connect() {
  const db = new pg.Client({ connectionString: url, statement_timeout: 15000 });
  await db.connect();
  connections.push(db);
  return db;
}
const sql = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let checks = 0;
function check(label, value) {
  assert.ok(value, label);
  checks++;
  console.log(`✅ ${label}`);
}
try {
  const control = await connect();
  const a = await connect();
  const b = await connect();
  const publicTables = await control.query("select tablename from pg_tables where schemaname='public'");
  assert.equal(publicTables.rowCount, 0, "Se exige una base de pruebas vacía: no se borran tablas existentes.");
  const version = (await control.query("show server_version")).rows[0].server_version;
  console.log(`PostgreSQL ${version}, tres conexiones independientes, base local desechable.`);
  await control.query(`
    create schema auth;
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;
    create table auth.users(id uuid primary key default gen_random_uuid(),email text,raw_user_meta_data jsonb default '{}'::jsonb,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth,public to anon,authenticated;
  `);
  for (const file of [
    "supabase/migrations/00001_schema.sql",
    "supabase/migrations/00002_seed.sql",
    "tests/fixtures/finance-bank-accounts.sql",
    "supabase/migrations/00012_profiles_self_read.sql",
    "supabase/migrations/00020_clients_crm.sql",
    "supabase/migrations/00022_crm_finance_compat.sql",
    "supabase/migrations/00023_finance_read_bank_accounts.sql",
    "supabase/migrations/00024_finance_movements.sql",
  ]) await control.query(sql(file));
  const actor = randomUUID();
  await control.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'concurrencia@test.invalid','{\"full_name\":\"Prueba local\"}')", [actor]);
  await control.query("update profiles set role='staff' where id=$1", [actor]);
  const client = (await control.query("select id from gym_clients where profile_id=$1", [actor])).rows[0].id;
  await control.query(`
    insert into bank_accounts(id,name,account_type,currency,balance) values('concurrency-nio','EJEMPLO local','caja_fuerte','NIO',0);
    insert into payment_methods(id,name,currency) values('concurrency-cash','EJEMPLO efectivo','NIO');
  `);
  async function begin(db) {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
    await db.query("set local role authenticated");
  }
  const call = "select finance_record_movement($1,'service_income',$2,$3,'NIO','concurrency-cash','concurrency-nio','EJEMPLO concurrencia',40,null) as id";
  const record = (db, request, amount = 10) => db.query(call, [request, client, amount]);
  // Capturar el rechazo inmediatamente evita promesas rechazadas sin observador.
  const outcome = (promise) => promise.then(value => ({ value }), error => ({ error }));
  const state = async () => {
    const r = (await control.query(`select
      (select balance::text from bank_accounts where id='concurrency-nio') as balance,
      (select count(*)::int from transactions where account_id='concurrency-nio') as tx,
      (select count(*)::int from finance_entries where receipt->>'accountId'='concurrency-nio') as receipts,
      (select count(*)::int from client_events where client_id=$1 and action='payment') as events`, [client])).rows[0];
    return { ...r, balance: Number(r.balance) };
  };
  async function blockedBy(waiter, blocker) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const row = (await control.query("select $2::int=any(pg_blocking_pids($1::int)) as blocked", [waiter.processID, blocker.processID])).rows[0];
      if (row.blocked) return;
      await delay(10);
    }
    assert.fail("No se observó bloqueo entre conexiones: la prueba no demuestra contención.");
  }
  const expectState = async (balance, tx) => assert.deepEqual(await state(), { balance, tx, receipts: tx, events: tx });

  // El primer movimiento permanece SIN COMMIT al enviar el reintento.
  const same = randomUUID();
  await begin(a);
  const original = (await record(a, same)).rows[0].id;
  await begin(b);
  const duplicate = outcome(record(b, same));
  await blockedBy(b, a);
  await a.query("commit");
  const repeated = await duplicate;
  assert.ifError(repeated.error);
  await b.query("commit");
  check("UUID simultáneo espera y devuelve exactamente el mismo comprobante", repeated.value.rows[0].id === original);
  await expectState(10, 1);
  check("UUID simultáneo: un solo saldo, transacción, comprobante y evento", true);

  const conflictId = randomUUID();
  await begin(a);
  await record(a, conflictId, 3);
  await begin(b);
  const conflict = outcome(record(b, conflictId, 4));
  await blockedBy(b, a);
  await a.query("commit");
  assert.match((await conflict).error?.message ?? "", /REQUEST_CONFLICT/);
  await b.query("rollback");
  await expectState(13, 2);
  check("UUID simultáneo con payload distinto rechaza conflicto sin segundo abono", true);

  await begin(a);
  const first = (await record(a, randomUUID(), 7)).rows[0].id;
  await begin(b);
  const different = outcome(record(b, randomUUID(), 11));
  await blockedBy(b, a);
  await a.query("commit");
  const next = await different;
  assert.ifError(next.error);
  await b.query("commit");
  await expectState(31, 4);
  const snapshots = (await control.query("select transaction_id, receipt from finance_entries where transaction_id=any($1::uuid[])", [[first, next.value.rows[0].id]])).rows;
  assert.equal(snapshots.find(r => r.transaction_id === first).receipt.accountBefore, 13);
  assert.equal(snapshots.find(r => r.transaction_id === first).receipt.accountAfter, 20);
  assert.equal(snapshots.find(r => r.transaction_id === next.value.rows[0].id).receipt.accountBefore, 20);
  assert.equal(snapshots.find(r => r.transaction_id === next.value.rows[0].id).receipt.accountAfter, 31);
  check("UUID distintos sobre misma cuenta serializan saldo y snapshots, sin actualización perdida", true);

  const rollbackId = randomUUID();
  await begin(a);
  const rolledBack = (await record(a, rollbackId, 5)).rows[0].id;
  await begin(b);
  const waiting = outcome(record(b, rollbackId, 5));
  await blockedBy(b, a);
  await a.query("rollback");
  const recovered = await waiting;
  assert.ifError(recovered.error);
  await b.query("commit");
  assert.notEqual(recovered.value.rows[0].id, rolledBack);
  assert.equal((await control.query("select id from transactions where id=$1", [rolledBack])).rowCount, 0);
  await expectState(36, 5);
  check("rollback libera UUID: el segundo intento completa una sola operación sin residuos del primero", true);

  // El writer bloquea el perfil mientras registra: un cambio de rol espera al COMMIT.
  await begin(a);
  const beforeRevocation = randomUUID();
  await record(a, beforeRevocation, 2);
  const revoke = outcome(b.query("update profiles set role='member' where id=$1", [actor]));
  await blockedBy(b, a);
  await a.query("commit");
  assert.ifError((await revoke).error);
  await begin(a);
  await assert.rejects(record(a, beforeRevocation, 2), /AUTH/);
  await a.query("rollback");
  await expectState(38, 6);
  check("cambio de rol concurrente espera al writer y bloquea el reintento posterior", true);
  console.log(`\n🎉 Concurrencia PostgreSQL: ${checks} comprobaciones pasaron. No se accedió a Supabase.`);
} finally {
  await Promise.allSettled(connections.map(async db => {
    await db.query("rollback").catch(() => {});
    await db.end();
  }));
}
