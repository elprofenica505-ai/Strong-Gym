import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";

const load = createLoader({
  "server-only": "export {};",
  "@/lib/supabase/env": "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
  "@/lib/supabase/server":
    "export const getSupabaseServerClient=async()=>globalThis.__financeDb;",
});
const queries = await load("lib/data/queries.ts");
const { FinanceReadError, readFinance } = await load(
  "lib/finance/read-result.ts",
);
function mockDb(respond, debtReport = null) {
  const calls = [];
  globalThis.__financeDb = {
    rpc(rpc, args) {
      // Las regresiones anteriores prueban el adaptador sin el módulo nuevo.
      if (rpc === "finance_debt_report") return Promise.resolve(debtReport ? debtReport(args) : {data:null,error:{code:"PGRST202"}});
      const call = { rpc, args };
      calls.push(call);
      return Promise.resolve().then(() => respond(call, calls));
    },
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
        ? `export const getCurrentUser=async()=>({id:'test',role:${JSON.stringify(role)},mfa:'ok'});`
        : `export const ${fn}=async()=>{globalThis.__financePageReads++;throw new Error('PRIVATE DATABASE MESSAGE');};`,
    )
    .join("\n");
  return createLoader({
    "@/lib/supabase/env": "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
    "@/lib/data/queries": code,
    "next/navigation":
      "export const useRouter=()=>({refresh(){}});export function redirect(path){throw new Error('REDIRECT:'+path);}",
  });
}
for (const page of ["caja", "cuentas", "gastos"]) {
  test(`${page}: error visible, sin KPI cero ni falso 'sin deudas'`, async () => {
    globalThis.__financePageReads = 0;
    const { default: Page } = await pageLoader("cashier")(
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
    assert.match(html, /Reintentar/);
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

const legacySummary = {
  incomeToday: 780,
  expenseToday: 50,
  netToday: 730,
  txToday: 5,
  incomeMonth: 780,
  expenseMonth: 50,
  netMonth: 730,
  txMonth: 5,
  totalOwed: 20,
  totalOwedUsd: 3,
  pendingInvoices: null,
  openRegister: null,
  openRegisterCount: 0,
  sourceModel: "bank_accounts_split",
};
const legacyFixtures = {
  methods: [
    {
      id: "cash",
      slug: "cash",
      kind: null,
      name_es: "Método ficticio",
      name_en: null,
      accepts_nio: true,
      accepts_usd: true,
      is_active: true,
      sort_order: 1,
    },
  ],
  accounts: [
    {
      id: "usd",
      slug: "usd",
      name: "Cuenta ficticia",
      kind: "cash",
      currency: "USD",
      balance: 12,
      is_active: true,
    },
  ],
  categories: [
    {
      id: "cat",
      slug: "cat",
      name_es: "Categoría ficticia",
      name_en: null,
      is_active: null,
      sort_order: 0,
    },
  ],
  transactions: [
    {
      id: "tx",
      occurred_at: "2026-10-16T02:00:00Z",
      direction: "transfer",
      status: "cancelled",
      amount: 12,
      currency: "USD",
      fx_rate: 40,
      base_amount: 480,
      concept: "Transferencia ficticia",
      client: { full_name: "Cliente EJEMPLO" },
    },
  ],
  daily: [
    {
      day: "2026-10-15",
      income_nio: 780,
      expense_nio: 50,
      net_nio: 730,
      tx_count: 5,
    },
  ],
  monthly: [
    { month: "2026-10-01", income_nio: 780, expense_nio: 50, net_nio: 730 },
  ],
  method_totals: [
    {
      payment_method_id: "usd",
      name_es: "Método ficticio",
      tx_count: 1,
      total_nio: 480,
      income_nio: 480,
      expense_nio: 0,
    },
  ],
  receivables: [
    {
      member_id: "m",
      full_name: "Cliente EJEMPLO",
      email: null,
      phone: null,
      invoices_open: null,
      total_owed_nio: 20,
      total_owed_usd: 3,
      oldest_due: null,
      days_overdue: null,
    },
  ],
  summary: legacySummary,
};
const sections = [
  "methods",
  "categories",
  "accounts",
  "transactions",
  "daily",
  "monthly",
  "method_totals",
  "receivables",
  "summary",
];
function legacyDb(transform = (x) => x) {
  return mockDb((c) =>
    c.rpc
      ? {
          data: transform({
            finance_layout: "bank_accounts_split",
            section: c.args.p_section,
            data: structuredClone(legacyFixtures[c.args.p_section]),
          }),
          error: null,
        }
      : { data: null, error: { code: "42703" } },
  );
}
for (const [i, fn] of functions.entries()) {
  test(`${fn}: usa contrato bank_accounts sólo ante esquema ausente`, async () => {
    const calls = legacyDb();
    const value = await queries[fn]();
    assert.ok(value);
    const rpc = calls.filter((c) => c.rpc);
    assert.equal(rpc.length, 1);
    assert.equal(rpc[0].rpc, "finance_read");
    assert.equal(rpc[0].args.p_section, sections[i]);
  });
  test(`${fn}: ni permisos ni timeout activan lector alternativo`, async () => {
    for (const code of ["42501", "57014", "PGRST301", "XX000"]) {
      const calls = mockDb(() => ({ data: null, error: { code } }));
      await assert.rejects(queries[fn](), FinanceReadError);
      assert.equal(calls.filter((c) => c.rpc).length, 0);
    }
  });
}
test("resumen mixto: un error de permisos prevalece sobre otro de esquema", async () => {
  const calls = mockDb((c) => ({
    data: null,
    error: { code: c.table === "cash_registers" ? "42501" : "42P01" },
  }));
  await assert.rejects(
    queries.getCashSummary(),
    (e) => e.code === "FIN_SUMMARY_REGISTER_42501",
  );
  assert.equal(calls.filter((c) => c.rpc).length, 0);
});
test("mapper conserva USD, transferencia/cancelación, saldo informado y deuda sin facturas inventadas", async () => {
  legacyDb();
  const [tx] = await queries.getRecentTransactions();
  assert.equal(tx.direction, "transfer");
  assert.equal(tx.status, "cancelled");
  assert.equal(tx.currency, "USD");
  assert.equal(tx.baseAmount, 480);
  assert.equal(tx.amount, 12);
  assert.equal(tx.memberName, "Cliente EJEMPLO");
  const [account] = await queries.getAccounts();
  assert.equal(account.balance, 12);
  assert.equal(account.currency, "USD");
  const [ar] = await queries.getAccountsReceivable();
  assert.equal(ar.totalOwedNio, 20);
  assert.equal(ar.totalOwedUsd, 3);
  assert.equal(ar.invoicesOpen, null);
  assert.equal(ar.daysOverdue, null);
  assert.equal(ar.oldestDue, null);
  assert.equal((await queries.getExpenseCategories())[0].isActive, null);
});
test("RPC ausente/rechazada no se presenta como listas vacías", async () => {
  for (const code of ["PGRST202", "42501", "P0001"]) {
    mockDb((c) => ({ data: null, error: { code: c.rpc ? code : "42703" } }));
    const result = await readFinance(() => queries.getAccounts());
    assert.equal(result.ok, false);
    assert.equal(result.code, `FIN_BANK_ACCOUNTS_${code}`);
  }
});
test("RPC vacía confirmada no es lo mismo que contrato mal formado", async () => {
  legacyDb((x) => ({ ...x, data: [] }));
  assert.deepEqual(await queries.getAccounts(), []);
  for (const transform of [
    () => null,
    (x) => ({ ...x, finance_layout: "other" }),
    (x) => ({ ...x, section: "other" }),
    (x) => ({ ...x, data: null }),
    (x) => ({ ...x, data: {} }),
    (x) => ({ ...x, data: [{ balance: null, currency: "USD" }] }),
    (x) => ({ ...x, data: [{ balance: "not money", currency: "USD" }] }),
    (x) => ({ ...x, data: [{ balance: 0, currency: "EUR" }] }),
  ]) {
    legacyDb(transform);
    await assert.rejects(
      queries.getAccounts(),
      (e) => e.code === "FIN_BANK_RESPONSE_INVALID",
    );
  }
  legacyDb((x) => ({
    ...x,
    data: { ...legacySummary, totalOwedUsd: undefined },
  }));
  await assert.rejects(
    queries.getCashSummary(),
    (e) => e.code === "FIN_BANK_RESPONSE_INVALID",
  );
});
test("límites solicitados se pasan a RPC de días, meses e historial", async () => {
  const calls = legacyDb();
  await queries.getDailyCash(20);
  await queries.getMonthlyPnl(12);
  await queries.getRecentTransactions(8);
  assert.deepEqual(
    calls.filter((c) => c.rpc).map((c) => c.args.p_limit),
    [20, 12, 8],
  );
});
test("Caja guía a formularios verificados y muestra saldos por moneda", async () => {
  const { CashPanel } = await load("components/admin/cash-panel.tsx");
  legacyDb();
  const tx = (await queries.getRecentTransactions())[0];
  const html = renderToStaticMarkup(
    React.createElement(CashPanel, {
      summary: legacySummary,
      recent: [tx],
      daily: [],
      monthly: [],
      methods: [],
      paymentMethodNames: {},
      paymentMethodIcons: {},
      accounts: await queries.getAccounts(),
      isDemo: false,
    }),
  );
  assert.match(html, /verifica la actualización y los permisos/);
  assert.doesNotMatch(html, /bloqueados por decisión del administrador/);
  assert.match(html, /Saldo informado/);
  assert.match(html, /Registrar gasto y ver comprobantes/);
  assert.match(html, /requiere actualización financiera/);
  assert.match(html, /Deudas informadas por moneda/);
  assert.doesNotMatch(
    html,
    /Registrar un gasto|cuotas pendientes|P&amp;L y desglose por método/,
  );
  assert.match(html, /USD/);
  assert.match(html, /Transferencia/);
  assert.match(html, /Cancelado/);
  assert.doesNotMatch(html, /confirmar un cobro|36\.5/);
});
test("Cuentas: deuda USD independiente y mora/facturas no informadas", async () => {
  const ar = {
    memberId: "test",
    fullName: "EJEMPLO",
    email: "",
    phone: null,
    invoicesOpen: null,
    totalOwedNio: 0,
    totalOwedUsd: 3,
    oldestDue: null,
    daysOverdue: null,
  };
  const page = createLoader({
    "@/lib/supabase/env": "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
    "@/lib/data/queries": `export const getCurrentUser=async()=>({role:'cashier',mfa:'ok'});export const getAccountsReceivable=async()=>(${JSON.stringify([ar])});`,
    "next/navigation": 'export function redirect(){throw Error("redirect");}',
  });
  const { default: Page } = await page("app/[locale]/panel/cuentas/page.tsx");
  const html = renderToStaticMarkup(
    await Page({ params: Promise.resolve({ locale: "es" }) }),
  );
  assert.match(html, /Deuda informada USD/);
  assert.match(html, /Facturas no informadas/);
  assert.match(html, /No informado/);
  assert.doesNotMatch(html, /0 facturas|0 días|No hay deudas/);
});


test("deudas: reporte consolidado prevalece aunque vista nativa antigua responda vacío", async()=>{
  const calls=mockDb(()=>({data:[],error:null}), args=>({data:{finance_layout:'bank_accounts_split',section:args.p_section,data:args.p_section==='summary'?{...legacySummary,totalOwed:9}:[{...legacyFixtures.receivables[0],member_id:null,client_id:'manual',total_owed_nio:9}]},error:null}));
  const rows=await queries.getAccountsReceivable();assert.equal(rows[0].memberId,null);assert.equal(rows[0].clientId,'manual');assert.equal(rows[0].totalOwedNio,9);
  assert.equal((await queries.getCashSummary()).totalOwed,9);assert.equal(calls.length,0);
});
for(const response of [{data:null,error:{code:'42501'}},{data:null,error:null}])test("deudas: reporte fallido no permite fallback a ceros viejos "+JSON.stringify(response),async()=>{
  const calls=mockDb(()=>({data:[],error:null}),()=>response);
  await assert.rejects(queries.getAccountsReceivable(),FinanceReadError);await assert.rejects(queries.getCashSummary(),FinanceReadError);assert.equal(calls.length,0);
});
