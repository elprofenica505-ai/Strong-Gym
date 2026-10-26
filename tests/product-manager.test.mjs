import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./helpers/react-loader.mjs";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test/es/panel/productos",
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
const { render, screen, fireEvent, waitFor, cleanup, within } =
  await import("@testing-library/react");
const { ProductManager } = await createLoader()(
  "components/products/product-manager.tsx",
);

const product = (n) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: `Producto EJEMPLO ${n}`,
  category: "Bebidas",
  subcategory: null,
  attributes: {},
  status: "activo",
  cost: 10,
  price: 25,
  profit: 15,
  stock: 7,
  stock_min: 2,
  low_stock: false,
  image_data: null,
});
const catalog = (count) => ({
  products: Array.from({ length: count }, (_, i) => product(i + 1)),
  options: {
    accounts: [{ id: "acc", name: "Caja EJEMPLO" }],
    methods: [{ id: "cash", name_es: "Efectivo EJEMPLO" }],
    writes_enabled: true,
  },
  clients: [],
});
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });

function mount(count = 30) {
  const posts = [];
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "POST") {
      posts.push(JSON.parse(init.body));
      return json({ ok: true });
    }
    return json(catalog(count));
  };
  render(React.createElement(ProductManager));
  return posts;
}

test("tarjetas: nombre, precio y stock visibles; paginación de 25 por página", async () => {
  mount(30);
  const first = (await screen.findByText("Producto EJEMPLO 1")).closest(
    "button",
  );
  assert.ok(first);
  assert.match(first.textContent, /25/);
  assert.match(first.textContent, /Stock: 7 unidades/);
  // Página 1: 25 tarjetas; el producto 26 todavía no aparece.
  assert.ok(screen.getByText("Página 1 de 2"));
  assert.equal(screen.queryByText("Producto EJEMPLO 26"), null);
  assert.ok(screen.getByText("Producto EJEMPLO 25"));
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  assert.ok(await screen.findByText("Página 2 de 2"));
  assert.ok(screen.getByText("Producto EJEMPLO 26"));
  assert.ok(screen.getByText("Producto EJEMPLO 30"));
  assert.equal(screen.queryByText("Producto EJEMPLO 25"), null);
  fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
  assert.ok(await screen.findByText("Página 1 de 2"));
  assert.ok(screen.getByText("Producto EJEMPLO 1"));
});

test("tocar una tarjeta abre la ficha completa y Volver regresa a las tarjetas", async () => {
  mount(3);
  fireEvent.click(
    await screen.findByRole("button", { name: /Producto EJEMPLO 2/ }),
  );
  const detail = await screen.findByLabelText("Ficha de Producto EJEMPLO 2");
  assert.match(detail.textContent, /Costo/);
  assert.match(detail.textContent, /Ganancia por unidad/);
  assert.match(detail.textContent, /Stock actual/);
  for (const name of ["Editar", "Comprar", "Vender", "Ajustar stock"])
    assert.ok(within(detail).getByRole("button", { name }), name);
  // La cuadrícula ya no está a la vista.
  assert.equal(screen.queryByText("Producto EJEMPLO 1"), null);
  fireEvent.click(
    within(detail).getByRole("button", { name: "← Volver a productos" }),
  );
  assert.ok(await screen.findByText("Producto EJEMPLO 1"));
  assert.ok(screen.getByRole("button", { name: "Nuevo producto" }));
});

test("desde la ficha, ajustar stock envía la misma operación de siempre", async () => {
  const posts = mount(2);
  fireEvent.click(
    await screen.findByRole("button", { name: /Producto EJEMPLO 1/ }),
  );
  const detail = await screen.findByLabelText("Ficha de Producto EJEMPLO 1");
  fireEvent.click(within(detail).getByRole("button", { name: "Ajustar stock" }));
  fireEvent.change(
    await screen.findByLabelText(/Cantidad a sumar/),
    { target: { value: "3" } },
  );
  fireEvent.change(screen.getByLabelText("Motivo del ajuste"), {
    target: { value: "Conteo físico EJEMPLO" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await screen.findByText("Ajuste de stock registrado.");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].action, "adjust");
  assert.equal(posts[0].adjust.qty, 3);
  assert.equal(posts[0].adjust.product, product(1).id);
  await waitFor(() =>
    assert.ok(screen.getByLabelText("Ficha de Producto EJEMPLO 1")),
  );
});
