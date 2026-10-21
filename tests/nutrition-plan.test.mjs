import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTargets, buildPlan, inputsSchema, imcCategory, targetWeight, GOALS, DISCLAIMER_ES, DISCLAIMER_ACCEPT_ES, DISCLAIMER_TITLE } from '../src/lib/nutrition/plan.ts';

const base = { sex: 'm', age: 30, weightKg: 80, heightCm: 180, activity: 3, goal: 'mantener' };

test('gasto basal Mifflin-St Jeor (hombre 30 años, 80 kg, 180 cm = 1780 kcal)', () => {
  assert.equal(computeTargets(base).bmr, 1780);
});

test('mujer: fórmula con −161', () => {
  assert.equal(computeTargets({ ...base, sex: 'f', weightKg: 60, heightCm: 165, age: 25 }).bmr, 1345);
});

test('IMC y categoría OMS (80 kg, 1.80 m = 24.7 normal)', () => {
  const t = computeTargets(base);
  assert.equal(t.imc, 24.7);
  assert.equal(t.imcCategory, 'Peso normal');
  assert.equal(imcCategory(17), 'Bajo peso');
  assert.equal(imcCategory(27), 'Sobrepeso');
  assert.equal(imcCategory(31), 'Obesidad');
});

test('peso objetivo: bajar reduce ~10% sin pasar de IMC 18.5', () => {
  const t = computeTargets({ ...base, goal: 'bajar' });
  assert.equal(t.targetWeightKg, 72);
  assert.equal(targetWeight(50, 180, 'bajar'), 59.9);
});

test('ganar peso sube el peso objetivo y estima semanas (0.25 kg/semana)', () => {
  const t = computeTargets({ ...base, goal: 'peso' });
  assert.equal(t.targetWeightKg, 86.4);
  assert.equal(t.weeksEstimate, Math.ceil((86.4 - 80) / 0.25));
});

test('mantener físico: peso objetivo igual y sin semanas estimadas', () => {
  const t = computeTargets({ ...base, goal: 'mantener' });
  assert.equal(t.targetWeightKg, 80);
  assert.equal(t.weeksEstimate, 0);
});

test('objetivo bajar reduce calorías frente a mantener', () => {
  assert.ok(computeTargets({ ...base, goal: 'bajar' }).kcal < computeTargets(base).kcal);
});

test('piso de seguridad: nunca menos de 1200 kcal (mujer) ni 1500 (hombre)', () => {
  const low = computeTargets({ sex: 'f', age: 60, weightKg: 45, heightCm: 150, activity: 1, goal: 'bajar' });
  assert.equal(low.kcal, 1200);
  assert.equal(low.floorApplied, true);
  assert.equal(computeTargets({ sex: 'm', age: 60, weightKg: 50, heightCm: 150, activity: 1, goal: 'bajar' }).kcal, 1500);
});

test('macros cuadran con las kcal (±10 kcal por redondeo)', () => {
  for (const g of GOALS) {
    const t = computeTargets({ ...base, goal: g.key });
    const sum = t.macros.proteinG * 4 + t.macros.fatG * 9 + t.macros.carbsG * 4;
    assert.ok(Math.abs(sum - t.kcal) <= 10, `${g.key}: ${sum} vs ${t.kcal}`);
  }
});

test('tabla nutricional: 4 comidas que suman las kcal y la proteína del objetivo', () => {
  const p = buildPlan({ ...base, goal: 'musculo' });
  assert.equal(p.mealPlan.length, 4);
  const kcal = p.mealPlan.reduce((a, m) => a + m.kcal, 0);
  const prot = p.mealPlan.reduce((a, m) => a + m.proteinG, 0);
  assert.ok(Math.abs(kcal - p.results.kcal) <= 4, `kcal ${kcal} vs ${p.results.kcal}`);
  assert.ok(Math.abs(prot - p.results.macros.proteinG) <= 1, `proteína ${prot} vs ${p.results.macros.proteinG}`);
});

test('ejercicio: cardio suma los minutos OMS y la fuerza tiene los días del objetivo', () => {
  for (const g of GOALS) {
    const p = buildPlan({ ...base, goal: g.key });
    const strength = p.routine.filter((d) => d.day.startsWith('Fuerza')).length;
    const cardioMin = p.routine
      .filter((d) => d.day.startsWith('Cardio'))
      .reduce((a, d) => a + parseInt(d.exercises[0].reps, 10), 0);
    assert.equal(strength, g.strengthDays, g.key);
    assert.ok(Math.abs(cardioMin - g.aerobicMin) <= 4, `${g.key}: ${cardioMin} vs ${g.aerobicMin}`);
    assert.ok(g.aerobicMin >= 60, 'mínimo de aeróbico alineado con OMS para salud');
  }
});

test('guía y fuentes incluidas en el plan', () => {
  const p = buildPlan(base);
  assert.ok(p.guide.length >= 4);
  assert.ok(p.sources.some((s) => /OMS/.test(s)));
});

test('validación: edad menor de 14 y peso fuera de rango se rechazan', () => {
  assert.equal(inputsSchema.safeParse({ ...base, age: 12 }).success, false);
  assert.equal(inputsSchema.safeParse({ ...base, weightKg: 400 }).success, false);
  assert.ok(inputsSchema.safeParse(base).success);
});

test('el aviso de seguridad dice que los resultados son genéricos y bajo responsabilidad del cliente', () => {
  assert.match(DISCLAIMER_ES, /genéricos, no personalizados/);
  assert.match(DISCLAIMER_ES, /bajo su propia responsabilidad/);
  assert.match(DISCLAIMER_ES, /nutricionista profesional/);
  assert.match(DISCLAIMER_ES, /entrenador capacitado/);
  assert.match(DISCLAIMER_ES, /médico/);
  assert.match(DISCLAIMER_TITLE, /seguridad/);
  assert.match(DISCLAIMER_ACCEPT_ES, /responsabilidad/);
});
