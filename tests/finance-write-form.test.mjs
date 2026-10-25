import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./helpers/react-loader.mjs";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test/es/panel/gastos",
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
const { MovementForm } = await createLoader({
  "next/navigation": "export const useRouter=()=>({refresh(){}});",
})("components/admin/movement-form.tsx");
const id = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const productReceiptId = "33333333-3333-4333-8333-333333333333";
const waterCatalog = {
  products: [
    {
      id: productId,
      name: "Agua EJEMPLO",
      category: "Bebidas",
      subcategory: null,
      attributes: { Tamaño: "600 ml" },
      price: 15,
      stock: 3,
      low_stock: false,
    },
  ],
};
const options = {
  protocol: "service-v1",
  writes_enabled: true,
  finance_layout: "bank_accounts_split",
  methods: [
    {
      id: "cash",
      name_es: "Efectivo EJEMPLO",
      accepts_nio: true,
      accepts_usd: false,
    },
  ],
  accounts: [{ id: "nio", name: "Caja EJEMPLO", currency: "NIO" }],
  categories: [{ id: "cat", name: "Categoría EJEMPLO" }],
};
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  globalThis.fetch = originalFetch;
  window.confirm = () => true;
});
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const key = "strong-gym:finance-v1:expense:general";
const pending = {
  requestId: id,
  kind: "expense",
  amount: 10,
  currency: "NIO",
  method: "cash",
  account: "nio",
  fx: 36.7244,
  concept: "Gasto EJEMPLO",
  category: "cat",
};
function mount(
  handler = () => json({ id }),
  opts = options,
  props = {},
  catalog = { products: [] },
) {
  const posts = [];
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      posts.push(body);
      return handler(body);
    }
    if (String(url).includes("catalog=sale")) return json(catalog);
    return json(String(url).includes("history=") ? [] : opts);
  };
  window.confirm = () => true;
  const result = render(
    React.createElement(MovementForm, {
      kind: "expense",
      locale: "es",
      ...props,
    }),
  );
  return { posts, ...result };
}
async function fill() {
  await waitFor(() =>
    assert.equal(
      screen.getByRole("button", { name: "Confirmar gasto" }).disabled,
      false,
    ),
  );
  for (const [name, value] of [
    ["Monto", "10"],
    ["Método", "cash"],
    ["Cuenta", "nio"],
    ["Tasa NIO por 1 USD", "36.7244"],
    ["Categoría", "cat"],
    ["Concepto", "Gasto EJEMPLO"],
  ])
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
test("gasto confirma, persiste UUID antes del POST y ofrece comprobante", async () => {
  const { posts } = mount((body) => {
    assert.equal(
      JSON.parse(sessionStorage.getItem(key)).requestId,
      body.requestId,
    );
    return json({ id });
  });
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
  assert.ok(
    await screen.findByRole("link", { name: /Abrir comprobante interno/ }),
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].fx, 36.7244);
  assert.equal(posts[0].kind, "expense");
  assert.equal(sessionStorage.getItem(key), null);
});
test("doble submit mientras responde: una petición, sin nuevo UUID", async () => {
  let finish;
  const response = new Promise((r) => {
    finish = r;
  });
  const { posts } = mount(() => response);
  await fill();
  const button = screen.getByRole("button", { name: "Confirmar gasto" });
  fireEvent.click(button);
  fireEvent.click(button);
  assert.equal(posts.length, 1);
  await act(async () => finish(json({ id })));
  await screen.findByRole("link", { name: /Abrir comprobante/ });
});
test("respuesta perdida, recarga y reintento conservan TODO el payload", async () => {
  const first = mount(() => {
    throw new TypeError("network");
  });
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
  await screen.findByText(/Conservá esta referencia/);
  const saved = JSON.parse(sessionStorage.getItem(key));
  assert.equal(first.posts.length, 1);
  first.unmount();
  const second = mount();
  const retry = await screen.findByRole("button", {
    name: "Reintentar exactamente el mismo movimiento",
  });
  await waitFor(() => assert.equal(retry.disabled, false));
  fireEvent.click(retry);
  await screen.findByRole("link", { name: /Abrir comprobante/ });
  assert.deepEqual(second.posts, [saved]);
});
test("cancelar confirmación no guarda ni envía", async () => {
  const { posts } = mount();
  await fill();
  window.confirm = () => false;
  fireEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
  assert.equal(posts.length, 0);
  assert.equal(sessionStorage.getItem(key), null);
});
test("tasa vacía no se reemplaza por 1, rechazo/response inválida conserva referencia", async () => {
  const { posts } = mount(() => json({}));
  await fill();
  assert.equal(screen.getByLabelText("Tasa NIO por 1 USD").defaultValue, "");
  fireEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
  await screen.findByText(/Conservá esta referencia/);
  assert.equal(posts.length, 1);
  assert.ok(sessionStorage.getItem(key));
  assert.equal(screen.queryByText(/Movimiento confirmado/), null);
});
for (const [label, opts] of [
  ["bloqueado", { ...options, writes_enabled: false }],
  ["incompleto", {}],
])
  test(`opciones ${label}: no se envía`, async () => {
    const { posts } = mount(undefined, opts);
    await screen.findByText(
      label === "bloqueado"
        ? /Escritura no habilitada/
        : /respuesta llegó incompleta/,
    );
    assert.equal(
      screen.getByRole("button", { name: "Confirmar gasto" }).disabled,
      true,
    );
    assert.equal(posts.length, 0);
  });
test("intento local corrupto no se descarta para crear otro automáticamente", async () => {
  sessionStorage.setItem(key, "{malformed");
  const { posts } = mount();
  await screen.findByText(/No se pudo recuperar la referencia local/);
  assert.equal(
    screen.getByRole("button", { name: "Confirmar gasto" }).disabled,
    true,
  );
  assert.equal(posts.length, 0);
  assert.equal(sessionStorage.getItem(key), "{malformed");
});
test("cobro por servicio advierte que no paga deuda ni crea crédito", async () => {
  mount(undefined, options, { kind: "service_income", clientId: id });
  assert.ok(screen.getByText(/No reduce deudas/));
  await waitFor(() =>
    assert.equal(
      screen.getByRole("button", { name: "Confirmar cobro por servicio" })
        .disabled,
      false,
    ),
  );
  assert.equal(screen.queryByLabelText("Categoría"), null);
});

test("servicio y productos se confirman como un solo intento con total y comprobantes por línea", async () => {
  const results = [];
  const checkoutResult = {
    id,
    transactionIds: [id, productReceiptId],
    receipts: [
      { id, label: "Servicio EJEMPLO", amount: 40 },
      { id: productReceiptId, label: "Venta: Agua EJEMPLO x2", amount: 30 },
    ],
    serviceTransactionId: id,
    serviceAmount: 40,
    productsTotal: 30,
    total: 70,
    currency: "NIO",
  };
  const { posts } = mount(
    () => json(checkoutResult),
    options,
    {
      kind: "service_income",
      clientId: id,
      onSuccess: async (receiptId, result) => {
        results.push({ receiptId, result });
      },
    },
    waterCatalog,
  );
  const submit = await screen.findByRole("button", {
    name: "Confirmar cobro por servicio",
  });
  await waitFor(() => assert.equal(submit.disabled, false));
  fireEvent.change(screen.getByLabelText("Cantidad de Agua EJEMPLO"), {
    target: { value: "2" },
  });
  assert.ok(await screen.findByText(/Total a cobrar:.*C\$30/));
  for (const [name, value] of [
    ["Monto", "40"],
    ["Método", "cash"],
    ["Cuenta", "nio"],
    ["Tasa NIO por 1 USD", "36.7244"],
    ["Concepto", "Servicio EJEMPLO"],
  ])
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  assert.ok(await screen.findByText(/Total a cobrar:.*C\$70/));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar cobro y productos" }),
  );
  assert.ok(
    await screen.findByRole("link", { name: /Venta: Agua EJEMPLO x2/ }),
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].amount, 40);
  assert.deepEqual(posts[0].items, [
    { product: productId, qty: 2, unitPrice: 15 },
  ]);
  assert.deepEqual(results, [{ receiptId: id, result: checkoutResult }]);
});

test("solo productos: monto y concepto de servicio pueden quedar vacíos", async () => {
  const checkoutResult = {
    id: productReceiptId,
    transactionIds: [productReceiptId],
    receipts: [
      { id: productReceiptId, label: "Venta: Agua EJEMPLO x1", amount: 15 },
    ],
    serviceTransactionId: null,
    serviceAmount: 0,
    productsTotal: 15,
    total: 15,
    currency: "NIO",
  };
  const { posts } = mount(
    () => json(checkoutResult),
    options,
    { kind: "service_income", clientId: id },
    waterCatalog,
  );
  await screen.findByLabelText("Cantidad de Agua EJEMPLO");
  fireEvent.change(screen.getByLabelText("Cantidad de Agua EJEMPLO"), {
    target: { value: "1" },
  });
  for (const [name, value] of [
    ["Método", "cash"],
    ["Cuenta", "nio"],
    ["Tasa NIO por 1 USD", "36.7244"],
  ])
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar venta de productos" }),
  );
  await screen.findByText(/Movimiento confirmado/);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].amount, 0);
  assert.equal(posts[0].concept, "Venta de productos");
  assert.deepEqual(posts[0].items, [
    { product: productId, qty: 1, unitPrice: 15 },
  ]);
});

test("si el catálogo falla, el cobro solo por servicio sigue disponible", async () => {
  mount(
    undefined,
    options,
    { kind: "service_income", clientId: id },
    { productos: "respuesta inválida" },
  );
  assert.ok(await screen.findByText(/No pudimos cargar los productos/));
  await waitFor(() =>
    assert.equal(
      screen.getByRole("button", { name: "Confirmar cobro por servicio" })
        .disabled,
      false,
    ),
  );
});

test("preset opcional precarga monto y concepto; onSuccess solo corre tras confirmar", async () => {
  const confirmed = [];
  const { posts } = mount(undefined, options, {
    defaultAmount: 12.5,
    defaultConcept: "Preset EJEMPLO",
    presetKey: "preset-ejemplo",
    onSuccess: async (receiptId) => {
      confirmed.push(receiptId);
    },
  });
  await waitFor(() =>
    assert.equal(
      screen.getByRole("button", { name: "Confirmar gasto" }).disabled,
      false,
    ),
  );
  assert.equal(screen.getByLabelText("Monto").value, "12.5");
  assert.equal(screen.getByLabelText("Concepto").value, "Preset EJEMPLO");
  for (const [name, value] of [
    ["Método", "cash"],
    ["Cuenta", "nio"],
    ["Tasa NIO por 1 USD", "36.7244"],
    ["Categoría", "cat"],
  ])
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
  await screen.findByRole("link", { name: /Abrir comprobante interno/ });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].amount, 12.5);
  assert.equal(posts[0].concept, "Preset EJEMPLO");
  assert.deepEqual(confirmed, [id]);
});

test("onSuccess no se llama si la respuesta del movimiento se pierde", async () => {
  let successCalls = 0;
  mount(
    () => {
      throw new TypeError("network");
    },
    options,
    {
      onSuccess: async () => {
        successCalls += 1;
      },
    },
  );
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
  await screen.findByText(/Conservá esta referencia/);
  assert.equal(successCalls, 0);
});

test("reintento confirmado se puede recuperar aunque la escritura de intentos nuevos esté deshabilitada", async () => {
  sessionStorage.setItem(key, JSON.stringify(pending));
  const { posts } = mount(undefined, { ...options, writes_enabled: false });
  const retry = await screen.findByRole("button", {
    name: "Reintentar exactamente el mismo movimiento",
  });
  assert.equal(retry.disabled, false);
  fireEvent.click(retry);
  await screen.findByRole("link", { name: /Abrir comprobante/ });
  assert.deepEqual(posts, [pending]);
});
test("opciones sin cuenta activa explican el faltante y no habilitan submit", async () => {
  const { posts } = mount(undefined, { ...options, accounts: [] });
  await screen.findByText(/Falta una cuenta o método activo/);
  assert.equal(
    screen.getByRole("button", { name: "Confirmar gasto" }).disabled,
    true,
  );
  assert.equal(posts.length, 0);
});

test("403 en reintento conserva referencia y no anuncia confirmación ni crea otro intento", async () => {
  sessionStorage.setItem(key, JSON.stringify(pending));
  const { posts } = mount(() => json({ error: "No tenés acceso a movimientos financieros." }, 403));
  const retry = await screen.findByRole("button", { name: "Reintentar exactamente el mismo movimiento" });
  fireEvent.click(retry);
  await screen.findByText(/Conservá esta referencia/);
  assert.deepEqual(posts, [pending]);
  assert.deepEqual(JSON.parse(sessionStorage.getItem(key)), pending);
  assert.equal(screen.queryByRole("link", { name: /Abrir comprobante/ }), null);
  assert.equal(screen.queryByText(/Movimiento confirmado/), null);
  assert.equal(screen.getByRole("button", { name: "Confirmar gasto" }).disabled, true);
});

test("un segundo envío incierto no conserva el enlace del comprobante anterior", async () => {
  let sends = 0;
  const { posts } = mount(() => {
    if (++sends === 1) return json({ id });
    throw new TypeError("respuesta perdida del segundo movimiento");
  });
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
  await screen.findByRole("link", { name: /Abrir comprobante interno/ });
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
  await screen.findByText(/Conservá esta referencia/);
  assert.equal(posts.length, 2);
  assert.notEqual(posts[0].requestId, posts[1].requestId);
  assert.equal(screen.queryByRole("link", { name: /Abrir comprobante interno/ }), null);
  assert.equal(screen.queryByText(/Movimiento confirmado/), null);
  assert.deepEqual(JSON.parse(sessionStorage.getItem(key)), posts[1]);
});
