import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./helpers/react-loader.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test",
});
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "FormData"])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = dom.window;
const { render, screen, fireEvent, cleanup } = await import("@testing-library/react");
const { ClassesCatalog } = await createLoader({})("components/admin/classes-catalog.tsx");

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const gymClass = (over = {}) => ({
  id: "cls_boxeo",
  slug: "boxeo",
  name_es: "Boxeo",
  name_en: "Boxing",
  description_es: "Clases de boxeo para todas las edades.",
  description_en: "Boxing classes for all ages.",
  intensity: "high",
  duration_min: 60,
  capacity: 20,
  color: "#d81a22",
  sort_order: 2,
  is_active: true,
  slots_active: 9,
  sessions_upcoming: 27,
  plans: 1,
  ...over,
});

const catalog = (classes = [gymClass(), gymClass({
  id: "cls_zumba",
  slug: "zumba",
  name_es: "Zumba y bailoterapia",
  name_en: "Zumba",
  intensity: "medium",
  duration_min: 45,
  capacity: 25,
  color: "#e11d48",
  sort_order: 6,
  is_active: false,
  slots_active: 0,
  sessions_upcoming: 0,
  plans: 0,
})], audit = []) => ({ classes, intensities: ["low", "medium", "high"], audit });

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function setup(handler, initial = catalog()) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return handler(url, init);
  };
  render(React.createElement(ClassesCatalog, { initial }));
  return calls;
}

test("lista las disciplinas con lo que cada una tiene encima", () => {
  setup(() => json({}));
  assert.ok(screen.getByText(/2 disciplinas, 1 activa/));
  assert.ok(screen.getByText(/60 min · 20 lugares · intensidad alta/));
  assert.ok(screen.getByText(/9 horarios fijos/));
  assert.ok(screen.getByText(/27 clases por delante/));
  assert.ok(screen.getByText(/1 plan la cobra/));
  assert.ok(screen.getByText("apagada"));
  assert.ok(screen.getByText(/sin horarios fijos/));
});

test("crear una disciplina envía los datos y queda disponible", async () => {
  const calls = setup(() =>
    json({
      ok: true,
      action: "alta",
      changedFields: ["slug", "name_es", "name_en"],
      catalog: catalog([
        gymClass(),
        gymClass({
          id: "cls_spinning",
          slug: "spinning",
          name_es: "Spinning",
          name_en: "Spinning",
          intensity: "high",
          duration_min: 50,
          capacity: 18,
          color: "#0ea5e9",
          slots_active: 0,
          sessions_upcoming: 0,
          plans: 0,
        }),
      ]),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar disciplina" }));
  fireEvent.change(screen.getByLabelText("Nombre en español"), {
    target: { value: "Spinning" },
  });
  fireEvent.change(screen.getByLabelText("Nombre en inglés"), {
    target: { value: "Spinning" },
  });
  fireEvent.change(screen.getByLabelText("Identificador"), {
    target: { value: "spinning" },
  });
  fireEvent.change(screen.getByLabelText("Cuánto dura la clase (minutos)"), {
    target: { value: "50" },
  });
  fireEvent.change(screen.getByLabelText("Cuántos pueden entrar"), {
    target: { value: "18" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar disciplina" }));
  await screen.findByText(/«Spinning» guardada/);

  const post = calls.find((call) => call.body?.action === "save");
  assert.equal(post.body.id, null);
  assert.equal(post.body.slug, "spinning");
  assert.equal(post.body.nameEs, "Spinning");
  assert.equal(post.body.durationMin, 50);
  assert.equal(post.body.capacity, 18);
  assert.equal(post.body.intensity, "medium");
  assert.equal(post.url, "/api/admin/classes/catalog");
  assert.ok(screen.getByText("Spinning"));
  assert.equal(screen.queryByRole("button", { name: "Guardar disciplina" }), null);
});

test("editar una disciplina trae sus datos y avisa que quedó guardada", async () => {
  const calls = setup(() =>
    json({ ok: true, action: "edicion", changedFields: ["duration_min"], catalog: catalog() }),
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
  assert.equal(screen.getByLabelText("Nombre en español").value, "Boxeo");
  assert.equal(screen.getByLabelText("Identificador").value, "boxeo");
  assert.equal(screen.getByLabelText("Intensidad").value, "high");
  fireEvent.change(screen.getByLabelText("Cuánto dura la clase (minutos)"), {
    target: { value: "75" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar disciplina" }));
  await screen.findByText(/«Boxeo» guardada/);
  const post = calls.find((call) => call.body?.action === "save");
  assert.equal(post.body.id, "cls_boxeo");
  assert.equal(post.body.durationMin, 75);
});

test("guardar sin cambios lo dice en vez de fingir que cambió algo", async () => {
  setup(() => json({ ok: true, action: "sin_cambios", changedFields: [], catalog: catalog() }));
  fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Guardar disciplina" }));
  await screen.findByText("No había nada para cambiar: quedó igual.");
});

test("un error del servidor se muestra y no borra lo cargado", async () => {
  setup(() =>
    json(
      {
        error: "CLASS_EXISTS",
        message: "Ya existe una disciplina con ese identificador. Elegí otro.",
      },
      409,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar disciplina" }));
  fireEvent.change(screen.getByLabelText("Nombre en español"), {
    target: { value: "Boxeo" },
  });
  fireEvent.change(screen.getByLabelText("Nombre en inglés"), {
    target: { value: "Boxing" },
  });
  fireEvent.change(screen.getByLabelText("Identificador"), {
    target: { value: "boxeo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar disciplina" }));
  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent, /Ya existe una disciplina con ese identificador/);
  assert.ok(screen.getByLabelText("Nombre en español"));
});

test("apagar una disciplina avisa que se conserva lo reservado", async () => {
  const calls = setup(() =>
    json({
      ok: true,
      classId: "cls_boxeo",
      isActive: false,
      catalog: catalog([gymClass({ is_active: false })]),
    }),
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Apagar" })[0]);
  await screen.findByText(/quedó apagada/);
  assert.match(screen.getByRole("status").textContent, /lo que ya estaba reservado se conserva/);
  const post = calls.find((call) => call.body?.action === "set-active");
  assert.equal(post.body.id, "cls_boxeo");
  assert.equal(post.body.isActive, false);
  assert.equal(post.body.expectedIsActive, true);
});

test("la bitácora muestra quién tocó qué y en qué campos", () => {
  setup(() => json({}), catalog([gymClass()], [
    {
      id: 7,
      class_id: "cls_zumba",
      class_name: "Zumba y bailoterapia",
      action: "edicion",
      changed_fields: ["duration_min", "capacity"],
      changed_by_name: "El Profe",
      changed_at: "2026-10-29T15:00:00+00:00",
    },
    {
      id: 6,
      class_id: "cls_zumba",
      class_name: "Zumba y bailoterapia",
      action: "alta",
      changed_fields: [],
      changed_by_name: "El Profe",
      changed_at: "2026-10-29T14:00:00+00:00",
    },
  ]));
  assert.ok(screen.getByRole("heading", { name: "Últimos cambios" }));
  assert.match(screen.getByText(/El Profe la editó/).textContent, /duración, cupo/);
  assert.ok(screen.getByText(/El Profe la creó/));
});

test("sin disciplinas lo dice sin inventar filas", () => {
  setup(() => json({}), catalog([], []));
  assert.ok(screen.getByText("Todavía no hay disciplinas."));
  assert.equal(screen.queryByRole("button", { name: "Editar" }), null);
});
