import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTargets, buildPlan, inputsSchema, GOALS, DISCLAIMER_ES } from '../src/lib/nutrition/plan.ts';

const base = { sex: 'm', age: 30, weightKg: 80, heightCm: 180, activity: 3, goal: 'mantener' };

test('gasto basal Mifflin-St Jeor (hombre 30 años, 80 kg, 180 cm = 1780 kcal)', () => {
  assert.equal(computeTargets(base).bmr, 1780);
});

test('mujer: fórmula con −161', () => {
  assert.equal(computeTargets({ ...base, sex: 'f', weightKg: 60, heightCm: 165, age: 25 }).bmr, 1345);
});

test('objetivo bajar reduce el gasto diario frente a mantener', () => {
  assert.ok(computeTargets({ ...base, goal: 'bajar' }).kcal < computeTargets(base).kcal);
});

test('piso de seguridad: nunca menos de 1200 kcal (mujer) ni 1500 (hombre)', () => {
  const low = computeTargets({ sex: 'f', age: 60, weightKg: 45, heightCm: 150, activity: 1, goal: 'bajar' });
  assert.equal(low.kcal, 1200);
  assert.equal(low.floorApplied, true);
  const lowM = computeTargets({ sex: 'm', age: 60, weightKg: 50, heightCm: 150, activity: 1, goal: 'bajar' });
  assert.equal(lowM.kcal, 1500);
});

test('macros cuadran con las kcal (±10 kcal por redondeo)', () => {
  for (const g of GOALS) {
    const t = computeTargets({ ...base, goal: g.key });
    const sum = t.macros.proteinG * 4 + t.macros.fatG * 9 + t.macros.carbsG * 4;
    assert.ok(Math.abs(sum - t.kcal) <= 10, `${g.key}: ${sum} vs ${t.kcal}`);
  }
});

test('plan completo: 4 comidas que suman el 100% y rutina de 3 días', () => {
  const p = buildPlan(base);
  assert.equal(p.mealPlan.length, 4);
  assert.ok(Math.abs(p.mealPlan.reduce((a, m) => a + m.share, 0) - 1) < 1e-9);
  assert.equal(p.routine.length, 3);
  assert.ok(p.routine.every((d) => d.exercises.length >= 3));
});

test('validación: edad menor de 14 y peso fuera de rango se rechazan', () => {
  assert.equal(inputsSchema.safeParse({ ...base, age: 12 }).success, false);
  assert.equal(inputsSchema.safeParse({ ...base, weightKg: 400 }).success, false);
  assert.ok(inputsSchema.safeParse(base).success);
});

test('el aviso obligatorio menciona nutricionista y entrenador', () => {
  assert.match(DISCLAIMER_ES, /nutricionista/);
  assert.match(DISCLAIMER_ES, /entrenador/);
});
