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

function renderPanel({ permissions = ALL, recent = [movement()], voids = [] } = {}) {
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
      voids,
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

test("caja: un movimiento ya anulado se marca y no se ofrece anular de nuevo", () => {
  // El 31 de octubre la anulación se guardaba y la lista seguía igual: parecía
  // que no había pasado nada y se reintentaba una y otra vez.
  renderPanel({
    recent: [movement()],
    voids: [
      {
        originalId: "66701e7b-b7cb-49ed-8ac0-9d2fd81beab1",
        reversalId: "c47ef1f9-7582-47b5-91f6-0b0594cd5e9a",
        reason: "El cliente se enfermó",
        actorName: "Carlos Sequeira",
        createdAt: "2026-10-31T15:56:08.478064+00:00",
      },
    ],
  });
  assert.ok(screen.getAllByText(/Anulada · El cliente se enfermó/).length >= 1);
  assert.equal(screen.queryAllByRole("button", { name: /Anular/ }).length, 0);
  // El movimiento sigue visible: no se esconde nada.
  assert.ok(screen.getAllByText(/Gimnasio mensual/).length >= 1);
});

test("anular: la confirmación es un formulario del navegador, no una respuesta que se pueda perder", async () => {
  globalThis.fetch = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        allowed: true,
        code: "ALLOWED",
        concept: "Gimnasio mensual",
        type: "income",
        amount: 560,
        currency: "NIO",
        occurredAt: "2026-10-28T23:52:00-06:00",
        transactionId: "66701e7b-b7cb-49ed-8ac0-9d2fd81beab1",
        isReversal: false,
        alreadyVoided: false,
      }),
    });

  try {
    renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: /Anular/ })[0]);
    const textarea = await screen.findByLabelText("Motivo de la anulación");

    const form = textarea.closest("form");
    assert.ok(form, "el motivo tiene que ir dentro de un formulario");
    assert.equal(form.getAttribute("method"), "post");
    assert.equal(form.getAttribute("action"), "/api/admin/finance/void");
    // Los campos que la base necesita viajan en el formulario.
    const hidden = (name) => form.querySelector(`input[name="${name}"]`);
    assert.equal(hidden("transactionId")?.value, "66701e7b-b7cb-49ed-8ac0-9d2fd81beab1");
    assert.match(hidden("requestId")?.value ?? "", /^[0-9a-f-]{36}$/);
    assert.ok(["es", "en"].includes(hidden("locale")?.value ?? ""));
    assert.equal(textarea.getAttribute("name"), "reason");

    // Sin motivo suficiente no se puede enviar; con motivo, sí.
    const submit = screen.getByRole("button", { name: /Anular y generar reversa/ });
    assert.equal(submit.getAttribute("type"), "submit");
    assert.equal(submit.disabled, true);
    fireEvent.change(textarea, { target: { value: "El cliente se enfermó" } });
    await waitFor(() => assert.equal(submit.disabled, false));
  } finally {
    delete globalThis.fetch;
  }
});

test("anular: antes de confirmar avisa que la vigencia de ese cobro se da de baja", async () => {
  // Anular devuelve el dinero y da de baja la membresía: lo decide la base
  // (00085), pero la pantalla tiene que decirlo antes de que la persona
  // confirme, no después.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      allowed: true,
      code: "ALLOWED",
      concept: "Gimnasio mensual",
      type: "income",
      amount: 560,
      currency: "NIO",
      occurredAt: "2026-10-28T23:52:00-06:00",
      transactionId: "66701e7b-b7cb-49ed-8ac0-9d2fd81beab1",
      isReversal: false,
      alreadyVoided: false,
      planSegments: [
        {
          id: "dbe127e2-cc04-4fd0-9b97-8652e98eda09",
          planId: "pln_gimnasio",
          planName: "Gimnasio mensual",
          access: "gym",
          startedOn: "2026-12-27",
          expiresOn: "2027-01-25",
          pricePaid: 560,
          currency: "NIO",
          voided: false,
          state: "upcoming",
        },
      ],
    }),
  });

  try {
    renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: /Anular/ })[0]);
    await screen.findByLabelText("Motivo de la anulación");
    const aviso = await screen.findByText(
      /Este cobro activó la vigencia de Gimnasio: del 27 de diciembre de 2026 al 25 de enero de 2027/,
    );
    assert.match(aviso.textContent ?? "", /se da de baja/);
    assert.match(aviso.textContent ?? "", /se adelantan/);
  } finally {
    delete globalThis.fetch;
  }
});

test("anular: un cobro sin vigencia no muestra el aviso de membresía", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      allowed: true,
      code: "ALLOWED",
      concept: "Agua fuente pura",
      type: "income",
      amount: 40,
      currency: "NIO",
      occurredAt: "2026-10-28T23:52:00-06:00",
      transactionId: "66701e7b-b7cb-49ed-8ac0-9d2fd81beab1",
      isReversal: false,
      alreadyVoided: false,
      planSegments: [],
    }),
  });

  try {
    renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: /Anular/ })[0]);
    await screen.findByLabelText("Motivo de la anulación");
    assert.equal(screen.queryByText(/Este cobro activó/), null);
  } finally {
    delete globalThis.fetch;
  }
});

test("anular: si la consulta previa no llega, igual se puede intentar y la base decide", async () => {
  // Antes, un fallo de lectura bloqueaba el botón y dejaba a la persona sin
  // salida. La regla vive en la base: la pantalla no puede ser el candado.
  globalThis.fetch = async () => {
    throw new Error("sin red");
  };
  try {
    renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: /Anular/ })[0]);
    const textarea = await screen.findByLabelText("Motivo de la anulación");
    assert.ok(screen.getByText(/No pudimos leer el estado de este movimiento/));
    fireEvent.change(textarea, { target: { value: "El cliente se enfermó" } });
    await waitFor(() =>
      assert.equal(
        screen.getByRole("button", { name: /Anular y generar reversa/ }).disabled,
        false,
      ),
    );
  } finally {
    delete globalThis.fetch;
  }
});

test("anular: si la base ya dijo que no, la pantalla lo explica y no deja enviar", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      allowed: false,
      code: "NOT_TODAY",
      concept: "Gimnasio mensual",
      type: "income",
      amount: 560,
      currency: "NIO",
      occurredAt: "2026-10-28T23:52:00-06:00",
      transactionId: "66701e7b-b7cb-49ed-8ac0-9d2fd81beab1",
      isReversal: false,
      alreadyVoided: false,
    }),
  });
  try {
    renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: /Anular/ })[0]);
    const textarea = await screen.findByLabelText("Motivo de la anulación");
    assert.ok(screen.getByText(/Desde caja solo se anulan movimientos del día de hoy/));
    fireEvent.change(textarea, { target: { value: "El cliente se enfermó" } });
    await waitFor(() =>
      assert.equal(
        screen.getByRole("button", { name: /Anular y generar reversa/ }).disabled,
        true,
      ),
    );
  } finally {
    delete globalThis.fetch;
  }
});
