import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * `/api/admin/finance/cash` — abrir y cerrar la caja (FIN-04).
 *
 * La ruta no decide reglas de negocio: valida la forma del pedido y llama a
 * `finance_cash_open` / `finance_cash_close` / `finance_cash_state`, que son
 * las que comprueban rol con segundo factor, caja única y motivo del faltante.
 * Lo que se prueba acá es que no se saltee ese paso y que un fallo de lectura
 * nunca se convierta en «no hay caja abierta».
 */

const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

const source = readFileSync(
  new URL("../src/app/api/admin/finance/cash/route.ts", import.meta.url),
  "utf8",
);

const queries = `
  export const getCurrentUser = async () => globalThis.__cash.user;
`;

const supabase = `
  export const getSupabaseServerClient = async () => ({
    rpc: async (name, args) => {
      globalThis.__cash.calls.push({ name, args });
      if (globalThis.__cash.rpcError) return { data: null, error: { message: globalThis.__cash.rpcError } };
      return { data: globalThis.__cash.rpcData, error: null };
    },
  });
`;

const sameOriginModule = `
  export const sameOrigin = () => globalThis.__cash.sameOrigin;
`;

const modules = {
  "next/server": import.meta.resolve("next/server.js"),
  "@/lib/auth/current-user": new URL("../src/lib/auth/current-user.ts", import.meta.url).href,
  "@/lib/data/queries": dataUrl(queries),
  "@/lib/supabase/server": dataUrl(supabase),
  "@/lib/security/same-origin": dataUrl(sameOriginModule),
  "@/lib/finance/cash-session": new URL(
    "../src/lib/finance/cash-session.ts",
    import.meta.url,
  ).href,
  zod: import.meta.resolve("zod"),
};

const code = ts
  .transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  .outputText.replace(/from "([^"]+)"/g, (_, name) => `from ${JSON.stringify(modules[name])}`);

const { GET, POST } = await import(dataUrl(code));

const cashier = { id: "caja", role: "cashier", mfa: "ok" };
const sessionId = "11111111-1111-4111-8111-111111111111";
const requestId = "33333333-3333-4333-8333-333333333333";

const sessionBody = {
  id: sessionId,
  open: true,
  openedAt: "2026-10-31T15:00:00Z",
  openedById: "caja",
  openedByName: "Ana Cajera",
  openingNio: 500,
  openingUsd: 20,
  closedAt: null,
  closedById: null,
  closedByName: null,
  countedNio: null,
  countedUsd: null,
  expectedNio: 1000,
  expectedUsd: 25,
  differenceNio: null,
  differenceUsd: null,
  notes: null,
  closeNotes: null,
  movements: {
    incomeNio: 600,
    incomeUsd: 10,
    expenseNio: 100,
    expenseUsd: 5,
    count: 7,
    accounts: [],
  },
};

function reset(overrides = {}) {
  globalThis.__cash = {
    user: cashier,
    sameOrigin: true,
    calls: [],
    rpcError: null,
    rpcData: { open: sessionBody, history: [] },
    ...overrides,
  };
}

const post = (body) =>
  POST(
    new Request("https://gym.example/api/admin/finance/cash", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://gym.example" },
      body: JSON.stringify(body),
    }),
  );

test("sin sesión, socio, entrenador o caja sin segundo factor no leen ni escriben", async () => {
  for (const [user, status] of [
    [null, 403],
    [{ id: "socio", role: "member", mfa: "not_required" }, 403],
    [{ id: "profe", role: "trainer", mfa: "ok" }, 403],
    [{ id: "caja", role: "cashier", mfa: "verify" }, 403],
  ]) {
    reset({ user });
    const read = await GET();
    assert.equal(read.status, status);
    assert.equal((await read.json()).code, "AUTH");
    const write = await post({ action: "open", requestId });
    assert.equal(write.status, status);
    assert.equal((await write.json()).code, "AUTH");
    assert.deepEqual(globalThis.__cash.calls, []);
  }
});

test("la caja abierta llega tal como está, con sus movimientos", async () => {
  reset();
  const response = await GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.state.open.id, sessionId);
  assert.equal(body.state.open.expectedNio, 1000);
  assert.equal(body.state.open.movements.count, 7);
  assert.deepEqual(globalThis.__cash.calls, [{ name: "finance_cash_state", args: undefined }]);
});

test("una lectura que no se entiende no se muestra como «caja cerrada»", async () => {
  reset({ rpcData: { algo: "raro" } });
  const response = await GET();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "CASH_STATE_UNREADABLE");
  assert.equal(body.ok, undefined);
});

test("escribir exige el mismo origen", async () => {
  reset({ sameOrigin: false });
  const response = await post({ action: "open", requestId });
  assert.equal(response.status, 403);
  assert.deepEqual(globalThis.__cash.calls, []);
});

test("un pedido mal armado se rechaza antes de tocar la base", async () => {
  reset();
  for (const body of [
    { action: "abrir", requestId },
    { action: "close", requestId, countedNio: 1, countedUsd: 1 },
    { action: "open", requestId: "no-es-uuid" },
    { action: "open", requestId, openNio: -5 },
    { action: "open", requestId, openNio: 1.005 },
  ]) {
    const response = await post(body);
    assert.equal(response.status, 422, JSON.stringify(body));
  }
  assert.deepEqual(globalThis.__cash.calls, []);
});

test("abrir llama a la función con el pedido y los montos", async () => {
  reset({ rpcData: { ...sessionBody, expectedNio: 0 } });
  const response = await post({
    action: "open",
    requestId,
    openNio: 500,
    openUsd: 20,
    notes: "Turno de la mañana",
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.session.id, sessionId);
  assert.deepEqual(globalThis.__cash.calls, [
    {
      name: "finance_cash_open",
      args: {
        p_request: requestId,
        p_open_nio: 500,
        p_open_usd: 20,
        p_notes: "Turno de la mañana",
      },
    },
  ]);
});

test("cerrar manda lo contado, no lo calculado en el navegador", async () => {
  reset({ rpcData: { ...sessionBody, open: false } });
  const response = await post({
    action: "close",
    requestId,
    sessionId,
    countedNio: 990,
    countedUsd: 25,
    notes: "Faltaron C$10",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(globalThis.__cash.calls, [
    {
      name: "finance_cash_close",
      args: {
        p_request: requestId,
        p_session: sessionId,
        p_counted_nio: 990,
        p_counted_usd: 25,
        p_notes: "Faltaron C$10",
      },
    },
  ]);
});

test("los motivos de la base llegan con su texto y su estado", async () => {
  for (const [code, status, expected] of [
    ["CASH_ALREADY_OPEN", 409, /Ya hay una caja abierta/],
    ["CASH_ALREADY_CLOSED", 409, /ya fue cerrada/],
    ["CASH_NOT_YOURS", 409, /otra persona/],
    ["CASH_DIFFERENCE_REASON_REQUIRED", 409, /no cuadra/i],
    ["INVALID_AMOUNT", 422, /montos/],
    ["AUTH", 403, /No tenés acceso/],
    ["NOT_FOUND", 404, /No encontramos/],
  ]) {
    reset({ rpcError: code });
    const response = await post({ action: "open", requestId });
    assert.equal(response.status, status, code);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.match(body.message, expected);
  }
});

test("si no se puede leer el resultado, no se inventa una caja", async () => {
  reset({ rpcData: { ok: true } });
  const response = await post({ action: "open", requestId });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "CASH_UNCONFIRMED");
  assert.match(body.message, /reintentar|no duplica/i);
});
