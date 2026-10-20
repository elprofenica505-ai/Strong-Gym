import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEASURE_SITES, checkWeight, checkMeasure, checkHeight, bmi, bmiCategory, healthyWeightRange,
  addMonths, reviewDates, goalErrors, goalProgress, managuaToday,
} from "../src/lib/progress/rules.ts";

test("ocho medidas ISAK, sin cadera ni tríceps", () => {
  assert.equal(MEASURE_SITES.length, 8);
  const keys = MEASURE_SITES.map(m => m.key);
  assert.ok(keys.includes("biceps_relajado_cm") && keys.includes("biceps_contraido_cm"));
  assert.ok(!keys.some(k => /cadera|triceps/.test(k)));
});

test("vacío significa no tomada, nunca cero", () => {
  assert.equal(checkMeasure(""), "empty");
  assert.equal(checkMeasure(null), "empty");
  assert.equal(checkMeasure(undefined), "empty");
});

test("cero y negativos se rechazan", () => {
  assert.equal(checkWeight(0), "invalid");
  assert.equal(checkWeight(-3), "invalid");
  assert.equal(checkMeasure(0), "invalid");
  assert.equal(checkHeight("abc"), "invalid");
});

test("valores fuera de rango de aviso piden confirmación", () => {
  assert.equal(checkWeight(65.5), "ok");
  assert.equal(checkWeight(12), "confirm");
  assert.equal(checkMeasure(90), "ok");
  assert.equal(checkMeasure(12), "confirm");
  assert.equal(checkWeight("65,4"), "ok");
});

test("IMC y clasificación OMS", () => {
  assert.equal(Math.round(bmi(58, 170) * 10) / 10, 20.1);
  assert.equal(bmi(null, 170), null);
  assert.equal(bmiCategory(18.4), "bajo_peso");
  assert.equal(bmiCategory(18.5), "normal");
  assert.equal(bmiCategory(24.9), "normal");
  assert.equal(bmiCategory(25), "sobrepeso");
  assert.equal(bmiCategory(30), "obesidad");
  const [lo, hi] = healthyWeightRange(170);
  assert.ok(lo < hi && lo > 50 && hi < 75);
});

test("meses sin pasarse de fin de mes", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-10-20", 12), "2027-10-20");
});

test("revisión cada 3 meses hasta 12", () => {
  assert.deepEqual(reviewDates("2026-01-10", "2027-01-10"),
    ["2026-04-10", "2026-07-10", "2026-10-10", "2027-01-10"]);
  assert.deepEqual(reviewDates("2026-01-10", "2026-05-01"), ["2026-04-10"]);
});

test("meta: plazo máximo de 12 meses", () => {
  const base = { goalType: "perdida", startsOn: "2026-10-20", targetWeightKg: 60, otherLabel: null };
  assert.deepEqual(goalErrors({ ...base, targetDate: "2027-10-20" }), []);
  assert.ok(goalErrors({ ...base, targetDate: "2027-10-21" }).some(e => /12 meses/.test(e)));
  assert.ok(goalErrors({ ...base, targetDate: "2026-10-20" }).some(e => /posterior/.test(e)));
});

test("meta: pérdida necesita peso objetivo; otra necesita descripción", () => {
  const base = { startsOn: "2026-10-20", targetDate: "2027-01-20", otherLabel: null };
  assert.ok(goalErrors({ ...base, goalType: "perdida", targetWeightKg: null }).length > 0);
  assert.ok(goalErrors({ ...base, goalType: "otra", targetWeightKg: null }).length > 0);
  assert.deepEqual(goalErrors({ ...base, goalType: "otra", targetWeightKg: null, otherLabel: "Correr 5 km" }), []);
});

test("avance: pérdida y ganancia con porcentaje acotado", () => {
  assert.deepEqual(goalProgress({ goalType: "perdida", startWeightKg: 70, currentWeightKg: 65, targetWeightKg: 60 }),
    { status: "en_camino", percent: 50 });
  assert.deepEqual(goalProgress({ goalType: "perdida", startWeightKg: 70, currentWeightKg: 58, targetWeightKg: 60 }),
    { status: "cumplida", percent: 100 });
  assert.deepEqual(goalProgress({ goalType: "ganancia", startWeightKg: 70, currentWeightKg: 74, targetWeightKg: 78 }),
    { status: "en_camino", percent: 50 });
  assert.equal(goalProgress({ goalType: "perdida", startWeightKg: 70, currentWeightKg: 75, targetWeightKg: 60 }).percent, 0);
});

test("avance sin datos no inventa porcentaje", () => {
  assert.deepEqual(goalProgress({ goalType: "perdida", startWeightKg: null, currentWeightKg: 65, targetWeightKg: 60 }),
    { status: "sin_datos", percent: null });
  assert.deepEqual(goalProgress({ goalType: "perdida", startWeightKg: 70, currentWeightKg: null, targetWeightKg: 60 }),
    { status: "sin_datos", percent: null });
  assert.deepEqual(goalProgress({ goalType: "otra", startWeightKg: 70, currentWeightKg: 65, targetWeightKg: null }),
    { status: "manual", percent: null });
});

test("mantenimiento: dentro de la tolerancia", () => {
  assert.equal(goalProgress({ goalType: "mantenimiento", startWeightKg: 70, currentWeightKg: 71, targetWeightKg: 70 }).status, "en_rango");
  assert.equal(goalProgress({ goalType: "mantenimiento", startWeightKg: 70, currentWeightKg: 75, targetWeightKg: 70 }).status, "fuera_de_rango");
});

test("día de Managua en formato AAAA-MM-DD", () => {
  // 03:00 UTC del 21 de octubre todavía es 20 de octubre en Managua (UTC-6).
  assert.equal(managuaToday(new Date("2026-10-21T03:00:00Z")), "2026-10-20");
  assert.match(managuaToday(), /^\d{4}-\d{2}-\d{2}$/);
});
