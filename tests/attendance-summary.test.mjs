import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";

const lib = await createLoader({})("lib/attendance/summary.ts");

test("addDays y mondayOf usan lunes como inicio de semana", () => {
  assert.equal(lib.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(lib.mondayOf("2026-10-21"), "2026-10-19"); // miércoles
  assert.equal(lib.mondayOf("2026-10-18"), "2026-10-12"); // domingo cae en la semana anterior
  assert.equal(lib.mondayOf("2026-10-19"), "2026-10-19"); // lunes
});

test("fillWeeks rellena con cero las semanas sin visitas", () => {
  const out = lib.fillWeeks([{ weekStart: "2026-10-19", visits: 3 }], "2026-10-21", 3);
  assert.deepEqual(out, [
    { weekStart: "2026-10-19", visits: 3 },
    { weekStart: "2026-10-12", visits: 0 },
    { weekStart: "2026-10-05", visits: 0 },
  ]);
});

test("fillMonths cruza el cambio de año y rellena con cero", () => {
  const out = lib.fillMonths([{ month: "2026-01", visits: 2 }], "2026-02-10", 3);
  assert.deepEqual(out.map(m => m.month), ["2026-02", "2026-01", "2025-12"]);
  assert.deepEqual(out.map(m => m.visits), [0, 2, 0]);
});

test("etiquetas legibles en español", () => {
  assert.equal(lib.weekLabel("2026-10-19"), "del 19/10 al 25/10");
  assert.equal(lib.monthLabel("2026-10"), "octubre 2026");
});
