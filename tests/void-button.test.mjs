import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./helpers/react-loader.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test/es/panel/caja",
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Node",
  "FormData",
  "sessionStorage",
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = dom.window;
const { render, screen, cleanup } = await import("@testing-library/react");
afterEach(() => cleanup());

const load = createLoader({
  "next/navigation": "export const useRouter=()=>({refresh(){}});",
});
const { CashPanel } = await load("components/admin/cash-panel.tsx");
const { normalizeCashierPermissions } = await load(
  "lib/finance/cashier-permissions.ts",
);

const ALL = normalizeCashierPermissions({
  dailyClose: true,
  monthlyResult: true,
  charts: true,
  accountBalances: true,
  expenses: true,
  receivables: true,
  void: true,
});

const movement = (overrides = {}) => ({
  id: "66701e7b-b7cb-49ed-8ac0-9d2fd81beab1",
  occurredAt: "2026-10-28T23:52:00-06:00",
  direction: "income",
  status: "completed",
  amount: 560,
  currency: "NIO",
  fxRate: 1,
  baseAmount: 560,
  paymentMethodId: "efectivo_nio",
  accountId: "caja_fuerte_nio",
  memberId: null,
  memberName: "Socia de prueba",
  invoiceId: null,
  expenseCategoryId: null,
  concept: "Gimnasio mensual",
  notes: null,
  createdBy: "03baac40-c0d4-40aa-b949-8bf90696b495",
  ...overrides,
});

const summary = {
  incomeToday: 560,
  expenseToday: 0,
  netToday: 560,
  txToday: 1,
  incomeMonth: 560,
  expenseMonth: 0,
  netMonth: 560,
  txMonth: 1,
  pendingInvoices: null,
  totalOwed: 0,
  totalOwedUsd: 0,
  sourceModel: "bank_accounts_split",
  openRegisterCount: 0,
  openRegister: null,
};

function renderPanel({ permissions = ALL, recent = [movement()] } = {}) {
  return render(
    React.createElement(CashPanel, {
      summary,
      recent,
      daily: [],
      monthly: [],
      methods: [],
      paymentMethodNames: { efectivo_nio: "Efectivo" },
      paymentMethodIcons: {},
      accounts: [],
      isDemo: false,
      permissions,
    }),
  );
}

test("caja: con el interruptor encendido cada cobro ofrece anular", () => {
  renderPanel();
  assert.ok(screen.getAllByRole("button", { name: /Anular/ }).length >= 1);
});

test("caja: con el interruptor apagado no aparece ningún botón de anular", () => {
  renderPanel({ permissions: { ...ALL, void: false } });
  assert.equal(screen.queryAllByRole("button", { name: /Anular/ }).length, 0);
  // El resto de la pantalla sigue igual: no se esconde el movimiento.
  assert.ok(screen.getAllByText(/Gimnasio mensual/).length >= 1);
});

test("caja: un egreso también se puede anular y una transferencia no", () => {
  renderPanel({
    recent: [
      movement({
        id: "ba58165c-59ba-4144-8576-d11e23cfcbfc",
        direction: "expense",
        concept: "Compra de discos",
        createdBy: "10be1244-4fd5-459b-9995-1d195e9e8ec1",
      }),
    ],
  });
  assert.equal(screen.getAllByRole("button", { name: /Anular/ }).length, 1);
  cleanup();
  renderPanel({
    recent: [
      movement({
        id: "3f9a2c14-7a4e-4a1c-9a1e-6b3f2a0d5c11",
        direction: "transfer",
        concept: "Paso a banco",
      }),
    ],
  });
  assert.equal(screen.queryAllByRole("button", { name: /Anular/ }).length, 0);
});

test("caja: un movimiento que no está completado no se anula desde la lista", () => {
  renderPanel({ recent: [movement({ status: "cancelled" })] });
  assert.equal(screen.queryAllByRole("button", { name: /Anular/ }).length, 0);
});
