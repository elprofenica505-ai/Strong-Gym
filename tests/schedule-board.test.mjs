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

const board = (
  slots = [
    slot(),
    slot({ id: "22222222-2222-4222-8222-222222222222", start_time: "17:30" }),
  ],
) => ({
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

const emptyPlan = {
  from: "2026-10-26",
  to: "2026-11-22",
  weeks: 4,
  created: 0,
  totals: {
    create: 0,
    duplicate: 0,
    room_conflict: 0,
    coach_conflict: 0,
    blocked: 0,
    past: 0,
    inactive: 0,
  },
  items: [],
};

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function setup(handler, initial = board()) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return handler(url, init, calls);
  };
  render(
    React.createElement(ScheduleBoard, { initial, today: "2026-10-29" }),
  );
  return calls;
}

test("la pantalla explica en tres pasos qué hace cada cosa", () => {
  setup(() => json({}));
  assert.ok(screen.getByRole("heading", { name: "¿Cómo funciona esta pantalla?" }));
  assert.ok(screen.getByRole("heading", { name: /Tu semana fija/ }));
  assert.ok(screen.getByRole("heading", { name: /Pasar la semana al calendario/ }));
  assert.ok(screen.getByRole("heading", { name: /Días que no abrís/ }));
  assert.match(
    screen.getByText(/Guardar un horario no crea clases/).textContent,
    /se crean en el paso 2/,
  );
});

test("la semana fija muestra día, hora, duración y cupo en palabras claras", () => {
  setup(() => json({}));
  assert.ok(screen.getByRole("heading", { name: /^Martes/ }));
  assert.ok(screen.getByText("06:00 · Boxeo"));
  assert.ok(screen.getAllByText(/1 hora · 20 lugares · Área de boxeo · sin entrenador/).length === 2);
  assert.ok(screen.getByText(/2 horarios activos por semana/));
});

test("agregar un horario guarda la semana fija y avisa que falta pasarla al calendario", async () => {
  const calls = setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "preview-generate") return json(emptyPlan);
    return json({
      ...board([
        ...board().slots,
        slot({
          id: "33333333-3333-4333-8333-333333333333",
          class_id: "cls_zumba",
          class_name: "Zumba y bailoterapia",
          day_of_week: 2,
          start_time: "18:00",
          room: "Salón de clases",
        }),
      ]),
      created_sessions: 0,
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "Agregar horario fijo" }));
  fireEvent.change(screen.getByLabelText("Disciplina"), {
    target: { value: "cls_zumba" },
  });
  fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Hora de inicio"), {
    target: { value: "18:00" },
  });
  fireEvent.change(screen.getByLabelText("Cuántos pueden entrar"), {
    target: { value: "20" },
  });
  fireEvent.change(screen.getByLabelText("Sala"), {
    target: { value: "Salón de clases" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
  await screen.findByText(/Horario guardado en tu semana fija/);
  assert.match(
    screen.getByRole("status").textContent,
    /pasalo al calendario en el paso 2/,
  );
  const post = calls.find((call) => call.body?.action === "save");
  assert.equal(post.body.classId, "cls_zumba");
  assert.equal(post.body.day, 2);
  assert.equal(post.body.start, "18:00");
  assert.equal(post.body.room, "Salón de clases");
  assert.equal(post.body.capacity, 20);
  assert.equal(post.body.active, true);
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
  fireEvent.click(screen.getByRole("button", { name: "Agregar horario fijo" }));
  fireEvent.change(screen.getByLabelText("Sala"), {
    target: { value: "Área de boxeo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
  assert.ok(await screen.findByRole("alert"));
  assert.match(screen.getByRole("alert").textContent, /se pisa con otra clase/);
  assert.ok(screen.getByRole("button", { name: "Guardar horario" }));
});

test("suspender un horario aclara que las clases ya reservadas se conservan", async () => {
  const calls = setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "preview-generate") return json(emptyPlan);
    return json({ ...board([slot({ is_active: false })]), created_sessions: 0 });
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Suspender" })[0]);
  await screen.findByText(/Las clases que ya estaban en el calendario se conservan/);
  const post = calls.find((call) => call.body?.action === "set-active");
  assert.equal(post.body.active, false);
  assert.equal(post.body.id, slot().id);
  assert.ok(screen.getAllByText(/suspendido/).length >= 1);
  assert.ok(screen.getByRole("button", { name: "Volver a activar" }));
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

const preview = {
  ...emptyPlan,
  totals: {
    create: 2,
    duplicate: 1,
    room_conflict: 1,
    coach_conflict: 0,
    blocked: 0,
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

test("el paso 2 muestra qué clases se crearían antes de escribir", async () => {
  const calls = setup(() => json(preview));
  fireEvent.click(screen.getByRole("button", { name: "Ver qué clases se crearían" }));
  await screen.findAllByText(/Se van a crear 2 clases/);
  assert.ok(screen.getByText(/Del 26\/10\/2026 al 22\/11\/2026/));
  assert.match(screen.getByText(/No se crean 2:/).textContent, /1 ya estaba/);
  assert.match(screen.getByText(/No se crean 2:/).textContent, /1 esa sala ya está ocupada/);
  assert.equal(
    calls.filter((call) => call.body?.action === "apply-generate").length,
    0,
  );
});

test("crear las clases del paso 2 confirma cuántas se crearon", async () => {
  const calls = setup((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "preview-generate") return json(preview);
    return json({
      ...preview,
      created: 2,
      totals: { ...preview.totals, create: 0, duplicate: 3 },
      items: preview.items.filter((item) => item.status !== "create"),
      board: board(),
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "Ver qué clases se crearían" }));
  await screen.findByRole("button", { name: "Crear 2 clases" });
  fireEvent.click(screen.getByRole("button", { name: "Crear 2 clases" }));
  await screen.findByText(/Listo: 2 clases nuevas en el calendario/);
  assert.equal(
    calls.filter((call) => call.body?.action === "apply-generate").length,
    1,
  );
});

test("si no falta nada, no ofrece crear y lo dice claro", async () => {
  setup(() =>
    json({
      ...emptyPlan,
      totals: { ...emptyPlan.totals, duplicate: 9 },
      items: [planItem({ status: "duplicate" })],
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ver qué clases se crearían" }));
  await screen.findByText("No falta ninguna clase en ese período.");
  assert.equal(screen.queryByRole("button", { name: /^Crear / }), null);
});

test("el período avanzado está plegado y usa cuatro semanas por defecto", async () => {
  const calls = setup(() => json(preview));
  const details = screen.getByText(/Elegir otro período/).closest("details");
  assert.equal(details.hasAttribute("open"), false);
  fireEvent.click(screen.getByRole("button", { name: "Ver qué clases se crearían" }));
  await screen.findAllByText(/Se van a crear 2 clases/);
  const call = calls.find((item) => item.body?.action === "preview-generate");
  assert.equal(call.body.weeks, 4);
  assert.equal(call.body.from, "2026-10-26");
});
