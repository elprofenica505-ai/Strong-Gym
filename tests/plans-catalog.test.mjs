// Administración → Planes: cada plan dice cuánta gente lo tiene, desde cuándo
// rige su precio y quiénes lo tienen. Se monta el componente real con datos de
// ejemplo y `fetch` simulado, sin base ni navegador.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./helpers/react-loader.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test/es/panel/administracion/planes",
});
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "FormData"])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = dom.window;

const { render, screen, cleanup, fireEvent, waitFor } = await import("@testing-library/react");
afterEach(() => cleanup());

const load = createLoader();
const { PlansCatalog } = await load("components/admin/plans-catalog.tsx");

const PLAN = {
  id: "pln_gimnasio",
  slug: "gimnasio-mensual",
  name_es: "Gimnasio mensual",
  name_en: "Monthly Gym",
  period: "month",
  price_nio: 560,
  price: null,
  access_kind: "gym",
  class_id: null,
  class_name: null,
  duration_days: 30,
  validity_currency: "NIO",
  validity_amount: 600,
  is_active: true,
  sort_order: 5,
  updated_at: "2026-11-02T15:00:00Z",
  holders_active: 12,
  holders_upcoming: 3,
  sold_this_month: 9,
  last_price_change: {
    action: "edicion",
    before: { validity_amount: 560, validity_currency: "NIO" },
    after: { validity_amount: 600, validity_currency: "NIO" },
    changedAt: "2026-11-02T15:00:00Z",
    changedByName: "Carlos Sequeira",
  },
};

const CATALOG = { plans: [PLAN], classes: [] };

const renderPanel = (catalog = CATALOG) =>
  render(React.createElement(PlansCatalog, { initial: catalog }));

const usageResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    ok: true,
    usage: {
      plan: {
        id: "pln_gimnasio",
        name_es: "Gimnasio mensual",
        access_kind: "gym",
        duration_days: 30,
        validity_currency: "NIO",
        validity_amount: 600,
        price_nio: 560,
        is_active: true,
      },
      today: "2026-10-31",
      people: [
        {
          clientId: "ddbac9c0-04f4-47ef-9080-cbeea63b853a",
          name: "Socia de prueba",
          startedOn: "2026-10-28",
          expiresOn: "2026-11-26",
          daysLeft: 27,
          pricePaid: 560,
          currency: "NIO",
          state: "active",
        },
        {
          clientId: "11111111-1111-4111-8111-111111111111",
          name: "Carla Ruiz",
          startedOn: "2026-11-27",
          expiresOn: "2026-12-26",
          daysLeft: 0,
          pricePaid: 600,
          currency: "NIO",
          state: "upcoming",
        },
      ],
      history: [
        {
          action: "edicion",
          before: { validity_amount: 560, validity_currency: "NIO" },
          after: { validity_amount: 600, validity_currency: "NIO" },
          changedAt: "2026-11-02T15:00:00Z",
          changedByName: "Carlos Sequeira",
        },
        {
          action: "alta",
          before: null,
          after: { validity_amount: 560, validity_currency: "NIO" },
          changedAt: "2026-10-29T18:00:00Z",
          changedByName: "Carlos Sequeira",
        },
      ],
    },
  }),
});

test("cada plan dice cuánta gente lo tiene y cuántos cobros hubo este mes", () => {
  renderPanel();
  assert.ok(
    screen.getByText("12 personas con el plan vigente · 3 empiezan después · 9 cobros este mes"),
  );
});

test("debajo del plan se lee desde cuándo rige el precio y cuánto costaba antes", () => {
  renderPanel();
  assert.ok(screen.getByText(/600 desde el 2 de noviembre de 2026 \(antes .*560\)/));
});

test("un plan sin historial no muestra una fecha inventada", () => {
  renderPanel({
    plans: [{ ...PLAN, last_price_change: null, holders_active: 0, holders_upcoming: 0, sold_this_month: 0 }],
    classes: [],
  });
  assert.ok(screen.getByText("Todavía nadie lo tiene"));
  assert.equal(screen.queryByText(/desde el /), null);
});

test("ver quiénes: pide la lista a la base y la muestra con su vencimiento", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return usageResponse();
  };
  try {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Ver quiénes/ }));
    assert.ok(await screen.findByText("Socia de prueba"));
    assert.ok(screen.getByText(/Hasta el 26 de noviembre de 2026 · quedan 27 días/));
    assert.ok(screen.getByText(/Empieza el 27 de noviembre de 2026/));
    assert.ok(screen.getByText(/por empezar/));
    assert.ok(screen.getByText("Cambios de precio"));
    assert.ok(screen.getByText("Pasó a C$600 (antes C$560)."));
    assert.ok(screen.getByText("Primera carga: C$560."));
    assert.deepEqual(calls, ["/api/admin/plans?plan=pln_gimnasio"]);
  } finally {
    delete globalThis.fetch;
  }
});

test("ver quiénes: el botón avisa si está abierto y se puede cerrar", async () => {
  globalThis.fetch = async () => usageResponse();
  try {
    renderPanel();
    const button = screen.getByRole("button", { name: /Ver quiénes/ });
    assert.equal(button.getAttribute("aria-expanded"), "false");
    fireEvent.click(button);
    await screen.findByText("Socia de prueba");
    const close = screen.getByRole("button", { name: /Ocultar/ });
    assert.equal(close.getAttribute("aria-expanded"), "true");
    fireEvent.click(close);
    await waitFor(() => assert.equal(screen.queryByText("Socia de prueba"), null));
  } finally {
    delete globalThis.fetch;
  }
});

test("si la consulta falla, lo dice y no muestra una lista vacía", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: "UNAVAILABLE", message: "No hay conexión con la base de datos." }),
  });
  try {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Ver quiénes/ }));
    const alerta = await screen.findByRole("alert");
    assert.match(alerta.textContent ?? "", /No hay conexión con la base de datos/);
    assert.equal(screen.queryByText(/Nadie tiene este plan vigente/), null);
  } finally {
    delete globalThis.fetch;
  }
});

test("si lo que llega no tiene la forma esperada, no se dibuja nada a medias", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, usage: { algo: "raro" } }),
  });
  try {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Ver quiénes/ }));
    const alerta = await screen.findByRole("alert");
    assert.match(alerta.textContent ?? "", /no coincide con la lista esperada/);
  } finally {
    delete globalThis.fetch;
  }
});

test("un plan sin gente lo dice con palabras, no con un cero", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      usage: {
        plan: { id: "pln_gimnasio", name_es: "Gimnasio mensual", is_active: true },
        today: "2026-10-31",
        people: [],
        history: [],
      },
    }),
  });
  try {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Ver quiénes/ }));
    assert.ok(await screen.findByText(/Nadie tiene este plan vigente ni por empezar/));
    assert.ok(
      screen.getByText(/Sin cambios registrados: el plan sigue con el precio de arriba/),
    );
  } finally {
    delete globalThis.fetch;
  }
});
