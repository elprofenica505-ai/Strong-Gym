import { test } from "node:test";
import assert from "node:assert/strict";
import { PARQ_QUESTIONS_ES, PARQ_VERSION, parqAnswersComplete, parqHasYes } from "../src/lib/nutrition/parq.ts";

test("el cuestionario tiene 7 preguntas y versión", () => {
  assert.equal(PARQ_QUESTIONS_ES.length, 7);
  assert.match(PARQ_VERSION, /^parq-v\d+-/);
});

test("las respuestas deben estar completas: una por pregunta, sin vacíos", () => {
  assert.equal(parqAnswersComplete([false, false, false, false, false, false, false]), true);
  assert.equal(parqAnswersComplete([false, false, null, false, false, false, false]), false);
  assert.equal(parqAnswersComplete([false, false, false]), false);
});

test("un solo «sí» bloquea el cálculo", () => {
  assert.equal(parqHasYes([false, false, false, false, false, false, false]), false);
  assert.equal(parqHasYes([false, false, false, false, false, false, true]), true);
  assert.equal(parqHasYes([true, false, false, false, false, false, false]), true);
});
