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
const { render, screen, fireEvent, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { ClientsPanel } = await createLoader({
  "next/navigation": "export const useRouter=()=>({refresh(){}});",
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
  profile_id: null,
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
  finance: { version:1, client_id:c.id, profile_id:c.profile_id, layout:"repository",
    balance_status:c.profile_id ? "missing" : "unlinked", balance_nio:null, balances:null,
    collections:{count_nio:0,amount_nio:0,count_usd:0,amount_usd:0} },
});
const options = {
  payments_enabled: true,
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
    if (u.pathname === "/api/admin/finance") return handler(u, init);
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

test("estructura bank_accounts abre ficha y muestra monedas separadas, sin habilitar cobros", async () => {
  const legacy = {
    ...detail(),
    finance_layout: "bank_accounts_split",
    balances: { credit_nio: 100, credit_usd: 7, debt_nio: 20, debt_usd: 3 },
    client: { ...client(), profile_id: other },
    finance: { ...detail().finance, profile_id:other, layout:"bank_accounts_split", balance_status:"ready",
      balances:{credit_nio:100,credit_usd:7,debt_nio:20,debt_usd:3} },
  };
  const calls = setup(
    () => json(legacy),
    [client()],
    () =>
      json({
        ...options,
        payments_enabled: false,
        payment_block_reason: "Caja pendiente de compatibilidad",
      }),
  );
  await open();
  await heading();
  assert.ok(screen.getByText("Crédito NIO: C$ 100.00"));
  assert.ok(screen.getByText("Deuda NIO: C$ 20.00"));
  assert.ok(screen.getByText("Crédito USD: US$ 7.00"));
  assert.ok(screen.getByText("Deuda USD: US$ 3.00"));
  assert.equal(screen.queryByText(/Saldo de cuenta vinculada:/), null);
  assert.ok(screen.getByRole("button", { name: "Confirmar cobro" }).disabled);
  assert.ok(screen.getByText("Caja pendiente de compatibilidad"));
  assert.equal(
    screen.getByRole("button", { name: /Confirmar entrada/ }).disabled,
    false,
  );
  assert.equal(calls.filter((c) => c.body).length, 0);
});
test("cobro pendiente conserva referencia pero no puede reintentarse en modelo bloqueado", async () => {
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
  const calls = setup(
    () => json(detail()),
    [client()],
    () => json({ ...options, payments_enabled: false }),
  );
  await open();
  await heading();
  const button = screen.getByRole("button", {
    name: "Reintentar el mismo cobro",
  });
  assert.ok(button.disabled);
  fireEvent.submit(button.closest("form"));
  assert.equal(calls.filter((c) => c.body).length, 0);
  assert.deepEqual(
    JSON.parse(sessionStorage.getItem(`strong-gym:crm-payment:${id}`)),
    pending,
  );
});

test("primera entrada y reintento muestran confirmación junto al botón, no sólo arriba", async () => {
  let writes = 0;
  const visits = [
    {
      id: other,
      visited_at: "2026-10-16T04:01:00Z",
      local_day: "2026-10-15",
      source: "manual",
    },
  ];
  const calls = setup((_url, init) => {
    if (init.method === "POST")
      return json({ data: { already: ++writes > 1, id: other } });
    return json({ ...detail(), visits: writes ? visits : [] });
  });
  await open();
  await heading();
  const entry = screen.getByRole("button", {
    name: "Confirmar entrada manual",
  });
  fireEvent.click(entry);
  const first = await screen.findByText(
    "Entrada registrada. No se realizó ningún cobro.",
  );
  assert.equal(first.parentElement.id, entry.getAttribute("aria-describedby"));
  assert.equal(first.closest("section"), entry.closest("section"));
  await waitFor(() => assert.equal(entry.disabled, false));
  fireEvent.click(entry);
  const repeated = await screen.findByText(
    "Este cliente ya tiene una visita registrada hoy. No se duplicó.",
  );
  assert.equal(repeated.parentElement.id, "crm-entry-feedback");
  await waitFor(() => assert.equal(entry.disabled, false));
  assert.ok(screen.getByText(/10:01 p/));
  assert.equal(calls.filter((c) => c.body?.action === "check-in").length, 2);
  assert.equal(calls.filter((c) => c.body?.action === "payment").length, 0);
  assert.equal(screen.getAllByText(/10:01 p/).length, 1);
});
test("error de entrada es visible en su botón y no se confunde con registro confirmado", async () => {
  setup((_url, init) =>
    init.method === "POST"
      ? json({ error: "No se pudo confirmar la entrada." }, 503)
      : json(detail()),
  );
  await open();
  await heading();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar entrada manual" }),
  );
  await waitFor(() =>
    assert.match(
      document.getElementById("crm-entry-feedback").textContent,
      /No se pudo confirmar/,
    ),
  );
  assert.equal(
    document
      .getElementById("crm-entry-feedback")
      .querySelector('[role="alert"]').textContent,
    "No se pudo confirmar la entrada.",
  );
  assert.equal(
    screen.queryByText("Entrada registrada. No se realizó ningún cobro."),
    null,
  );
});
test("respuesta de entrada incompleta no muestra éxito ni provoca repetición automática", async () => {
  const calls = setup((_url, init) =>
    init.method === "POST" ? json({ data: {} }) : json(detail()),
  );
  await open();
  await heading();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar entrada manual" }),
  );
  await screen.findByText(/El servidor no confirmó el resultado/);
  assert.equal(calls.filter((c) => c.body).length, 1);
  assert.equal(
    screen.queryByText("Entrada registrada. No se realizó ningún cobro."),
    null,
  );
});
test("cambiar de cliente limpia el aviso de entrada anterior", async () => {
  const calls = setup(
    (u, init) =>
      init.method === "POST"
        ? json({ data: { already: true } })
        : json(
            detail(
              u.searchParams.get("id") === other
                ? client(other, "Carlos Prueba", 2)
                : client(),
            ),
          ),
    [client(), client(other, "Carlos Prueba", 2)],
  );
  await open();
  await heading();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar entrada manual" }),
  );
  await screen.findByText(/ya tiene una visita registrada hoy/);
  await waitFor(() =>
    assert.equal(
      screen.getByRole("button", { name: "Confirmar entrada manual" }).disabled,
      false,
    ),
  );
  await open("Carlos Prueba");
  await heading("Carlos Prueba");
  assert.equal(screen.queryByText(/ya tiene una visita registrada hoy/), null);
  assert.equal(calls.filter((c) => c.body).length, 1);
});

test("ficha bancaria usa el nuevo protocolo de cobro sin depender del escritor legacy bloqueado", async () => {
  const bank = {
    ...options,
    finance_layout: "bank_accounts_split",
    payments_enabled: false,
  };
  const calls = setup(
    (url, init) => {
      if (url.pathname === "/api/admin/finance")
        return json(
          url.searchParams.has("history")
            ? []
            : {
                ...bank,
                protocol: "service-v1",
                writes_enabled: true,
                categories: [],
              },
        );
      return json({ ...detail(), finance_layout: "bank_accounts_split" });
    },
    [client()],
    () => json(bank),
  );
  await open();
  await screen.findByRole("heading", { name: "Cobro por servicio" });
  const submit = screen.getByRole("button", {
    name: "Confirmar cobro por servicio",
  });
  await waitFor(() => assert.equal(submit.disabled, false));
  assert.ok(screen.getByText(/No reduce deudas/));
  assert.equal(screen.queryByText(/Los cobros están bloqueados/), null);
  assert.ok(calls.some((c) => c.url === "/api/admin/finance"));
});

test("saldo: SQL anterior no bloquea recepción y reintentar confirma sección sólo con GET", async () => {
  let updated=false;
  const calls=setup(()=>{
    const value=detail();
    if(!updated) delete value.finance;
    return json(value);
  });
  await open(); await heading();
  await screen.findByText('CRM_FINANCE_READ_UNCONFIRMED');
  assert.equal(screen.getByRole('button',{name:/Confirmar entrada/}).disabled,false);
  assert.equal(screen.queryByText(/Córdobas: C\$ 0.00/),null);
  updated=true;
  fireEvent.click(screen.getByRole('button',{name:'Reintentar saldo y cobros'}));
  await screen.findByText('Córdobas: C$ 0.00 · 0 cobros');
  assert.equal(screen.queryByText('CRM_FINANCE_READ_UNCONFIRMED'),null);
  assert.equal(calls.filter(call=>call.body).length,0);
});

test("saldo: un refresh fallido oculta cifras antiguas sin anunciar cero", async () => {
  let fail=false;
  const value=detail();
  value.finance.collections={count_nio:1,amount_nio:125,count_usd:0,amount_usd:0};
  const calls=setup(()=> fail ? json({error:'Lectura no confirmada'},503) : json(value));
  await open(); await screen.findByText('Córdobas: C$ 125.00 · 1 cobro');
  fail=true;
  fireEvent.click(screen.getByRole('button',{name:'Buscar',exact:true}));
  await screen.findByText('CRM_FINANCE_READ_UNCONFIRMED');
  assert.equal(screen.queryByText('Córdobas: C$ 125.00 · 1 cobro'),null);
  assert.equal(screen.queryByText(/Córdobas: C\$ 0.00/),null);
  fail=false;
  const retry=screen.getByRole('button',{name:'Reintentar saldo y cobros'});
  assert.equal(retry.disabled,false);
  fireEvent.click(retry);
  await screen.findByText('Córdobas: C$ 125.00 · 1 cobro');
  assert.equal(calls.filter(call=>call.body).length,0);
});

test("saldo: respuesta financiera de otra ficha no se muestra aunque la ficha principal coincida", async () => {
  const value=detail();
  value.finance.client_id=other;
  value.finance.collections={count_nio:1,amount_nio:777,count_usd:0,amount_usd:0};
  setup(()=>json(value));
  await open(); await heading();
  await screen.findByText('CRM_FINANCE_READ_UNCONFIRMED');
  assert.equal(screen.queryByText(/Córdobas: C\$ 777.00/),null);
  assert.equal(screen.getByRole('button',{name:/Confirmar entrada/}).disabled,false);
});

test("saldo: datos financieros inválidos se aíslan de recepción, no bloquean toda la ficha", async () => {
  const value=detail();
  value.balance='incorrecto';
  value.finance.balance_status='ready';
  value.finance.balance_nio=null;
  setup(()=>json(value));
  await open(); await heading();
  await screen.findByText('CRM_FINANCE_READ_UNCONFIRMED');
  assert.equal(screen.getByRole('button',{name:/Confirmar entrada/}).disabled,false);
  assert.equal(screen.queryByText('No pudimos abrir esta ficha'),null);
});
