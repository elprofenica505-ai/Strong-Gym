import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const intent = {
  kind: "service_income",
  clientId: id,
  requestId: id,
  amount: 100,
  currency: "NIO",
  method: "efectivo",
  account: "caja-nio",
  concept: "Servicio EJEMPLO",
  fx: 36.7244,
};
const load = createLoader({
  "@/lib/data/queries":
    "export const getCurrentUser=async()=>globalThis.__financeUser;",
  "@/lib/supabase/env": "export const isSupabaseConfigured=true;",
  "@/lib/supabase/server":
    "export const getSupabaseServerClient=async()=>globalThis.__financeWriteDb;",
});
const { GET, POST } = await load("app/api/admin/finance/route.ts");
let calls = [];
function setup(role = "staff", result = { data: id, error: null }) {
  calls = [];
  globalThis.__financeUser = role ? { id, role } : null;
  globalThis.__financeWriteDb = {
    rpc(name, args) {
      calls.push({ name, args });
      return {
        abortSignal(signal) {
          assert.ok(signal instanceof AbortSignal);
          return Promise.resolve(result);
        },
      };
    },
  };
}
function req(body = intent, headers = {}) {
  return new Request("https://gym.example/api/admin/finance", {
    method: "POST",
    headers: {
      origin: "https://gym.example",
      host: "gym.example",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
for (const role of [null, "member", "coach"])
  test(`finanzas API rechaza ${role ?? "anónimo"} antes de DB`, async () => {
    setup(role);
    assert.equal((await POST(req())).status, 403);
    assert.equal(
      (await GET(new Request("https://gym.example/api/admin/finance"))).status,
      403,
    );
    assert.equal(calls.length, 0);
  });
for (const role of ["admin", "staff"])
  test(`finanzas ${role}: un RPC atómico, misma referencia y FX explícito NIO`, async () => {
    setup(role);
    const r = await POST(req());
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await r.json(), { id });
    assert.deepEqual(calls, [
      {
        name: "finance_record_movement",
        args: {
          p_request: id,
          p_kind: "service_income",
          p_client: id,
          p_amount: 100,
          p_currency: "NIO",
          p_method: "efectivo",
          p_account: "caja-nio",
          p_concept: "Servicio EJEMPLO",
          p_fx: 36.7244,
          p_category: null,
        },
      },
    ]);
  });
test("gasto no necesita cliente, categoría sí; no acepta actor/estado manipulados", async () => {
  setup();
  const { clientId, ...body } = intent;
  const expense = { ...body, kind: "expense", category: "alquiler" };
  assert.equal((await POST(req(expense))).status, 200);
  assert.equal(calls[0].args.p_client, null);
  assert.equal(calls[0].args.p_category, "alquiler");
  for (const extra of [
    { clientId: id },
    { createdBy: id },
    { status: "completed" },
    { direction: "income" },
  ]) {
    setup();
    assert.equal((await POST(req({ ...expense, ...extra }))).status, 422);
    assert.equal(calls.length, 0);
  }
});
for (const patch of [
  { amount: 0 },
  { amount: -1 },
  { amount: 1.001 },
  { amount: 100000000 },
  { currency: "EUR" },
  { fx: 0 },
  { fx: 36.12345 },
  { requestId: "bad" },
  { clientId: null },
  { concept: "x" },
  { account: "" },
  { method: "" },
  { fx: undefined },
])
  test(`API valida antes de SQL: ${JSON.stringify(patch)}`, async () => {
    setup();
    assert.equal((await POST(req({ ...intent, ...patch }))).status, 422);
    assert.equal(calls.length, 0);
  });
for (const headers of [
  { origin: "https://evil.example" },
  { origin: "null" },
  { "sec-fetch-site": "cross-site" },
])
  test(`origen rechazado ${JSON.stringify(headers)}`, async () => {
    setup();
    assert.equal((await POST(req(intent, headers))).status, 403);
    assert.equal(calls.length, 0);
  });
for (const [message, code, status] of [
  ["REQUEST_CONFLICT", "P0001", 409],
  ["INVALID_ACCOUNT", "P0001", 422],
  ["AUTH", "P0001", 403],
  ["SECRET_TABLE_VALUE", "42501", 503],
  ["missing", "PGRST202", 503],
  ["SECRET", "55P03", 503],
])
  test(`error ${message}: explícito sin éxito simulado ni filtrar detalles`, async () => {
    setup("staff", { data: null, error: { message, code } });
    const r = await POST(req());
    assert.equal(r.status, status);
    const b = await r.json();
    assert.ok(!b.id && !b.ok);
    assert.ok(!JSON.stringify(b).includes("SECRET"));
    assert.match(b.code, /^FIN_/);
  });
test("respuesta SQL inválida no confirma cobro", async () => {
  setup("staff", { data: null, error: null });
  assert.equal((await POST(req())).status, 503);
});
test("historial valida filtro y requiere filas completas", async () => {
  setup("staff", { data: [], error: null });
  const r = await GET(
    new Request("https://gym.example/api/admin/finance?history=expense"),
  );
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), []);
  assert.deepEqual(calls[0], {
    name: "finance_recent_receipts",
    args: { p_kind: "expense", p_client: null },
  });
  for (const query of [
    "history=unknown",
    "history=service_income",
    "history=expense&client=" + id,
    "receipt=bad",
  ]) {
    setup();
    assert.equal(
      (await GET(new Request("https://gym.example/api/admin/finance?" + query)))
        .status,
      422,
    );
    assert.equal(calls.length, 0);
  }
  setup("staff", { data: [{}], error: null });
  assert.equal(
    (
      await GET(
        new Request("https://gym.example/api/admin/finance?history=expense"),
      )
    ).status,
    503,
  );
});
test("sin Supabase responde 503 y jamás simula guardado", async () => {
  const { POST } = await createLoader({
    "@/lib/supabase/env": "export const isSupabaseConfigured=false;",
    "@/lib/data/queries":
      'export const getCurrentUser=async()=>{throw Error("unexpected")};',
    "@/lib/supabase/server":
      'export const getSupabaseServerClient=async()=>{throw Error("unexpected")};',
  })("app/api/admin/finance/route.ts");
  assert.equal((await POST(req())).status, 503);
});

// Un UUID conocido y metadatos manipulados no sustituyen el rol de profiles.
for (const role of [null, "member", "coach", "owner", "ADMIN"])
  test(`finanzas: ${role ?? "anónimo"} no consulta recibos/historial ni escribe gastos`, async () => {
    setup(role);
    for (const query of [
      `receipt=${id}`,
      "history=expense",
      `history=service_income&client=${id}`,
    ]) {
      const r = await GET(new Request(`https://gym.example/api/admin/finance?${query}`));
      assert.equal(r.status, 403);
      assert.equal(r.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(await r.json(), { error: "No tenés acceso a movimientos financieros." });
    }
    const { clientId, ...body } = intent;
    const r = await POST(req({ ...body, kind: "expense", category: "alquiler", role: "admin", createdBy: id }));
    assert.equal(r.status, 403);
    assert.equal(calls.length, 0);
  });
test("rol retirado entre envío y reintento: no vuelve a llamar al writer", async () => {
  setup("staff");
  assert.equal((await POST(req())).status, 200);
  globalThis.__financeUser = { id, role: "member" };
  assert.equal((await POST(req())).status, 403);
  assert.equal(calls.length, 1);
});
