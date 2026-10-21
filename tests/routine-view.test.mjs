import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoutineLabel, groupRoutineByDay, formatRest, formatSeries } from "../src/lib/progress/routine-view.ts";

test("separa día, enfoque y ejercicio de la etiqueta guardada", () => {
  assert.deepEqual(parseRoutineLabel("Fuerza 1 · Piernas y glúteos: Sentadilla goblet"),
    { day: "Fuerza 1", focus: "Piernas y glúteos", name: "Sentadilla goblet" });
});

test("etiqueta sin formato conocido queda como ejercicio completo", () => {
  assert.deepEqual(parseRoutineLabel("Caminata libre"), { day: "Otros", focus: null, name: "Caminata libre" });
});

test("agrupa por día en orden y junta las sesiones de cardio", () => {
  const groups = groupRoutineByDay([
    { ejercicio: "Fuerza 1 · Piernas: Sentadilla", series: 3, reps: "6–10", descanso_s: 90 },
    { ejercicio: "Fuerza 1 · Piernas: Plancha", series: 2, reps: "20–40 s", descanso_s: 45 },
    { ejercicio: "Fuerza 2 · Empuje: Flexiones", series: 3, reps: "6–10", descanso_s: 90 },
    { ejercicio: "Cardio 1 · Aeróbico: Caminata", series: 1, reps: "30 min", descanso_s: 0 },
    { ejercicio: "Cardio 2 · Aeróbico: Bicicleta", series: 1, reps: "30 min", descanso_s: 0 },
  ]);
  assert.deepEqual(groups.map(g => g.day), ["Fuerza 1", "Fuerza 2", "Cardio"]);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[2].items.length, 2);
  assert.equal(groups[2].focus, "Aeróbico");
});

test("descanso y series vacíos se muestran como guion, no como cero", () => {
  assert.equal(formatRest(0), "—");
  assert.equal(formatRest(null), "—");
  assert.equal(formatRest(45), "45 s");
  assert.equal(formatRest(90), "90 s");
  assert.equal(formatRest(120), "2 min");
  assert.equal(formatSeries(null), "—");
  assert.equal(formatSeries(3), "3");
});
