import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMeasurementForm, parseRoutineExercises, parseGoalForm } from "../src/lib/progress/forms.ts";
import { managuaToday } from "../src/lib/progress/rules.ts";

const base = { measuredOn: managuaToday(), weightKg: "70,4", heightCm: "165", notes: "  primera  ", values: { cintura_cm: "80", muslo_cm: "" } };

test("medición válida: coma decimal, vacíos quedan null, notas recortadas", () => {
  const r = parseMeasurementForm(base);
  assert.equal(r.ok, true);
  assert.equal(r.data.weightKg, 70.4);
  assert.equal(r.data.values.cintura_cm, 80);
  assert.equal(r.data.values.muslo_cm, null);
  assert.equal(r.data.values.gluteo_cm, null);
  assert.equal(r.data.notes, "primera");
  assert.deepEqual(r.data.needsConfirmation, []);
});

test("peso obligatorio y cero rechazado", () => {
  assert.equal(parseMeasurementForm({ ...base, weightKg: "" }).ok, false);
  const r = parseMeasurementForm({ ...base, weightKg: "0" });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /peso/i);
});

test("fecha futura rechazada", () => {
  const r = parseMeasurementForm({ ...base, measuredOn: "2099-01-01" });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /futura/);
});

test("valor fuera de rango de aviso pide confirmación, no rechaza", () => {
  const r = parseMeasurementForm({ ...base, values: { cintura_cm: "12" } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.needsConfirmation, ["cintura_cm"]);
});

test("circunferencia cero rechazada con el nombre de la medida", () => {
  const r = parseMeasurementForm({ ...base, values: { pantorrilla_cm: "0" } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /Pantorrilla/);
});

test("rutina: líneas con series, repeticiones y descanso", () => {
  const r = parseRoutineExercises("Sentadilla; 4; 8; 90\nPress de banca\n\n");
  assert.equal(r.ok, true);
  assert.deepEqual(r.data[0], { ejercicio: "Sentadilla", series: 4, reps: "8", descanso_s: 90 });
  assert.deepEqual(r.data[1], { ejercicio: "Press de banca", series: null, reps: null, descanso_s: null });
});

test("rutina: errores claros por línea y lista vacía", () => {
  assert.equal(parseRoutineExercises("").ok, false);
  const r = parseRoutineExercises("X; 4\nSentadilla; 0; 8; 90");
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /Línea 1/);
  assert.match(r.errors.join(" "), /Línea 2/);
});

test("meta: pérdida válida y plazo de 13 meses rechazado", () => {
  const ok = parseGoalForm({ goalType: "perdida", startsOn: "2026-10-20", targetDate: "2027-10-20", targetWeightKg: "65" });
  assert.equal(ok.ok, true);
  const bad = parseGoalForm({ goalType: "perdida", startsOn: "2026-10-20", targetDate: "2027-11-20", targetWeightKg: "65" });
  assert.equal(bad.ok, false);
});

test("meta 'otra' descarta peso y necesita descripción", () => {
  assert.equal(parseGoalForm({ goalType: "otra", startsOn: "2026-10-20", targetDate: "2027-01-20", otherLabel: "" }).ok, false);
  const r = parseGoalForm({ goalType: "otra", startsOn: "2026-10-20", targetDate: "2027-01-20", otherLabel: "Correr 5 km", targetWeightKg: "" });
  assert.equal(r.ok, true);
  assert.equal(r.data.targetWeightKg, null);
});
