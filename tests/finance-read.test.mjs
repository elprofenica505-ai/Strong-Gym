import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";

const load = createLoader({
  "server-only": "export {};",
  "@/lib/supabase/env": "export const isSupabaseConfigured=true;",
  "@/lib/supabase/server":
    "export const getSupabaseServerClient=async()=>globalThis.__financeDb;",
});
const queries = await load("lib/data/queries.ts");
const { FinanceReadError, readFinance } = await load(
  "lib/finance/read-result.ts",
);
function mockDb(respond) {
  const calls = [];
  globalThis.__financeDb = {
    from(table) {
      const call = { table, fields: null, single: false };
      calls.push(call);
      const chain = {
        select(fields) {
          call.fields = fields;
          return chain;
        },
        eq() {
          return chain;
        },
        gte() {
          return chain;
        },
        is() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        maybeSingle() {
          call.single = true;
          return chain;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => respond(call, calls))
            .then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return calls;
}
const functions = [
  "getPaymentMethods",
  "getExpenseCategories",
  "getAccounts",
  "getRecentTransactions",
  "getDailyCash",
  "getMonthlyPnl",
  "getPaymentMethodsBreakdown",
  "getAccountsReceivable",
  "getCashSummary",
];
for (const fn of functions) {
  test(`${fn}: fallo SQL no se convierte en ceros/lista vacía`, async () => {
    mockDb(() => ({
      data: null,
      error: { code: "42703", message: "private@example.com SQL secret" },
    }));
    await assert.rejects(
      queries[fn](),
      (e) =>
        e instanceof FinanceReadError &&
        e.code.endsWith("_42703") &&
        !e.message.includes("private@example.com"),
    );
  });
}
test("errores de red se presentan sin filtrar mensajes internos", async () => {
  mockDb(() => {
    throw new TypeError("private network token");
  });
  const result = await readFinance(() => queries.getAccounts());
  assert.equal(result.ok, false);
  assert.equal(result.code, "FIN_READ_UNKNOWN");
  assert.doesNotMatch(result.message, /private network token/);
});
test("resumen falla si una sola dependencia no pudo leerse", async () => {
  mockDb((c) => ({
    data: c.single ? null : [],
    error: c.table === "cash_registers" ? { code: "42501" } : null,
  }));
  await assert.rejects(
    queries.getCashSummary(),
    (e) => e.code === "FIN_SUMMARY_REGISTER_42501",
  );
});
test("lectura vacía confirmada es diferente de fallo de lectura", async () => {
  mockDb((c) => ({ data: c.single ? null : [], error: null }));
  const result = await readFinance(() => queries.getCashSummary());
  assert.equal(result.ok, true);
  assert.equal(result.data.incomeToday, 0);
  assert.equal(result.data.totalOwed, 0);
  assert.equal(result.data.openRegister, null);
  assert.deepEqual(await queries.getAccounts(), []);
});
test("movimiento nativo conserva valores, moneda y cliente sin convertir a tasa inventada", async () => {
  const calls = mockDb(() => ({
    error: null,
    data: [
      {
        id: "tx",
        occurred_at: "2026-10-16T02:00:00Z",
        direction: "income",
        status: "completed",
        amount: 20,
        currency: "USD",
        fx_rate: 40,
        base_amount: 800,
        payment_method_id: "usd",
        account_id: "bank",
        member_id: null,
        invoice_id: null,
        expense_category_id: null,
        concept: "Prueba ficticia",
        notes: null,
        created_by: null,
        client: { full_name: "Cliente ficticio" },
      },
    ],
  }));
  const [tx] = await queries.getRecentTransactions();
  assert.equal(tx.amount, 20);
  assert.equal(tx.currency, "USD");
  assert.equal(tx.fxRate, 40);
  assert.equal(tx.baseAmount, 800);
  assert.equal(tx.memberName, "Cliente ficticio");
  assert.match(calls[0].fields, /direction/);
  assert.match(calls[0].fields, /base_amount/);
});
test("falta de relación CRM permite consulta nativa anterior; error de permisos no hace reintento", async () => {
  let calls = mockDb((_c, calls) =>
    calls.length === 1
      ? { data: null, error: { code: "PGRST200" } }
      : { data: [], error: null },
  );
  assert.deepEqual(await queries.getRecentTransactions(), []);
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1].fields, /client:gym_clients/);
  calls = mockDb(() => ({ data: null, error: { code: "42501" } }));
  await assert.rejects(queries.getRecentTransactions(), FinanceReadError);
  assert.equal(calls.length, 1);
});
test("código de diagnóstico no incorpora código de base no seguro", () => {
  const e = new FinanceReadError("ACCOUNTS", "private-token@example.com");
  assert.equal(e.code, "FIN_ACCOUNTS_UNKNOWN");
});

const queryNames = [...functions, "getCurrentUser"];
function pageLoader(role) {
  const code = queryNames
    .map((fn) =>
      fn === "getCurrentUser"
        ? `export const getCurrentUser=async()=>({id:'test',role:${JSON.stringify(role)}});`
        : `export const ${fn}=async()=>{globalThis.__financePageReads++;throw new Error('PRIVATE DATABASE MESSAGE');};`,
    )
    .join("\n");
  return createLoader({
    "@/lib/supabase/env": "export const isSupabaseConfigured=true;",
    "@/lib/data/queries": code,
    "next/navigation":
      "export function redirect(path){throw new Error('REDIRECT:'+path);}",
  });
}
for (const page of ["caja", "cuentas", "reportes", "gastos"]) {
  test(`${page}: error visible, sin KPI cero ni falso 'sin deudas'`, async () => {
    globalThis.__financePageReads = 0;
    const { default: Page } = await pageLoader("staff")(
      `app/[locale]/panel/${page}/page.tsx`,
    );
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ locale: "es" }) }),
    );
    assert.match(html, /Información financiera no disponible/);
    assert.match(html, /FIN_READ_UNKNOWN/);
    assert.doesNotMatch(
      html,
      /PRIVATE DATABASE MESSAGE|No hay cuentas pendientes|Sin movimientos en los últimos|Caja cerrada|C\$ 0/,
    );
    assert.match(html, /Reintentar lectura/);
    assert.ok(globalThis.__financePageReads > 0);
  });
  test(`${page}: member no llega a consultas financieras`, async () => {
    globalThis.__financePageReads = 0;
    const { default: Page } = await pageLoader("member")(
      `app/[locale]/panel/${page}/page.tsx`,
    );
    await assert.rejects(
      Page({ params: Promise.resolve({ locale: "es" }) }),
      /REDIRECT:\/es\/mi-cuenta/,
    );
    assert.equal(globalThis.__financePageReads, 0);
  });
}
