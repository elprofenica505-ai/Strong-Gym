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
const { CoachesCatalog } = await createLoader({})("components/admin/coaches-catalog.tsx");

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const coach = (over = {}) => ({
  id: "coa_jl",
  full_name: "José Luis Pérez",
  specialty: "Boxeo y acondicionamiento",
  specialties: ["boxeo"],
  specialty_labels: ["Boxeo"],
  is_active: true,
  slots_active: 9,
  sessions_upcoming: 36,
  sessions_unassigned: 0,
  ...over,
});

const classes = [
  { id: "cls_boxeo", slug: "boxeo", name_es: "Boxeo", is_active: true },
  { id: "cls_zumba", slug: "zumba", name_es: "Zumba y bailoterapia", is_active: false },
];

const catalog = (coaches = [coach()], audit = []) => ({ coaches, classes, audit });

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function setup(handler, initial = catalog()) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return handler(url, init);
  };
  render(React.createElement(CoachesCatalog, { initial }));
  return calls;
}

test("lista la plantilla con lo que cada entrenador tiene encima", () => {
  setup(() => json({}));
  assert.ok(screen.getByText("José Luis Pérez"));
  assert.ok(screen.getByText("Boxeo y acondicionamiento"));
  assert.ok(screen.getByText(/Dicta: Boxeo/));
  assert.ok(screen.getByText(/9 horarios fijos/));
  assert.ok(screen.getByText(/36 clases por delante/));
  assert.ok(screen.getByText(/1 entrenador, 1 activo/));
});

test("agregar un entrenador manda las disciplinas elegidas de la lista", async () => {
  const calls = setup(() =>
    json({
      ok: true,
      action: "alta",
      changed_fields: ["full_name", "specialties"],
      catalog: catalog([
        coach(),
        coach({
          id: "coa_km",
          full_name: "Karla Méndez",
          specialty: "Zumba",
          specialties: ["zumba"],
          specialty_labels: ["Zumba y bailoterapia"],
          slots_active: 0,
          sessions_upcoming: 0,
        }),
      ]),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar entrenador" }));
  fireEvent.change(screen.getByLabelText("Nombre completo"), {
    target: { value: "Karla Méndez" },
  });
  fireEvent.change(screen.getByLabelText("Especialidad (como se muestra)"), {
    target: { value: "Zumba" },
  });
  fireEvent.click(screen.getByLabelText(/Zumba y bailoterapia/));
  fireEvent.click(screen.getByRole("button", { name: "Guardar entrenador" }));
  await screen.findByText(/«Karla Méndez» agregado a la plantilla/);

  const post = calls.find((call) => call.body?.action === "save");
  assert.equal(post.url, "/api/admin/coaches");
  assert.equal(post.body.id, null);
  assert.equal(post.body.fullName, "Karla Méndez");
  assert.equal(post.body.specialty, "Zumba");
  assert.deepEqual(post.body.specialties, ["zumba"]);
  assert.ok(screen.getByText("Karla Méndez"));
});

test("editar trae los datos y avisa que las disciplinas ya cuentan", async () => {
  const calls = setup(() =>
    json({ ok: true, action: "edicion", changed_fields: ["specialties"], catalog: catalog() }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  assert.equal(screen.getByLabelText("Nombre completo").value, "José Luis Pérez");
  assert.equal(screen.getByLabelText(/^Boxeo$/).checked, true);
  assert.equal(screen.getByLabelText(/Zumba y bailoterapia/).checked, false);

  fireEvent.click(screen.getByLabelText(/Zumba y bailoterapia/));
  fireEvent.click(screen.getByRole("button", { name: "Guardar entrenador" }));
  await screen.findByText(/«José Luis Pérez» guardado/);
  const post = calls.find((call) => call.body?.action === "save");
  assert.equal(post.body.id, "coa_jl");
  assert.deepEqual(post.body.specialties.sort(), ["boxeo", "zumba"]);
});

test("guardar sin cambios lo dice en vez de fingir una edición", async () => {
  setup(() => json({ ok: true, action: "sin_cambios", changed_fields: [], catalog: catalog() }));
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar entrenador" }));
  await screen.findByText("No había nada para cambiar: quedó igual.");
});

test("un nombre repetido se explica y no borra lo escrito", async () => {
  setup(() =>
    json(
      {
        error: "COACH_EXISTS",
        message: "Ya hay un entrenador con ese nombre. Revisá la lista antes de repetirlo.",
      },
      409,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar entrenador" }));
  fireEvent.change(screen.getByLabelText("Nombre completo"), {
    target: { value: "José Luis Pérez" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar entrenador" }));
  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent, /Ya hay un entrenador con ese nombre/);
  assert.equal(screen.getByLabelText("Nombre completo").value, "José Luis Pérez");
});

test("dar de baja avisa que las clases ya programadas siguen", async () => {
  const calls = setup(() =>
    json({
      ok: true,
      id: "coa_jl",
      is_active: false,
      changed: true,
      sessions_upcoming: 36,
      catalog: catalog([coach({ is_active: false })]),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
  await screen.findByText(/quedó dado de baja/);
  assert.match(screen.getByRole("status").textContent, /36 clases ya programadas siguen/);
  const post = calls.find((call) => call.body?.action === "set-active");
  assert.equal(post.body.id, "coa_jl");
  assert.equal(post.body.isActive, false);
  assert.equal(post.body.expectedIsActive, true);
});

test("sin disciplinas lo avisa: no se asigna solo pero se puede poner a mano", async () => {
  setup(() => json({}), catalog([
    coach({ specialties: [], specialty_labels: [] }),
  ]));
  assert.ok(screen.getByText("Sin disciplinas marcadas"));
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  assert.ok(
    screen.getByText(/el calendario no le va a asignar clases solo/),
  );
});

test("avisa cuántas clases quedaron sin entrenador en sus horarios", () => {
  setup(() => json({}), catalog([coach({ sessions_unassigned: 12 })]));
  assert.match(
    screen.getByText(/12 clases por delante de disciplinas que sí tienen entrenador/).textContent,
    /Horarios y clases/,
  );
  assert.ok(screen.getByText(/12 clases sin asignar en sus horarios/));
});

test("la bitácora muestra quién tocó qué", () => {
  setup(() => json({}), catalog([coach()], [
    {
      id: 5,
      coach_id: "coa_jl",
      coach_name: "José Luis Pérez",
      action: "edicion",
      changed_fields: ["specialties", "specialty"],
      changed_by_name: "El Profe",
      changed_at: "2026-10-30T15:00:00+00:00",
    },
  ]));
  assert.ok(screen.getByRole("heading", { name: "Últimos cambios" }));
  assert.match(
    screen.getByText(/El Profe lo editó/).textContent,
    /disciplinas que dicta, especialidad/,
  );
});

test("sin entrenadores lo dice sin inventar filas", () => {
  setup(() => json({}), catalog([]));
  assert.ok(screen.getByText("Todavía no hay entrenadores."));
  assert.equal(screen.queryByRole("button", { name: "Editar" }), null);
});
