import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const sql = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const db = new PGlite();
let count = 0;
const check = (label, ok) => {
  assert.ok(ok, label);
  count++;
  console.log(`  ✅ ${label}`);
};
const row = async (q, args = []) => (await db.query(q, args)).rows[0];
await db.exec(`
create schema auth; create role anon nologin; create role authenticated nologin;
create table auth.users(id uuid primary key default gen_random_uuid(),email text,raw_user_meta_data jsonb default '{}'::jsonb,created_at timestamptz default now());
create table auth.current_user(id uuid);
create function auth.uid() returns uuid language sql stable as $$ select id from auth.current_user limit 1 $$;
grant usage on schema auth to anon,authenticated; grant select on auth.current_user to anon,authenticated;
`);
for (const f of [
  "supabase/migrations/00001_schema.sql",
  "supabase/migrations/00002_seed.sql",
  "tests/fixtures/finance-bank-accounts.sql",
  "supabase/migrations/00012_profiles_self_read.sql",
  "supabase/migrations/00020_clients_crm.sql",
])
  await db.exec(sql(f));
async function as(id, q, args = []) {
  await db.exec("reset role; delete from auth.current_user;");
  if (id) await db.query("insert into auth.current_user values($1)", [id]);
  await db.exec(`set role ${id ? "authenticated" : "anon"}`);
  try {
    return await db.query(q, args);
  } finally {
    await db.exec("reset role; delete from auth.current_user;");
  }
}
async function reject(id, q, args, pattern) {
  await assert.rejects(as(id, q, args), pattern);
  check(`rechaza ${pattern}`, true);
}
const user = async (name) =>
  (
    await row(
      "insert into auth.users(email,raw_user_meta_data) values($1,$2) returning id",
      [`${name}@test.invalid`, JSON.stringify({ full_name: `Prueba ${name}` })],
    )
  ).id;
const admin = await user("admin"),
  staff = await user("staff"),
  member = await user("member");
await db.query("update profiles set role='admin' where id=$1", [admin]);
await db.query("update profiles set role='staff' where id=$1", [staff]);
const id = (
  await as(
    staff,
    "select public.crm_create_client('Cliente ficticio sin celular') as id",
  )
).rows[0].id;
const linked = (
  await row("select id from gym_clients where profile_id=$1", [member])
).id;
await db.exec(`insert into bank_accounts(id,name,account_type,currency,balance) values('test-nio','Caja ficticia','caja_fuerte','NIO',900),('test-usd','USD ficticia','banco','USD',12),('test-off','Inactiva','banco','NIO',0);
update bank_accounts set is_active=false where id='test-off';
insert into payment_methods(id,name,currency) values('test-both','Ambas','BOTH'),('test-nio','Efectivo NIO','NIO'),('test-usd','Efectivo USD','USD'),('test-off','Inactivo','BOTH');
update payment_methods set is_active=false where id='test-off';`);
await db.query(
  "insert into member_balances(member_id,credit_nio,credit_usd,debt_nio,debt_usd) values($1,100,7,20,3)",
  [member],
);
await db.query(
  `insert into transactions(type,account_id,member_id,client_id,amount,currency,amount_nio,amount_usd,fx_used,concept) values('income','test-nio',$1,$2,100,'NIO',100,2.5,40,'Movimiento ficticio previo')`,
  [member, linked],
);
console.log(
  "\n▶ Compatibilidad con estructura exportada bank_accounts / saldos separados",
);
await reject(staff, "select public.crm_detail($1)", [id], /balance_nio/);
const snapshot = async () =>
  JSON.stringify(
    (
      await db.query(
        `select 'bank' as tipo,to_jsonb(a) as datos from bank_accounts a union all select 'balance',to_jsonb(b) from member_balances b union all select 'tx',to_jsonb(t) from transactions t order by tipo,datos`,
      )
    ).rows,
  );
const tokenBefore = (await as(staff, "select crm_get_card($1) as token", [id]))
  .rows[0].token;
const clientBefore = JSON.stringify(
  (await db.query("select * from gym_clients order by id")).rows,
);
const before = await snapshot();
const compat = sql("supabase/migrations/00022_crm_finance_compat.sql");
await db.exec(compat);
await db.exec(compat);
check(
  "migración repetida conserva cuentas, saldos y movimientos byte a byte",
  (await snapshot()) === before,
);
check(
  "conserva fichas y QR existentes",
  JSON.stringify(
    (await db.query("select * from gym_clients order by id")).rows,
  ) === clientBefore &&
    (await as(staff, "select crm_get_card($1) as token", [id])).rows[0]
      .token === tokenBefore,
);
check(
  "no crea accounts paralela",
  !(await row("select to_regclass('public.accounts') as table_id")).table_id,
);
check(
  "identifica estructura confirmada",
  (await row("select crm_finance_layout() as layout")).layout ===
    "bank_accounts_split",
);
const options = (await as(staff, "select crm_options() as value")).rows[0]
  .value;
check(
  "opciones leen planes, métodos y cuentas reales sin 42703",
  options.plans.length > 0 &&
    options.methods.length === 3 &&
    options.accounts.length === 2,
);
check(
  "BOTH habilita NIO y USD",
  options.methods.find((m) => m.id === "test-both").accepts_nio &&
    options.methods.find((m) => m.id === "test-both").accepts_usd,
);
check(
  "monedas exclusivas se respetan",
  !options.methods.find((m) => m.id === "test-nio").accepts_usd &&
    !options.methods.find((m) => m.id === "test-usd").accepts_nio,
);
check(
  "cobro deshabilitado con explicación explícita",
  options.payments_enabled === false && !!options.payment_block_reason,
);
const detail = (await as(staff, "select crm_detail($1) as value", [id])).rows[0]
  .value;
check(
  "ficha sin cuenta abre con QR e historiales",
  detail.client.id === id &&
    !!detail.card &&
    Array.isArray(detail.visits) &&
    Array.isArray(detail.events),
);
check(
  "ficha sin cuenta no inventa saldo",
  detail.balance === null && detail.balances === null,
);
const linkedDetail = (
  await as(admin, "select crm_detail($1) as value", [linked])
).rows[0].value;
check(
  "crédito/deuda NIO/USD conservados sin compensar",
  JSON.stringify(linkedDetail.balances) ===
    JSON.stringify({
      debt_nio: 20,
      debt_usd: 3,
      credit_nio: 100,
      credit_usd: 7,
    }),
);
check("no inventa un saldo neto en NIO", linkedDetail.balance === null);
check(
  "historial financiero existente sigue visible",
  linkedDetail.payments.length === 1 &&
    linkedDetail.payments[0].concept === "Movimiento ficticio previo",
);
const visit = (
  await as(staff, "select crm_check_in($1,'manual') as value", [id])
).rows[0].value;
const repeat = (
  await as(staff, "select crm_check_in($1,'manual') as value", [id])
).rows[0].value;
check(
  "visita manual sigue funcionando una vez al día",
  !visit.already && repeat.already,
);
const args = [
  id,
  "11111111-1111-4111-8111-111111111111",
  50,
  "NIO",
  "test-nio",
  "test-nio",
  "Pago ficticio",
  1,
];
const pay = "select crm_record_payment($1,$2,$3,$4,$5,$6,$7,$8)";
await reject(staff, pay, args, /FINANCE_REVIEW_REQUIRED/);
await reject(member, pay, args, /AUTH/);
await reject(
  staff,
  "select crm_record_payment_repository($1,$2,$3,$4,$5,$6,$7,$8)",
  args,
  /permission denied/,
);
await reject(staff, "select crm_finance_layout()", [], /permission denied/);
await reject(member, "select crm_options()", [], /AUTH/);
await reject(member, "select crm_detail($1)", [id], /AUTH/);
await reject(null, "select crm_options()", [], /permission denied/);
check(
  "rechazo de pago no crea tx/eventos de cobro ni altera saldos",
  (await snapshot()) === before &&
    (
      await row(
        "select count(*)::int as n from client_events where action='payment'",
      )
    ).n === 0,
);
await db.query("delete from member_balances where member_id=$1", [member]);
const missing = (await as(staff, "select crm_detail($1) as value", [linked]))
  .rows[0].value;
check(
  "saldo vinculado ausente sigue desconocido",
  missing.balance === null && missing.balances === null,
);
await db.exec(
  "alter table payment_methods rename column currency to changed_currency",
);
check(
  "esquema parcial no se acepta como compatible",
  (await row("select crm_finance_layout() as layout")).layout === "unsupported",
);
await reject(staff, "select crm_options()", [], /FINANCE_SCHEMA_UNSUPPORTED/);
await reject(staff, pay, args, /FINANCE_REVIEW_REQUIRED/);
const partial = (await as(staff, "select crm_detail($1) as value", [id]))
  .rows[0].value;
check(
  "ficha no financiera sigue disponible si esquema deja de coincidir",
  partial.client.id === id && partial.finance_layout === "unsupported",
);
const base = sql("supabase/migrations/00020_clients_crm.sql");
const original = base
  .slice(
    base.indexOf("create or replace function public.crm_record_payment("),
    base.indexOf("-- Directorio paginado"),
  )
  .replace(
    "function public.crm_record_payment(",
    "function public.crm_record_payment_repository(",
  )
  .trim();
check(
  "implementación privada nativa idéntica a FASE2 original",
  compat.includes(original),
);
await db.exec("begin read only");
const metadata = await db.query(
  sql("supabase/DIAGNOSTICO-ESCRITURA-FINANCIERA.sql"),
);
const exported = JSON.parse(metadata.rows[0].diagnostico);
check(
  "diagnóstico de escritores/vistas/permisos es sólo lectura y no exporta movimientos",
  metadata.rows.length === 1 &&
    Array.isArray(exported.funciones) &&
    Array.isArray(exported.vistas) &&
    Array.isArray(exported.politicas) &&
    !metadata.rows[0].diagnostico.includes("Movimiento ficticio previo"),
);
await db.exec("rollback");
await db.close();
console.log(`\n🎉 Compatibilidad CRM: ${count} comprobaciones pasaron\n`);
