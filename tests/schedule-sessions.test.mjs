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
const { ScheduleSessions } = await createLoader({})(
  "components/admin/schedule-sessions.tsx",
);

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

const session = (over = {}) => ({
  id: "ses_1",
  class_id: "cls_boxeo",
  class_name: "Boxeo",
  class_color: "#d81a22",
  class_active: true,
  coach_id: null,
  coach_name: null,
  room: "Área de boxeo",
  starts_at: "2026-11-03T16:00:00+00:00",
  ends_at: "2026-11-03T17:00:00+00:00",
  duration_min: 60,
  capacity: 20,
  booked: 3,
  status: "scheduled",
  origin: "grid",
  note: null,
  cancel_reason: null,
  cancelled_at: null,
  is_past: false,
  ...over,
});

const board = (sessions = [session()], over = {}) => ({
  from: "2026-10-29",
  to: "2026-11-25",
  today: "2026-10-29",
  sessions,
  ...over,
});

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function setup(handler, initial = board()) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return handler(url, init);
  };
  render(
    React.createElement(ScheduleSessions, {
      initial,
      classes,
      coaches,
    }),
  );
  return calls;
}

test("lista las clases del período con lo que cada una tiene encima", () => {
  setup(() => json({}));
  assert.ok(screen.getByRole("heading", { name: /Un día puntual/ }));
  assert.match(screen.getByText(/10:00/).textContent, /Boxeo/);
  assert.match(screen.getByText(/Área de boxeo/).textContent, /3 de 20 lugares/);
  assert.ok(screen.getByText(/1 clase programada/));
});

test("marca la clase suelta, la cancelada y la que ya pasó", () => {
  setup(() => json({}), board([
    session({ id: "ses_1", origin: "manual", note: "Sábado especial" }),
    session({
      id: "ses_2",
      class_name: "Zumba y bailoterapia",
      class_id: "cls_zumba",
      status: "cancelled",
      cancel_reason: "Se enfermó el entrenador",
      booked: 0,
      starts_at: "2026-11-04T16:00:00+00:00",
      ends_at: "2026-11-04T17:00:00+00:00",
    }),
    session({
      id: "ses_3",
      starts_at: "2026-10-28T16:00:00+00:00",
      ends_at: "2026-10-28T17:00:00+00:00",
      is_past: true,
    }),
  ]));
  assert.ok(screen.getByText("suelta"));
  assert.ok(screen.getByText("cancelada"));
  assert.ok(screen.getByText("ya pasó"));
  assert.ok(screen.getByText(/Zumba y bailoterapia/));
  assert.match(
    screen.getByText(/motivo: Se enfermó el entrenador/).textContent,
    /motivo: Se enfermó el entrenador/,
  );
  assert.ok(screen.getByText(/Sábado especial/));
  assert.ok(screen.getByText(/2 clases programadas y 1 cancelada/));
  // Ni la cancelada ni la que pasó se pueden tocar.
  assert.equal(screen.queryAllByRole("button", { name: "Cancelar clase" }).length, 1);
});

test("agregar una clase suelta envía fecha, hora, cupo y sala, y recarga", async () => {
  const calls = setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "list-sessions") return json(board());
    return json({
      ok: true,
      action: "alta",
      changed_fields: ["starts_at"],
      session: { id: "ses_new" },
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "Agregar clase suelta" }));
  fireEvent.change(screen.getByLabelText("Disciplina"), {
    target: { value: "cls_zumba" },
  });
  fireEvent.change(screen.getByLabelText("Fecha"), {
    target: { value: "2026-11-07" },
  });
  fireEvent.change(screen.getByLabelText("Hora de inicio"), {
    target: { value: "09:30" },
  });
  fireEvent.change(screen.getByLabelText("Duración (minutos)"), {
    target: { value: "45" },
  });
  fireEvent.change(screen.getByLabelText("Cuántos pueden entrar"), {
    target: { value: "18" },
  });
  fireEvent.change(screen.getByLabelText("Sala"), {
    target: { value: "Salón de baile" },
  });
  fireEvent.change(screen.getByLabelText("Entrenador"), {
    target: { value: "coach_2" },
  });
  fireEvent.change(screen.getByLabelText("Nota del día especial (opcional)"), {
    target: { value: "Sábado de Zumba" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));
  await screen.findByText(/Clase suelta agregada/);

  const saved = calls.find((call) => call.body?.action === "save-session");
  assert.equal(saved.url, "/api/admin/schedule");
  assert.equal(saved.body.id, null);
  assert.equal(saved.body.classId, "cls_zumba");
  assert.equal(saved.body.date, "2026-11-07");
  assert.equal(saved.body.time, "09:30");
  assert.equal(saved.body.duration, 45);
  assert.equal(saved.body.capacity, 18);
  assert.equal(saved.body.room, "Salón de baile");
  assert.equal(saved.body.coachId, "coach_2");
  assert.equal(saved.body.note, "Sábado de Zumba");
  assert.equal(saved.body.expectedStarts, null);
  assert.ok(calls.some((call) => call.body?.action === "list-sessions"));
  assert.equal(screen.queryByRole("button", { name: "Guardar clase" }), null);
});

test("cambiar una clase trae sus datos y avisa que las reservas la siguen", async () => {
  const calls = setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "list-sessions") return json(board());
    return json({ ok: true, action: "edicion", changed_fields: ["starts_at"] });
  });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
  assert.equal(screen.getByLabelText("Fecha").value, "2026-11-03");
  assert.equal(screen.getByLabelText("Hora de inicio").value, "10:00");
  assert.equal(screen.getByLabelText("Cuántos pueden entrar").value, "20");
  assert.equal(screen.getByLabelText("Sala").value, "Área de boxeo");

  fireEvent.change(screen.getByLabelText("Hora de inicio"), {
    target: { value: "11:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));
  await screen.findByText(/Clase actualizada/);
  assert.match(screen.getByRole("status").textContent, /Las reservas que tenía siguen con ella/);

  const saved = calls.find((call) => call.body?.action === "save-session");
  assert.equal(saved.body.id, "ses_1");
  assert.equal(saved.body.time, "11:30");
  assert.equal(saved.body.expectedStarts, "2026-11-03T10:00");
});

test("un choque de sala se explica y no borra lo escrito", async () => {
  setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "list-sessions") return json(board());
    return json(
      {
        error: "SCHEDULE_CONFLICT",
        message:
          "Ese horario se pisa con otra clase en la misma sala o con el mismo entrenador. Cambiá la hora, la sala o el entrenador.",
      },
      409,
    );
  });
  fireEvent.click(screen.getByRole("button", { name: "Agregar clase suelta" }));
  fireEvent.change(screen.getByLabelText("Nota del día especial (opcional)"), {
    target: { value: "Sábado especial" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));
  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent, /se pisa con otra clase/);
  assert.equal(
    screen.getByLabelText("Nota del día especial (opcional)").value,
    "Sábado especial",
  );
});

test("guardar sin cambios lo dice en vez de fingir una edición", async () => {
  setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "list-sessions") return json(board());
    return json({ ok: true, action: "sin_cambios", changed_fields: [] });
  });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));
  await screen.findByText("No había nada para cambiar: la clase quedó igual.");
});

test("cancelar avisa a cuántos afecta y manda el motivo", async () => {
  const calls = setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "list-sessions") return json(board([session({ status: "cancelled" })]));
    return json({ ok: true, changed: true, cancelled_bookings: 3 });
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar clase" }));
  assert.match(screen.getByText(/3 personas anotadas/).textContent, /No se borra nada/);
  const confirmar = screen.getByRole("button", { name: "Sí, cancelar esta clase" });
  assert.equal(confirmar.disabled, true);
  fireEvent.change(screen.getByLabelText("Motivo de la cancelación"), {
    target: { value: "Se enfermó el entrenador" },
  });
  fireEvent.click(confirmar);
  await screen.findByText(/3 reservas quedaron canceladas/);
  const sent = calls.find((call) => call.body?.action === "cancel-session");
  assert.equal(sent.body.id, "ses_1");
  assert.equal(sent.body.reason, "Se enfermó el entrenador");
  assert.equal(sent.body.confirmed, true);
  assert.ok(calls.some((call) => call.body?.action === "list-sessions"));
});

test("cancelar una clase sin reservas lo dice sin alarmar", async () => {
  setup(
    (url, init) => {
      const body = JSON.parse(init.body);
      if (body.action === "list-sessions")
        return json(board([session({ booked: 0 })]));
      return json({ ok: true, changed: true, cancelled_bookings: 0 });
    },
    board([session({ booked: 0 })]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancelar clase" }));
  assert.match(screen.getByText(/no tiene reservas/).textContent, /Queda cancelada con el motivo/);
  fireEvent.change(screen.getByLabelText("Motivo de la cancelación"), {
    target: { value: "Feriado" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar esta clase" }));
  await screen.findByText("Clase cancelada. No tenía reservas.");
});

test("ver otro período pide la lista de ese rango", async () => {
  const calls = setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "list-sessions")
      return json(board([session({ id: "ses_9", starts_at: "2026-12-01T16:00:00+00:00", ends_at: "2026-12-01T17:00:00+00:00" })], {
        from: body.from,
        to: body.to,
      }));
    return json({});
  });
  fireEvent.change(screen.getByLabelText("Mostrar desde"), {
    target: { value: "2026-12-01" },
  });
  fireEvent.change(screen.getByLabelText("Hasta"), {
    target: { value: "2026-12-31" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ver este período" }));
  await screen.findByText(/1 clase programada/);
  const sent = calls.find((call) => call.body?.action === "list-sessions");
  assert.equal(sent.body.from, "2026-12-01");
  assert.equal(sent.body.to, "2026-12-31");
});
