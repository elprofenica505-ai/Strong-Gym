import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";

const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { MyProgress } = await createLoader({})("components/account/my-progress.tsx");

const base = {
  clientName: "Ana",
  measurements: [{
    id: "a", measuredOn: "2026-10-18", weightKg: 70, heightCm: 170, notes: null,
    values: { cintura_cm: 80, pecho_cm: null, biceps_relajado_cm: null, biceps_contraido_cm: null,
      antebrazo_cm: null, gluteo_cm: null, muslo_cm: 55, pantorrilla_cm: null },
  }],
  goal: { id: "m", goalType: "perdida", otherLabel: null, startsOn: "2026-10-01", targetDate: "2027-09-30", targetWeightKg: 65 },
  routine: { id: "r", name: "Fuerza A", days: ["Lun", "Jue"], startsOn: "2026-10-01",
    exercises: [{ ejercicio: "Sentadilla", series: 4, reps: "6-8", descanso_s: 120 }] },
};
const html = (data) => renderToStaticMarkup(React.createElement(MyProgress, { data }));

test("muestra peso, IMC, circunferencias, meta y rutina del cliente", () => {
  const h = html(base);
  assert.ok(h.includes("70 kg"));
  assert.ok(h.includes("24.2")); // 70 / 1.7^2
  assert.ok(h.includes("Peso normal"));
  assert.ok(h.includes("Peso sano para tu altura: 53.5 a 72 kg"));
  assert.ok(h.includes("55 cm")); // muslo
  assert.ok(h.includes("Pérdida de peso"));
  assert.ok(h.includes("llegar a 65 kg"));
  assert.ok(h.includes("Mi rutina: Fuerza A"));
  assert.ok(h.includes("Sentadilla"));
  assert.ok(h.includes("Revisión cada 3 meses"));
});

test("sin medidas muestra mensaje, nunca ceros", () => {
  const h = html({ ...base, measurements: [], goal: null, routine: null });
  assert.ok(h.includes("Todavía no hay medidas registradas"));
  assert.ok(!h.includes("0 kg"));
});

test("sin altura no inventa IMC", () => {
  const h = html({ ...base, measurements: [{ ...base.measurements[0], heightCm: null }] });
  assert.ok(h.includes("Hace falta la altura para calcularlo"));
});

test("no muestra notas internas del personal", () => {
  const h = html({ ...base, measurements: [{ ...base.measurements[0], notes: "NOTA INTERNA" }] });
  assert.ok(!h.includes("NOTA INTERNA"));
});
