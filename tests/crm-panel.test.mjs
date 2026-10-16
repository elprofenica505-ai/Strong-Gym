import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./helpers/react-loader.mjs";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test",
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
const { render, screen, fireEvent, waitFor, cleanup, act } = await import(
  "@testing-library/react"
);
const { ClientsPanel } = await createLoader({
  "@/components/providers/dictionary-provider":
    'export const useDictionary = () => ({locale:"es"});',
})("components/crm/clients-panel.tsx");
const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  sessionStorage.clear();
  window.confirm = originalConfirm;
});
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const token = "33333333-3333-4333-8333-333333333333";
const client = (cid = id, name = "Hellen Reyes", num = 1) => ({
  id: cid,
  full_name: name,
  client_number: num,
  phone: null,
  email: null,
  plan_id: null,
  category: "client",
  status: "active",
  notes: "",
  is_demo: true,
  balance_nio: 0,
});
const detail = (c = client()) => ({
  client: c,
  card: token,
  visits: [],
  events: [],
  payments: [],
  balance: null,
});
const options = {
  plans: [],
  methods: [
    { id: "cash", name_es: "Efectivo", accepts_nio: true, accepts_usd: false },
  ],
  accounts: [{ id: "cash_nio", name: "Caja NIO", currency: "NIO" }],
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });
function setup(
  handler,
  rows = [client()],
  optionsResponse = () => json(options),
) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      body: init.body ? JSON.parse(init.body) : null,
    });
    const u = new URL(url, "https://strong.test");
    if (u.searchParams.get("mode") === "options") return optionsResponse();
    if (!u.searchParams.has("id") && init.method !== "POST")
      return json({ rows, total: rows.length });
    return handler(u, init);
  };
  render(React.createElement(ClientsPanel, { isAdmin: true, isDemo: false }));
  return calls;
}
async function open(name = "Hellen Reyes") {
  fireEvent.click(
    await screen.findByRole("button", { name: new RegExp(name) }),
  );
}
const heading = (name = "Hellen Reyes") =>
  screen.findByRole("heading", { name: new RegExp(name) });

test("nombre primero, QR opcional; búsqueda envía nombre sin exigir carnet", async () => {
  const calls = setup(() => json(detail()));
  assert.equal(screen.queryByLabelText("Lector USB o código copiado"), null);
  const search = screen.getByLabelText("Nombre, teléfono o número de cliente");
  fireEvent.change(search, { target: { value: "Hellen" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar", exact: true }));
  await waitFor(() =>
    assert.ok(calls.some((c) => c.url.includes("search=Hellen"))),
  );
  await open();
  await heading();
  assert.equal(
    calls.filter((c) => c.body).length,
    0,
    "abrir no registra ni cobra",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Usar QR o lector (opcional)" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Buscar por nombre", exact: true }),
  );
  assert.equal(document.activeElement, search);
});

test("error de ficha termina carga, sobrevive al éxito del listado y reintenta sólo GET", async () => {
  let fail = true;
  const calls = setup(() =>
    fail
      ? json(
          {
            error: "La base rechazó permisos para la ficha.",
            code: "CRM_DETAIL_42501",
          },
          503,
        )
      : json(detail()),
  );
  await open();
  await screen.findByRole("heading", { name: "No pudimos abrir esta ficha" });
  assert.equal(screen.queryByText("Cargando ficha…"), null);
  assert.match(screen.getByRole("alert").textContent, /CRM_DETAIL_42501/);
  fireEvent.click(screen.getByRole("button", { name: "Buscar", exact: true }));
  await waitFor(() =>
    assert.ok(calls.filter((c) => c.url.includes("id=")).length >= 2),
  );
  assert.ok(await screen.findByText(/CRM_DETAIL_42501/));
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Reintentar ficha" }));
  await heading();
  assert.equal(screen.queryByText("No pudimos abrir esta ficha"), null);
  assert.equal(calls.filter((c) => c.body).length, 0);
});

for (const [label, response] of [
  ["null", () => json(null)],
  ["JSON inválido", () => new Response("<html>error</html>")],
]) {
  test(`detalle ${label}: error visible, no carga infinita ni ficha inventada`, async () => {
    setup(() => response());
    await open();
    await screen.findByRole("heading", { name: "No pudimos abrir esta ficha" });
    assert.equal(screen.queryByText("Cargando ficha…"), null);
    assert.equal(
      screen.queryByRole("button", { name: /Confirmar entrada/ }),
      null,
    );
  });
}

test("respuesta tardía del cliente anterior no reemplaza al cliente actual", async () => {
  let resolveFirst;
  setup(
    (u) =>
      u.searchParams.get("id") === id
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : json(detail(client(other, "Carlos Prueba", 2))),
    [client(), client(other, "Carlos Prueba", 2)],
  );
  await open();
  await waitFor(() => assert.ok(resolveFirst));
  await open("Carlos Prueba");
  await heading("Carlos Prueba");
  await act(async () => {
    resolveFirst(json(detail()));
  });
  assert.equal(screen.queryByRole("heading", { name: /Hellen Reyes/ }), null);
  assert.ok(screen.getByRole("heading", { name: /Carlos Prueba/ }));
});

test("alta sólo nombre se conserva aunque falle ficha; reintentar no duplica alta", async () => {
  const calls = setup((u, init) =>
    init.method === "POST"
      ? json({ data: id })
      : json({ error: "Fallo en ficha", code: "CRM_DETAIL_42703" }, 503),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Nuevo cliente", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Nombre completo *"), {
    target: { value: "Hellen Reyes" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cliente" }));
  await screen.findByRole("heading", { name: "No pudimos abrir esta ficha" });
  assert.ok(screen.getByText(/Cliente creado\. No lo registres de nuevo/));
  assert.equal(calls.filter((c) => c.body?.action === "create").length, 1);
  assert.equal(calls.find((c) => c.body)?.body.phone, "");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar ficha" }));
  await waitFor(() =>
    assert.ok(calls.filter((c) => c.url.includes("id=")).length >= 2),
  );
  assert.equal(calls.filter((c) => c.body?.action === "create").length, 1);
});

test("fallo de opciones no borra listado ni ficha y bloquea cobros", async () => {
  setup(
    () => json(detail()),
    [client()],
    () => json({ error: "No disponible", code: "CRM_OPTIONS_42P01" }, 503),
  );
  await open();
  await heading();
  assert.ok(screen.getByText(/CRM_OPTIONS_42P01/));
  assert.ok(screen.getByRole("button", { name: "Confirmar cobro" }).disabled);
  assert.equal(screen.queryByText("No pudimos abrir esta ficha"), null);
});

test("refresh conserva referencia de cobro y oculta carnet obsoleto hasta confirmar detalle", async () => {
  let details = 0,
    resolveRefresh;
  const pending = {
    action: "payment",
    id,
    requestId: other,
    amount: 500,
    currency: "NIO",
    method: "cash",
    account: "cash_nio",
    concept: "Mensualidad",
    fx: 1,
  };
  sessionStorage.setItem(
    `strong-gym:crm-payment:${id}`,
    JSON.stringify(pending),
  );
  setup(() =>
    ++details === 1
      ? json(detail())
      : new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
  );
  await open();
  await heading();
  assert.ok(screen.getByText(`Referencia de intento: ${other}`));
  fireEvent.click(screen.getByRole("button", { name: "Buscar", exact: true }));
  await waitFor(() => assert.ok(resolveRefresh));
  assert.ok(screen.getByText(`Referencia de intento: ${other}`));
  assert.equal(
    screen.queryByRole("button", { name: "Imprimir / guardar PDF" }),
    null,
  );
  assert.ok(
    screen.getByRole("button", { name: "Reintentar el mismo cobro" }).disabled,
  );
  await act(async () => resolveRefresh(json(detail())));
  assert.ok(screen.getByRole("button", { name: "Imprimir / guardar PDF" }));
  assert.ok(screen.getByText(`Referencia de intento: ${other}`));
});

test("lectura de ficha colgada termina en timeout con reintento visible", async (t) => {
  setup(
    (_url, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        ),
      ),
  );
  const row = await screen.findByRole("button", { name: /Hellen Reyes/ });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  fireEvent.click(row);
  assert.ok(screen.getByText("Cargando ficha…"));
  await act(async () => t.mock.timers.tick(15001));
  assert.equal(screen.queryByText("Cargando ficha…"), null);
  assert.ok(screen.getByRole("button", { name: "Reintentar ficha" }));
  assert.ok(screen.getByText(/La lectura tardó demasiado/));
});

test("cobro con respuesta perdida conserva referencia; reintento usa exactamente el mismo cuerpo y recibo sobrevive refresh", async () => {
  let posts = 0;
  const tx = "44444444-4444-4444-8444-444444444444";
  const pending = {
    action: "payment",
    id,
    requestId: other,
    amount: 500,
    currency: "NIO",
    method: "cash",
    account: "cash_nio",
    concept: "Mensualidad",
    fx: 1,
  };
  sessionStorage.setItem(
    `strong-gym:crm-payment:${id}`,
    JSON.stringify(pending),
  );
  window.confirm = () => true;
  const calls = setup((_url, init) => {
    if (init.method !== "POST") return json(detail());
    if (++posts === 1) throw new TypeError("Failed to fetch");
    return json({ data: tx });
  });
  await open();
  await heading();
  fireEvent.click(
    screen.getByRole("button", { name: "Reintentar el mismo cobro" }),
  );
  await screen.findByText(/No se pudo confirmar la operación/);
  await waitFor(() =>
    assert.equal(
      screen.getByRole("button", { name: "Reintentar el mismo cobro" })
        .disabled,
      false,
    ),
  );
  assert.equal(
    JSON.parse(sessionStorage.getItem(`strong-gym:crm-payment:${id}`))
      .requestId,
    other,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Reintentar el mismo cobro" }),
  );
  await screen.findByText(`Cobro confirmado. Referencia: ${tx}`);
  await waitFor(() =>
    assert.ok(screen.getByRole("button", { name: "Imprimir / guardar PDF" })),
  );
  assert.ok(screen.getByText(`Cobro confirmado. Referencia: ${tx}`));
  assert.equal(sessionStorage.getItem(`strong-gym:crm-payment:${id}`), null);
  const bodies = calls.filter((c) => c.body).map((c) => c.body);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies, [pending, pending]);
});
