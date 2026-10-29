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
const { render, screen, fireEvent, waitFor, cleanup } = await import(
  "@testing-library/react"
);
const { ScheduleBlocks } = await createLoader({})("components/admin/schedule-blocks.tsx");

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const classes = [
  { id: "cls_boxeo", name: "Boxeo", active: true },
  { id: "cls_zumba", name: "Zumba y bailoterapia", active: true },
];
const coaches = [
  { id: "coach_1", name: "Profe Uno", specialties: null },
  { id: "coach_2", name: "Profe Dos", specialties: null },
];

const block = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  scope: "gym",
  class_id: null,
  class_name: null,
  coach_id: null,
  coach_name: null,
  starts_at: "2026-11-03T06:00:00+00:00",
  ends_at: "2026-11-04T05:59:00+00:00",
  reason_kind: "holiday",
  reason: "Feriado nacional",
  substitute_coach_id: null,
  substitute_coach_name: null,
  is_active: true,
  cancelled_sessions: 3,
  ...over,
});

const impact = (over = {}) => ({
  sessions: [
    {
      id: "ses_1",
      class_id: "cls_boxeo",
      class_name: "Boxeo",
      starts_at: "2026-11-03T12:00:00+00:00",
      room: "Área de boxeo",
      coach_id: null,
      coach_name: null,
      bookings: 2,
    },
  ],
  session_count: 1,
  booking_count: 2,
  action: "cancel",
  ...over,
});

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function setup(handler, blocks = [block()]) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return handler(url, init);
  };
  render(
    React.createElement(ScheduleBlocks, {
      initial: blocks,
      classes,
      coaches,
      today: "2026-10-29",
    }),
  );
  return calls;
}

test("muestra los bloqueos activos con su motivo y cuántas sesiones canceló", () => {
  setup(() => json({}));
  assert.ok(screen.getByRole("heading", { name: /Días que no abrís/ }));
  assert.ok(screen.getByText(/1 cierre programado/));
  assert.ok(screen.getByText(/Feriado · Todo el gimnasio/));
  assert.ok(screen.getByText(/Feriado nacional/));
  assert.ok(screen.getByText(/3 clases canceladas/));
  assert.ok(screen.getByRole("button", { name: "Reabrir" }));
});

test("sin bloqueos lo dice sin inventar filas", () => {
  setup(() => json({}), []);
  assert.ok(screen.getByText("No hay cierres programados."));
  assert.equal(screen.queryByRole("button", { name: "Reabrir" }), null);
});

test("ver qué se afecta no guarda nada y avisa de las reservas", async () => {
  const calls = setup(() => json(impact()));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar un día o un rango" }));
  fireEvent.change(screen.getByLabelText("Contales qué pasa"), {
    target: { value: "Feriado nacional" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ver a quién afecta" }));
  await screen.findByText(/Se cancelan 1 clase y 2 reservas/);

  const preview = calls.find((call) => call.body?.action === "preview-block");
  assert.equal(preview.body.scope, "gym");
  assert.equal(preview.body.classId, null);
  assert.equal(preview.body.starts, "2026-10-29T00:00");
  assert.equal(preview.body.ends, "2026-10-29T23:59");
  assert.equal(
    calls.filter((call) => call.body?.action === "save-block").length,
    0,
  );
  // La sesión afectada se ve con su fecha y sus reservas.
  assert.ok(screen.getByText(/Boxeo · Área de boxeo · 2 reservas/));
});

test("guardar envía el motivo, confirma y avisa cuántas sesiones canceló", async () => {
  const calls = setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "preview-block") return json(impact());
    return json({
      id: "22222222-2222-4222-8222-222222222222",
      impact: impact(),
      cancelled_sessions: 1,
      reassigned_sessions: 0,
      blocks: [block({ cancelled_sessions: 4 })],
      board: null,
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "Cerrar un día o un rango" }));
  fireEvent.change(screen.getByLabelText("Por qué"), {
    target: { value: "maintenance" },
  });
  fireEvent.change(screen.getByLabelText("Contales qué pasa"), {
    target: { value: "Pintura del salón" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ver a quién afecta" }));
  await screen.findByText(/Se cancelan /);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cierre" }));
  await screen.findByText(/Listo: 1 clase se canceló y cada reserva quedó con el motivo escrito/);

  const saved = calls.find((call) => call.body?.action === "save-block");
  assert.equal(saved.body.reasonKind, "maintenance");
  assert.equal(saved.body.reason, "Pintura del salón");
  assert.equal(saved.body.confirmed, true);
  // La lista se actualiza con lo que devolvió el servidor.
  assert.ok(screen.getByText(/4 clases canceladas/));
  // El formulario se cierra.
  assert.equal(screen.queryByRole("button", { name: "Confirmar cierre" }), null);
});

test("bloquear un entrenador con sustituto avisa que reasigna", async () => {
  const calls = setup(() =>
    json(impact({ action: "reassign", booking_count: 0 })),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cerrar un día o un rango" }));
  fireEvent.change(screen.getByLabelText("Qué cerrás"), {
    target: { value: "coach" },
  });
  fireEvent.change(screen.getByLabelText("Quién lo cubre (opcional)"), {
    target: { value: "coach_2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ver a quién afecta" }));
  await screen.findByText(/Se pasan 1 clase al sustituto/);
  const preview = calls.find((call) => call.body?.action === "preview-block");
  assert.equal(preview.body.coachId, "coach_1");
  assert.equal(preview.body.substituteCoachId, "coach_2");
});

test("el sustituto no se ofrece como opción de sí mismo", () => {
  setup(() => json({}));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar un día o un rango" }));
  fireEvent.change(screen.getByLabelText("Qué cerrás"), {
    target: { value: "coach" },
  });
  fireEvent.change(screen.getByLabelText("Entrenador"), {
    target: { value: "coach_2" },
  });
  const options = Array.from(
    screen.getByLabelText("Quién lo cubre (opcional)").querySelectorAll("option"),
  ).map((option) => option.textContent);
  assert.ok(options.includes("Nadie: se cancelan sus clases"));
  assert.ok(!options.includes("Profe Dos"));
});

test("un error del servidor se muestra y no borra lo cargado", async () => {
  setup(() =>
    json(
      {
        error: "CONFIRM_REQUIRED",
        message:
          "Hay reservas en las clases afectadas. Revisá primero qué se va a cancelar y confirmá después.",
      },
      409,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cerrar un día o un rango" }));
  fireEvent.change(screen.getByLabelText("Contales qué pasa"), { target: { value: "Feriado" } });
  fireEvent.click(screen.getByRole("button", { name: "Ver a quién afecta" }));
  await waitFor(() => assert.ok(screen.getByRole("alert")));
  assert.match(screen.getByRole("alert").textContent, /Hay reservas en las clases afectadas/);
  assert.ok(screen.getByLabelText("Contales qué pasa"));
});

test("levantar un bloqueo lo saca de la lista y aclara que no revive sesiones", async () => {
  const calls = setup(() =>
    json({ id: block().id, blocks: [block({ is_active: false })] }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
  await screen.findByText(/no vuelven solas/);
  const lifted = calls.find((call) => call.body?.action === "lift-block");
  assert.equal(lifted.body.id, block().id);
  assert.ok(screen.getByText("No hay cierres programados."));
});
