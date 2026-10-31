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
const { render, screen, cleanup, fireEvent, waitFor } = await import("@testing-library/react");
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

test("anular: si la respuesta se pierde, la pantalla confirma lo que sí se guardó", async () => {
  // Caso real del 31 de octubre: la base anuló, el dinero y el stock se
  // movieron, pero la respuesta no llegó al celular. La pantalla no puede
  // quedarse en «no se pudo anular»: consulta la base y muestra el comprobante.
  let posted = false;
  let gets = 0;
  const receipt = {
    id: "c47ef1f9-7582-47b5-91f6-0b0594cd5e9a",
    originalId: "66701e7b-b7cb-49ed-8ac0-9d2fd81beab1",
    reversalId: "c47ef1f9-7582-47b5-91f6-0b0594cd5e9a",
    amount: 560,
    currency: "NIO",
    concept: "Anulación: Gimnasio mensual",
    originalConcept: "Gimnasio mensual",
    reason: "El cliente se enfermó",
    accountName: "Caja Fuerte Córdobas",
    accountBefore: -95824,
    accountAfter: -96384,
    actorName: "Carlos Sequeira",
    occurredAt: "2026-10-31T15:56:08.491891+00:00",
    stockRestored: [
      { productId: "f7622a6e-189d-4736-8adb-f24127819856", name: "Agua fuente pura", qty: 2 },
    ],
  };
  const reply = (body, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST") {
      posted = true;
      return reply(
        {
          error: "UNCONFIRMED",
          stage: "rpc",
          diagnostic: "ANULACION_RPC_SIN_CODIGO",
          message:
            "No pudimos confirmar si la anulación quedó guardada. Reintentá desde acá: el pedido es el mismo, así que no se anula dos veces.",
        },
        502,
      );
    }
    gets += 1;
    // Antes de anular el plan dice que sí; después, que ya está anulada.
    return reply(
      posted
        ? {
            allowed: false,
            code: "ALREADY_VOIDED",
            alreadyVoided: true,
            concept: "Gimnasio mensual",
            receipt,
          }
        : {
            allowed: true,
            code: "ALLOWED",
            concept: "Gimnasio mensual",
            amount: 560,
            currency: "NIO",
            occurredAt: "2026-10-28T23:52:00-06:00",
          },
    );
  };

  try {
    renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: /Anular/ })[0]);
    const textarea = await screen.findByLabelText("Motivo de la anulación");
    fireEvent.change(textarea, { target: { value: "El cliente se enfermó" } });
    fireEvent.click(screen.getByRole("button", { name: /Anular y generar reversa/ }));
    await waitFor(() => assert.ok(screen.getByText("Anulación registrada")));
    assert.equal(posted, true);
    assert.ok(gets >= 2, "tiene que volver a preguntar antes de avisar");
    // Y muestra lo que de verdad pasó, incluido el stock devuelto.
    assert.ok(screen.getByText(/Agua fuente pura ×2/));
  } finally {
    delete globalThis.fetch;
  }
});
