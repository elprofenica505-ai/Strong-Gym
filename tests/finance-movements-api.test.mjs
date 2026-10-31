import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * `/api/admin/finance/movements` — una página del historial de Caja (FIN-05).
 *
 * La pantalla ya no filtra en el navegador: pide al servidor. Esta ruta decide
 * quién puede leer, aplica el interruptor de gastos de caja y no convierte un
 * fallo en una lista vacía.
 */

const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

const readResult = `
  export class FinanceReadError extends Error {
    constructor(operation, code) { super(operation + "_" + code); this.code = code; }
  }
`;
const readResultUrl = dataUrl(readResult);

const queries = `
  import { FinanceReadError } from ${JSON.stringify(readResultUrl)};
  export const getCurrentUser = async () => globalThis.__movements.user;
  export const getCashierPermissions = async () => {
    globalThis.__movements.calls.push({ name: "permissions" });
    return globalThis.__movements.permissions;
  };
  export const getMovementsPage = async (filters, page) => {
    globalThis.__movements.calls.push({ name: "page", filters, page });
    if (globalThis.__movements.failCode)
      throw new FinanceReadError("MOVEMENTS", globalThis.__movements.failCode);
    return globalThis.__movements.result;
  };
`;

const source = readFileSync(
  new URL("../src/app/api/admin/finance/movements/route.ts", import.meta.url),
  "utf8",
);
const modules = {
  "next/server": import.meta.resolve("next/server.js"),
  "@/lib/auth/current-user": new URL(
    "../src/lib/auth/current-user.ts",
    import.meta.url,
  ).href,
  "@/lib/finance/read-result": readResultUrl,
  "@/lib/finance/movements-page": new URL(
    "../src/lib/finance/movements-page.ts",
    import.meta.url,
  ).href,
  "@/lib/data/queries": dataUrl(queries),
};
const code = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /from "([^"]+)"/g,
    (_, name) => `from ${JSON.stringify(modules[name])}`,
  );
const { GET } = await import(dataUrl(code));

function reset(overrides = {}) {
  globalThis.__movements = {
    user: { id: "caja", role: "cashier", mfa: "ok" },
    permissions: {
      dailyClose: true,
      monthlyResult: true,
      charts: true,
      accountBalances: true,
      expenses: true,
      receivables: true,
      void: true,
    },
    result: {
      rows: [
        {
          id: "tx-1",
          occurredAt: "2026-10-31T15:00:00Z",
          direction: "income",
          status: "completed",
          amount: 40,
          currency: "NIO",
          concept: "Pase del día",
          voidedReason: null,
        },
      ],
      total: 61,
      page: 0,
      pageSize: 25,
    },
    calls: [],
    failCode: null,
    ...overrides,
  };
}

const call = (query = "") =>
  GET(new Request(`https://gym.example/api/admin/finance/movements?${query}`));

test("sin sesión, cliente y entrenador no leen el historial", async () => {
  for (const [user, status] of [
    [null, 403],
    [{ id: "socio", role: "member", mfa: "not_required" }, 403],
    [{ id: "profe", role: "trainer", mfa: "ok" }, 403],
    [{ id: "caja", role: "cashier", mfa: "verify" }, 403],
  ]) {
    reset({ user });
    const response = await call();
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, "AUTH");
    assert.deepEqual(globalThis.__movements.calls, []);
  }
});

test("caja y administración reciben la página y el total", async () => {
  reset();
  const response = await call("q=Pase&direction=income&page=1");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.total, 61);
  assert.equal(body.rows.length, 1);
  const page = globalThis.__movements.calls.find((c) => c.name === "page");
  assert.deepEqual(page.filters, {
    search: "Pase",
    direction: "income",
    status: "all",
    currency: "all",
    method: "all",
    hideExpenses: false,
  });
  assert.equal(page.page, 1);
});

test("con los gastos apagados, el servidor los excluye y no los cuenta", async () => {
  reset({ permissions: { ...globalThis.__movements.permissions, expenses: false } });
  const response = await call();
  assert.equal(response.status, 200);
  const page = globalThis.__movements.calls.find((c) => c.name === "page");
  assert.equal(page.filters.hideExpenses, true);

  // Aunque el navegador pida egresos, no se devuelven.
  reset({ permissions: { ...globalThis.__movements.permissions, expenses: false } });
  const onlyExpenses = await call("direction=expense");
  const body = await onlyExpenses.json();
  assert.equal(body.total, 0);
  assert.deepEqual(body.rows, []);
  assert.equal(
    globalThis.__movements.calls.filter((c) => c.name === "page").length,
    0,
  );
});

test("un filtro imposible se explica y no se consulta la base", async () => {
  reset();
  const response = await call(`q=${"a".repeat(81)}`);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "INVALID_FILTER");
  assert.deepEqual(globalThis.__movements.calls, []);
});

test("un fallo de lectura no se disfraza de «no hay movimientos»", async () => {
  reset({ failCode: "42501" });
  const response = await call();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "42501");
  assert.match(body.message, /No se muestra una lista vacía/);
  assert.equal(body.rows, undefined);
  assert.equal(body.total, undefined);
});
