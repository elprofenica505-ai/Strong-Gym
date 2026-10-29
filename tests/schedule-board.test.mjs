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
const { ScheduleBoard } = await createLoader({})("components/admin/schedule-board.tsx");

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const slot = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  class_id: "cls_boxeo",
  class_name: "Boxeo",
  class_slug: "boxeo",
  class_active: true,
  day_of_week: 1,
  start_time: "06:00",
  duration_min: 60,
  capacity: 20,
  room: "Área de boxeo",
  coach_id: null,
  coach_name: null,
  is_active: true,
  ...over,
});

const board = (slots = [slot(), slot({ id: "22222222-2222-4222-8222-222222222222", start_time: "17:30" })]) => ({
  slots,
  classes: [
    { id: "cls_boxeo", name: "Boxeo", active: true },
    { id: "cls_zumba", name: "Zumba y bailoterapia", active: true },
  ],
  coaches: [{ id: "coach_1", name: "Profe Uno", specialties: ["boxeo"] }],
  weeks: [
    { week_start: "2026-10-26", scheduled: 9 },
    { week_start: "2026-11-02", scheduled: 9 },
    { week_start: "2026-11-09", scheduled: 9 },
    { week_start: "2026-11-16", scheduled: 9 },
  ],
  room_hint: "Usá la misma sala para que el choque de horario se detecte.",
});

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function setup(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return handler(url, init);
  };
  render(React.createElement(ScheduleBoard, { initial: board() }));
  return calls;
}

test("la grilla muestra los días y los horarios con su sala y cupo", () => {
  setup(() => json({}));
  assert.ok(screen.getByRole("heading", { name: /^Martes/ }));
  assert.equal(screen.getAllByRole("heading", { name: /^Lunes/ }).length, 1);
  assert.ok(screen.getByText("06:00 · Boxeo"));
  assert.equal(screen.getAllByText(/60 min · 20 cupos · Área de boxeo · sin entrenador/).length, 2);
  assert.ok(screen.getByText(/2 horarios activos/));
});

test("agregar un horario envía día, hora, sala y disciplina, y avisa cuántas sesiones creó", async () => {
  const calls = setup(() =>
    json({ ...board([...board().slots, slot({
      id: "33333333-3333-4333-8333-333333333333",
      class_id: "cls_zumba",
      class_name: "Zumba y bailoterapia",
      day_of_week: 2,
      start_time: "18:00",
      room: "Salón de clases",
    })]), created_sessions: 4 }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar horario" }));
  fireEvent.change(screen.getByLabelText("Disciplina"), {
    target: { value: "cls_zumba" },
  });
  fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Hora de inicio"), {
    target: { value: "18:00" },
  });
  fireEvent.change(screen.getByLabelText("Sala"), {
    target: { value: "Salón de clases" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
  await screen.findByText(/Se crearon 4 sesiones/);
  const post = calls.find((call) => call.body?.action === "save");
  assert.equal(post.body.classId, "cls_zumba");
  assert.equal(post.body.day, 2);
  assert.equal(post.body.start, "18:00");
  assert.equal(post.body.room, "Salón de clases");
  assert.equal(post.body.capacity, 20);
  assert.equal(post.body.active, true);
  // La grilla se actualiza con el horario nuevo y el formulario se cierra.
  assert.ok(screen.getByText("18:00 · Zumba y bailoterapia"));
  assert.equal(screen.queryByRole("button", { name: "Guardar horario" }), null);
});

test("un choque de horario se explica y no se pierde lo cargado", async () => {
  setup(() =>
    json(
      {
        error: "SCHEDULE_CONFLICT",
        message:
          "Ese horario se pisa con otra clase en la misma sala o con el mismo entrenador. Cambiá la hora, la sala o el entrenador.",
      },
      409,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar horario" }));
  fireEvent.change(screen.getByLabelText("Sala"), {
    target: { value: "Área de boxeo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
  assert.ok(await screen.findByRole("alert"));
  assert.match(screen.getByRole("alert").textContent, /se pisa con otra clase/);
  assert.ok(screen.getByRole("button", { name: "Guardar horario" }));
});

test("anular un horario avisa que las sesiones ya reservadas se conservan", async () => {
  const calls = setup(() => json({ ...board([slot({ is_active: false })]), created_sessions: 0 }));
  fireEvent.click(screen.getAllByRole("button", { name: "Anular" })[0]);
  await screen.findByText(/Las sesiones que ya existían se conservan/);
  const post = calls.find((call) => call.body?.action === "set-active");
  assert.equal(post.body.active, false);
  assert.equal(post.body.id, slot().id);
  // La fila queda anulada y ofrece reactivar.
  assert.ok(screen.getByText(/06:00 · Boxeo · anulado/));
  assert.ok(screen.getByRole("button", { name: "Reactivar" }));
});

const planItem = (over = {}) => ({
  date: "2026-11-03",
  slot_id: "11111111-1111-4111-8111-111111111111",
  day_of_week: 1,
  start_time: "06:00",
  class_id: "cls_boxeo",
  class_name: "Boxeo",
  room: "Área de boxeo",
  coach_id: null,
  coach_name: null,
  status: "create",
  ...over,
});

test("generar muestra qué se crearía antes de escribir y después crea solo eso", async () => {
  const preview = {
    from: "2026-10-26",
    to: "2026-11-01",
    weeks: 4,
    created: 0,
    totals: {
      create: 2,
      duplicate: 1,
      room_conflict: 1,
      coach_conflict: 0,
      past: 0,
      inactive: 0,
    },
    items: [
      planItem(),
      planItem({ slot_id: "b", start_time: "17:30" }),
      planItem({ slot_id: "c", status: "duplicate" }),
      planItem({
        slot_id: "d",
        start_time: "18:00",
        class_id: "cls_zumba",
        class_name: "Zumba y bailoterapia",
        room: "Salón de clases",
        status: "room_conflict",
      }),
    ],
  };
  const calls = setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "preview-generate") return json(preview);
    return json({
      ...preview,
      created: 2,
      totals: { ...preview.totals, create: 0, duplicate: 3, room_conflict: 1 },
      items: preview.items.filter((item) => item.status !== "create"),
      board: board(),
    });
  });

  fireEvent.click(screen.getByRole("button", { name: "Ver qué se crearía" }));
  await screen.findAllByText(/2 sesiones para crear/);
  assert.ok(screen.getAllByText(/por choque de sala/).length >= 1);
  assert.ok(screen.getByText(/Zumba y bailoterapia · Salón de clases · choca la sala/));

  // Nada se escribió todavía: sólo se pidió el plan.
  assert.equal(calls.filter((call) => call.body?.action === "apply-generate").length, 0);
  const previewCall = calls.find((call) => call.body?.action === "preview-generate");
  assert.equal(previewCall.body.weeks, 4);
  assert.equal(previewCall.body.from, "2026-10-26");

  fireEvent.click(screen.getByRole("button", { name: "Crear 2 sesiones" }));
  await screen.findByText(/Se crearon 2 sesiones en el calendario/);
  assert.equal(
    calls.filter((call) => call.body?.action === "apply-generate").length,
    1,
  );
});

test("generar sin nada nuevo lo dice sin inventar sesiones", async () => {
  setup(() =>
    json({
      from: "2026-10-26",
      to: "2026-11-01",
      weeks: 4,
      created: 0,
      totals: {
        create: 0,
        duplicate: 9,
        room_conflict: 0,
        coach_conflict: 0,
        past: 0,
        inactive: 0,
      },
      items: [planItem({ status: "duplicate" })],
      board: board(),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ver qué se crearía" }));
  await screen.findAllByText(/0 sesiones para crear/);
  assert.equal(screen.queryByRole("button", { name: /^Crear / }), null);
});
