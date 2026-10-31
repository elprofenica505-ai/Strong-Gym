import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";
import { JSDOM } from "jsdom";
const { MiniBar, CashPanel } = await createLoader()(
  "components/admin/cash-panel.tsx",
);
const { FinanceKpis } = await createLoader()(
  "components/admin/finance-kpis.tsx",
);
const { normalizeCashierPermissions } = await createLoader()(
  "lib/finance/cashier-permissions.ts",
);
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test/es/panel/caja",
});
for (const key of ["window", "document", "navigator", "HTMLElement", "Node"])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = dom.window;
const { render: renderPanel, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
afterEach(() => cleanup());
const render = (data) =>
  renderToStaticMarkup(
    React.createElement(MiniBar, { data, label: "Resultado informado" }),
  );

test("gráfico: resultado negativo usa magnitud positiva y crece debajo del eje cero", () => {
  const html = render([
    { label: "2026-09", value: -166500 },
    { label: "2026-10", value: -86600 },
  ]);
  assert.match(html, /height:56px;top:64px/);
  assert.match(html, /height:29\.1267\d+px;top:64px/);
  assert.doesNotMatch(html, /height:-|height:.*?%|NaN/);
  assert.match(html, /negativos abajo/);
  assert.match(html, /Ver importes del gráfico/);
  assert.match(html, /-.*86[,.]600/);
});
test("gráfico mixto: ambos signos comparten escala absoluta y eje cero", () => {
  const html = render([
    { label: "positivo", value: 200 },
    { label: "negativo", value: -100 },
  ]);
  assert.match(html, /height:56px;bottom:64px/);
  assert.match(html, /height:28px;top:64px/);
  assert.match(html, /bg-alert/);
  assert.match(html, /bg-brand/);
});
test("gráfico en cero no afirma ausencia de movimientos", () => {
  const html = render([
    { label: "09-19", value: 0 },
    { label: "09-24", value: 0 },
  ]);
  assert.match(html, /importes de los 2 registros mostrados son 0 NIO/);
  assert.match(html, /height:2px;bottom:63px/);
  assert.doesNotMatch(html, /Sin registros informados/);
});
test("gráfico sin registros se diferencia de importes cero", () => {
  const html = render([]);
  assert.match(html, /Sin registros informados para este gráfico/);
  assert.doesNotMatch(html, /registros mostrados son 0 NIO|<table/);
});
test("gráfico móvil: fechas sin partir y espacio desplazable para catorce columnas", () => {
  const html = render(
    Array.from({ length: 14 }, (_, i) => ({
      label: `10-${String(i + 1).padStart(2, "0")}`,
      value: i,
    })),
  );
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /min-width:476px/);
  assert.match(html, /whitespace-nowrap/);
  assert.equal((html.match(/scope="row"/g) || []).length, 14);
});
test("valor no finito no se convierte en una barra cero ni una altura inválida", () => {
  const html = render([{ label: "desconocido", value: NaN }]);
  assert.doesNotMatch(html, /height:NaN|height:2px|son 0 NIO/);
  assert.match(html, /desconocido: —/);
});

test("contenedores de gráficos permiten encoger el grid sin trasladar el ancho mínimo a la página", () => {
  const { container } = renderPanel(
    React.createElement(CashPanel, {
      summary: {
        incomeToday: 0,
        expenseToday: 0,
        netToday: 0,
        txToday: 0,
        incomeMonth: 0,
        expenseMonth: 0,
        netMonth: 0,
        txMonth: 0,
        pendingInvoices: null,
        totalOwed: 0,
        totalOwedUsd: 0,
        sourceModel: "bank_accounts_split",
        openRegisterCount: 0,
        openRegister: null,
      },
      recent: [],
      daily: Array.from({ length: 14 }, (_, i) => ({
        day: `2026-10-${String(i + 1).padStart(2, "0")}`,
        incomeNio: 0,
        expenseNio: 1,
        netNio: -1,
        txCount: 1,
      })),
      monthly: [],
      methods: [],
      paymentMethodNames: {},
      paymentMethodIcons: {},
      accounts: [],
      isDemo: false,
    }),
  );
  const clientChargeLink = [...container.querySelectorAll("a")].find((link) =>
    link.textContent.includes("Cobrar o registrar entrada"),
  );
  assert.ok(clientChargeLink.classList.contains("bg-brand"));
  assert.ok(clientChargeLink.querySelector("svg"));
  fireEvent.click(screen.getByRole("button", { name: /^Gráficos/ }));
  const charts = [...container.querySelectorAll("section[aria-label]")].filter(
    (section) =>
      /^(Ingresos|Resultado) NIO/.test(section.getAttribute("aria-label") ?? ""),
  );
  assert.equal(charts.length, 2);
  for (const chart of charts) {
    assert.ok(chart.classList.contains("min-w-0"));
    assert.ok(chart.parentElement.classList.contains("min-w-0"));
    assert.ok(
      chart.parentElement.parentElement.classList.contains("grid-cols-1"),
    );
    assert.ok(
      chart.parentElement.parentElement.classList.contains("lg:grid-cols-2"),
    );
  }
  const scroll = charts[0].querySelector('[role="region"]');
  for (const cls of ["w-full", "min-w-0", "max-w-full", "overflow-x-auto"])
    assert.ok(scroll.classList.contains(cls));
  assert.equal(scroll.tabIndex, 0);
  assert.match(scroll.getAttribute("aria-label"), /Desplazar gráfico/);
  assert.equal(scroll.firstElementChild.style.minWidth, "476px");
  assert.equal(scroll.style.minWidth, "");
});

const permissionSummary = {
  incomeToday: 100,
  expenseToday: 30,
  netToday: 70,
  txToday: 2,
  incomeMonth: 1000,
  expenseMonth: 400,
  netMonth: 600,
  txMonth: 5,
  pendingInvoices: null,
  totalOwed: 777,
  totalOwedUsd: 8,
  sourceModel: "bank_accounts_split",
  openRegisterCount: 0,
  openRegister: null,
};

test("Caja por módulos: movimientos paginados, búsqueda y saldos por cuenta", () => {
  const recent = Array.from({ length: 27 }, (_, index) => ({
    id: `movimiento-${index + 1}`,
    occurredAt: "2026-10-26T18:00:00.000Z",
    direction: "income",
    amount: 10,
    currency: "NIO",
    concept:
      index === 26
        ? "Movimiento especial"
        : `Movimiento EJEMPLO ${index + 1}`,
    paymentMethodId: "metodo-1",
    status: "completed",
  }));
  renderPanel(
    React.createElement(CashPanel, {
      summary: permissionSummary,
      recent,
      daily: [],
      monthly: [],
      methods: [],
      paymentMethodNames: { "metodo-1": "Efectivo" },
      paymentMethodIcons: {},
      accounts: [
        {
          id: "cuenta-1",
          name: "Caja principal",
          currency: "NIO",
          kind: "caja_fuerte",
          balance: 12345,
        },
        {
          id: "cuenta-2",
          name: "Banco Dólares",
          currency: "USD",
          kind: "bank",
          balance: 50,
        },
      ],
      isDemo: false,
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: /^Movimientos/ }));
  assert.equal(document.body.style.overflow, "hidden");
  assert.match(document.body.textContent, /Página 1 de 2/);
  assert.ok(screen.getByText("Movimiento EJEMPLO 25"));
  assert.equal(screen.queryByText("Movimiento EJEMPLO 26"), null);
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  assert.ok(screen.getByText("Movimiento EJEMPLO 26"));
  assert.ok(screen.getByText("Movimiento especial"));
  fireEvent.change(screen.getByLabelText("Buscar movimiento"), {
    target: { value: "especial" },
  });
  assert.ok(screen.getByText("Movimiento especial"));
  assert.equal(screen.queryByText("Movimiento EJEMPLO 26"), null);
  fireEvent.click(screen.getByRole("button", { name: /Volver a Caja/ }));
  assert.equal(document.body.style.overflow, "");

  fireEvent.click(screen.getByRole("button", { name: /^Cuentas y saldos/ }));
  assert.ok(screen.getByText("Caja principal"));
  assert.ok(screen.getAllByText("Saldo informado").length > 0);
  assert.match(document.body.textContent, /12[,.]345/);
  fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
  fireEvent.click(screen.getByRole("button", { name: "USD" }));
  fireEvent.click(screen.getByRole("button", { name: "Ver cuentas" }));
  assert.ok(screen.getByText("Banco Dólares"));
  assert.equal(screen.queryByText("Caja principal"), null);
});

test("permisos de caja apagados: Caja conserva el día y oculta informes, saldos y accesos delegados", () => {
  const html = renderToStaticMarkup(
    React.createElement(CashPanel, {
      summary: permissionSummary,
      recent: [
        {
          id: "tx-ingreso",
          occurredAt: "2026-10-24T12:00:00.000Z",
          direction: "income",
          amount: 100,
          currency: "NIO",
          concept: "Cobro de ejemplo",
          accountId: "cuenta-1",
          methodId: "metodo-1",
          categoryId: null,
          memberId: null,
          clientId: null,
          status: "completed",
        },
      ],
      daily: [
        {
          day: "2026-10-24",
          incomeNio: 100,
          expenseNio: 30,
          netNio: 70,
          txCount: 2,
        },
      ],
      monthly: [
        {
          month: "2026-10-01",
          incomeNio: 1000,
          expenseNio: 400,
          netNio: 600,
        },
      ],
      methods: [
        {
          methodId: "metodo-1",
          incomeNio: 100,
          expenseNio: 30,
          txCount: 2,
        },
      ],
      paymentMethodNames: { "metodo-1": "Efectivo" },
      paymentMethodIcons: {},
      accounts: [
        {
          id: "cuenta-1",
          name: "Caja principal",
          currency: "NIO",
          kind: "caja_fuerte",
          balance: 12345,
        },
      ],
      isDemo: false,
      permissions: {
        dailyClose: true,
        monthlyResult: false,
        charts: false,
        accountBalances: false,
        expenses: false,
        receivables: false,
      },
    }),
  );

  assert.match(html, /Ingresos hoy/);
  assert.match(html, /Cobro de ejemplo/);
  assert.match(html, /Cierre del día/);
  assert.doesNotMatch(html, /Resultado del mes|Deuda informada/);
  assert.doesNotMatch(html, /Ingresos NIO · 14 días|Desglose por método de pago/);
  assert.doesNotMatch(html, /12[,.]345/);
  assert.doesNotMatch(html, /Ver cuentas por cobrar|Registrar gasto y ver comprobantes/);
  assert.doesNotMatch(html, />Egresos<\/button>/);
});

test("FinanceKpis oculta el mes cuando caja no tiene ese permiso", () => {
  const html = renderToStaticMarkup(
    React.createElement(FinanceKpis, {
      summary: permissionSummary,
      showMonthly: false,
    }),
  );
  assert.match(html, /Ingresos de hoy/);
  assert.doesNotMatch(html, /Ingresos del mes|Egresos del mes|Saldo del mes/);
});

test("la normalización de permisos falla cerrada ante datos incompletos", () => {
  assert.deepEqual(normalizeCashierPermissions(null), {
    dailyClose: false,
    monthlyResult: false,
    charts: false,
    accountBalances: false,
    expenses: false,
    receivables: false,
    void: false,
  });
  assert.deepEqual(
    normalizeCashierPermissions({ dailyClose: true, charts: "true", expenses: 1 }),
    {
      dailyClose: true,
      monthlyResult: false,
      charts: false,
      accountBalances: false,
      expenses: false,
      receivables: false,
      void: false,
    },
  );
});
