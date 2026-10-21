import { z } from "zod";

/** Aviso obligatorio: se muestra en cada pantalla de la herramienta y se guarda con el plan. */
export const DISCLAIMER_VERSION = "v1-2026-10";
export const DISCLAIMER_ES =
  "Herramienta no certificada por nutricionista ni entrenador oficial. Es una orientación general, no un diagnóstico ni una prescripción. Busque un nutricionista profesional y un entrenador capacitado antes de cambiar su alimentación o su entrenamiento, sobre todo si tiene una condición de salud, toma medicamentos, está embarazada o es menor de edad.";

export const GOALS = [
  { key: "bajar", label: "Bajar de peso", kcalFactor: 0.8, proteinPerKg: 2.0 },
  { key: "definir", label: "Definir (perder grasa, mantener músculo)", kcalFactor: 0.85, proteinPerKg: 2.2 },
  { key: "mantener", label: "Mantener peso", kcalFactor: 1, proteinPerKg: 1.8 },
  { key: "musculo", label: "Ganar músculo", kcalFactor: 1.1, proteinPerKg: 2.0 },
  { key: "peso", label: "Subir de peso", kcalFactor: 1.15, proteinPerKg: 1.8 },
] as const;
export type GoalKey = (typeof GOALS)[number]["key"];

export const ACTIVITY = [
  { key: 1, label: "Poca o ninguna (trabajo sentado)", factor: 1.2 },
  { key: 2, label: "Ligera (1–3 días por semana)", factor: 1.375 },
  { key: 3, label: "Moderada (3–5 días por semana)", factor: 1.55 },
  { key: 4, label: "Alta (6–7 días por semana)", factor: 1.725 },
  { key: 5, label: "Muy alta (trabajo físico y entrenamiento)", factor: 1.9 },
] as const;

export const inputsSchema = z.object({
  sex: z.enum(["f", "m"]),
  age: z.number().int().min(14, "La herramienta es para mayores de 14 años.").max(90),
  weightKg: z.number().min(30).max(250),
  heightCm: z.number().min(120).max(230),
  activity: z.number().int().min(1).max(5),
  goal: z.enum(["bajar", "definir", "mantener", "musculo", "peso"]),
});
export type PlanInputs = z.infer<typeof inputsSchema>;

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** Gasto basal (Mifflin-St Jeor), gasto diario y metas de macronutrientes. */
export function computeTargets(input: PlanInputs) {
  const { sex, age, weightKg, heightCm, activity, goal } = input;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "m" ? 5 : -161);
  const tdee = bmr * (ACTIVITY.find((a) => a.key === activity)?.factor ?? 1.2);
  const g = GOALS.find((x) => x.key === goal)!;
  const floor = sex === "m" ? 1500 : 1200;
  const raw = Math.round((tdee * g.kcalFactor) / 10) * 10;
  const kcal = Math.max(floor, raw);
  const protein = round(weightKg * g.proteinPerKg);
  const fat = round((kcal * 0.25) / 9);
  const carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4));
  const heightM = heightCm / 100;
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    floorApplied: kcal !== raw,
    bmi: round(weightKg / (heightM * heightM), 1),
    macros: { proteinG: protein, fatG: fat, carbsG: carbs },
  };
}

export type MealSlot = { id: string; title: string; text: string; share: number };

/** Plan de comidas genérico (sin marcas). El entrenador puede editarlo. */
export function buildMealPlan(kcal: number, protein: number): MealSlot[] {
  const slots = [
    { id: "desayuno", title: "Desayuno", share: 0.25, text: "Avena o pan integral + huevo o yogur natural + fruta." },
    { id: "almuerzo", title: "Almuerzo", share: 0.35, text: "Proteína magra (pollo, pescado, frijoles) + arroz o tortilla integral + verduras." },
    { id: "merienda", title: "Merienda", share: 0.15, text: "Fruta + puñado de nueces o queso fresco." },
    { id: "cena", title: "Cena", share: 0.25, text: "Proteína magra + vegetales + porción moderada de carbohidrato." },
  ];
  return slots.map((s) => ({
    ...s,
    text: `${s.text} (≈ ${Math.round(kcal * s.share)} kcal, ≈ ${Math.round(protein * s.share)} g de proteína)`,
  }));
}

export type Exercise = { name: string; sets: number; reps: string; restSec: number };
export type RoutineDay = { day: string; focus: string; exercises: Exercise[] };

const RESTS: Record<GoalKey, number> = { bajar: 60, definir: 60, mantener: 75, musculo: 90, peso: 90 };
const REPS: Record<GoalKey, string> = { bajar: "12–15", definir: "10–12", mantener: "10–12", musculo: "8–12", peso: "6–10" };

/** Rutina general de 3 días por objetivo. El entrenador la ajusta a mano. */
export function buildRoutine(goal: GoalKey): RoutineDay[] {
  const r = RESTS[goal];
  const reps = REPS[goal];
  return [
    { day: "Día 1", focus: "Piernas y glúteos", exercises: [
      { name: "Sentadilla goblet", sets: 3, reps, restSec: r },
      { name: "Peso muerto rumano", sets: 3, reps, restSec: r },
      { name: "Zancada alterna", sets: 2, reps, restSec: r },
      { name: "Plancha", sets: 3, reps: "20–40 s", restSec: 45 },
    ] },
    { day: "Día 2", focus: "Empuje y core", exercises: [
      { name: "Flexiones (o en rodillas)", sets: 3, reps, restSec: r },
      { name: "Press de hombro con mancuernas", sets: 3, reps, restSec: r },
      { name: "Remo con banda o mancuerna", sets: 3, reps, restSec: r },
      { name: "Crunch abdominal", sets: 2, reps: "15–20", restSec: 45 },
    ] },
    { day: "Día 3", focus: "Tirón y cuerpo completo", exercises: [
      { name: "Jalón o dominadas asistidas", sets: 3, reps, restSec: r },
      { name: "Puente de glúteo", sets: 3, reps, restSec: r },
      { name: "Curl de bíceps", sets: 2, reps, restSec: 60 },
      { name: "Caminata en inclinación o bicicleta", sets: 1, reps: "15–20 min", restSec: 0 },
    ] },
  ];
}

/** Plan completo. El servidor recalcula siempre; nunca confía en resultados enviados por el navegador. */
export function buildPlan(input: PlanInputs) {
  const targets = computeTargets(input);
  return {
    results: targets,
    mealPlan: buildMealPlan(targets.kcal, targets.macros.proteinG),
    routine: buildRoutine(input.goal),
  };
}
