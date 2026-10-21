import { z } from "zod";

/** Política de seguridad que el cliente acepta antes de calcular. Se muestra en la calculadora y en cada reporte. */
export const DISCLAIMER_VERSION = "v3-2026-10";
export const DISCLAIMER_TITLE = "Aviso de seguridad: resultados genéricos, bajo su responsabilidad";
export const DISCLAIMER_ES =
  "Los resultados de esta herramienta son genéricos, no personalizados. Son tablas de referencia general calculadas con fórmulas estándar; no consideran su historial médico, lesiones, medicamentos ni condiciones particulares, y no son un diagnóstico ni una prescripción. Usted decide si usa esta información y lo hace bajo su propia responsabilidad. Para un plan adaptado a usted, consulte con un nutricionista profesional y un entrenador capacitado. Si tiene una condición de salud, toma medicamentos, está embarazada o es menor de edad, consulte con un médico antes de cambiar su alimentación o iniciar ejercicio. Los valores de referencia están pendientes de revisión profesional.";
export const DISCLAIMER_ACCEPT_ES =
  "Entiendo que estos resultados son genéricos y no están personalizados por un profesional. Decido usarlos bajo mi propia responsabilidad.";

/**
 * Objetivos. kcalFactor multiplica el gasto diario; targetPct cambia el peso;
 * rateKgWeek es el ritmo de cambio de referencia; aerobicMin y strengthDays
 * siguen las recomendaciones de la OMS (150–300 min moderados y fuerza 2+ días).
 */
export const GOALS = [
  { key: "bajar", label: "Bajar de peso", kcalFactor: 0.8, proteinPerKg: 2.0, targetPct: -0.1, rateKgWeek: 0.5, aerobicMin: 180, strengthDays: 3 },
  { key: "definir", label: "Definición muscular", kcalFactor: 0.85, proteinPerKg: 2.2, targetPct: -0.03, rateKgWeek: 0.25, aerobicMin: 150, strengthDays: 4 },
  { key: "mantener", label: "Mantener físico", kcalFactor: 1, proteinPerKg: 1.8, targetPct: 0, rateKgWeek: 0, aerobicMin: 150, strengthDays: 2 },
  { key: "musculo", label: "Ganar músculo", kcalFactor: 1.1, proteinPerKg: 2.0, targetPct: 0.03, rateKgWeek: 0.25, aerobicMin: 90, strengthDays: 4 },
  { key: "peso", label: "Ganar peso", kcalFactor: 1.15, proteinPerKg: 1.8, targetPct: 0.08, rateKgWeek: 0.25, aerobicMin: 60, strengthDays: 3 },
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

/** Categoría de IMC según la OMS. */
export function imcCategory(imc: number): string {
  if (imc < 18.5) return "Bajo peso";
  if (imc < 25) return "Peso normal";
  if (imc < 30) return "Sobrepeso";
  return "Obesidad";
}

/** Peso objetivo: el cambio del objetivo, sin bajar de IMC 18.5 y, en bajar/definir, sin pasar de IMC 24.9. */
export function targetWeight(weightKg: number, heightCm: number, goal: GoalKey): number {
  const g = GOALS.find((x) => x.key === goal)!;
  const h2 = (heightCm / 100) ** 2;
  const low = 18.5 * h2;
  // El tope de IMC 24.9 sólo aplica a bajar y definir; subir de peso o músculo no se recorta.
  const high = goal === "bajar" || goal === "definir" ? Math.max(24.9 * h2, weightKg) : Infinity;
  return round(Math.min(high, Math.max(low, weightKg * (1 + g.targetPct))), 1);
}

/** Gasto basal (Mifflin-St Jeor), gasto diario, calorías del objetivo y macronutrientes. */
export function computeTargets(input: PlanInputs) {
  const { sex, age, weightKg, heightCm, activity, goal } = input;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "m" ? 5 : -161);
  const get = bmr * (ACTIVITY.find((a) => a.key === activity)?.factor ?? 1.2);
  const g = GOALS.find((x) => x.key === goal)!;
  const floor = sex === "m" ? 1500 : 1200;
  const raw = Math.round((get * g.kcalFactor) / 10) * 10;
  const kcal = Math.max(floor, raw);
  const protein = round(weightKg * g.proteinPerKg);
  const fat = round((kcal * 0.25) / 9);
  const carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4));
  const heightM = heightCm / 100;
  const imc = round(weightKg / (heightM * heightM), 1);
  const target = targetWeight(weightKg, heightCm, goal);
  const diff = Math.abs(target - weightKg);
  return {
    imc,
    imcCategory: imcCategory(imc),
    bmr: Math.round(bmr),
    get: Math.round(get),
    kcal,
    floorApplied: kcal !== raw,
    targetWeightKg: target,
    weeklyRateKg: g.rateKgWeek,
    weeksEstimate: g.rateKgWeek > 0 && diff > 0 ? Math.ceil(diff / g.rateKgWeek) : 0,
    weeklyExercise: { aerobicMin: g.aerobicMin, strengthDays: g.strengthDays },
    macros: { proteinG: protein, fatG: fat, carbsG: carbs },
  };
}

export type MealSlot = {
  id: string;
  title: string;
  text: string;
  share: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const MEALS = [
  { id: "desayuno", title: "Desayuno", share: 0.25, text: "Avena o pan integral + huevo o yogur natural + fruta." },
  { id: "almuerzo", title: "Almuerzo", share: 0.35, text: "Proteína magra (pollo, pescado, frijoles) + arroz o tortilla integral + verduras." },
  { id: "merienda", title: "Merienda", share: 0.15, text: "Fruta + puñado de nueces o queso fresco." },
  { id: "cena", title: "Cena", share: 0.25, text: "Proteína magra + vegetales + porción moderada de carbohidrato." },
];

/** Tabla nutricional por comida (alimentos genéricos, sin marcas). El entrenador puede editar el texto. */
export function buildMealPlan(macros: { proteinG: number; fatG: number; carbsG: number }, kcal: number): MealSlot[] {
  return MEALS.map((m) => ({
    ...m,
    kcal: Math.round(kcal * m.share),
    proteinG: round(macros.proteinG * m.share),
    carbsG: round(macros.carbsG * m.share),
    fatG: round(macros.fatG * m.share),
  }));
}

/** Guía nutricional general por objetivo (texto fijo, revisable por profesional). */
export function nutritionGuide(goal: GoalKey): string[] {
  const common = [
    "Tomá agua durante el día (aprox. 2 a 3 litros, según clima y actividad).",
    "Incluí proteína en cada comida y verduras en al menos la mitad del plato.",
    "Limitá bebidas azucaradas, comida rápida y alcohol.",
    "Dormí entre 7 y 9 horas: el descanso influye en el hambre y la recuperación.",
  ];
  const specific: Record<GoalKey, string> = {
    bajar: "Déficit moderado: busque una pérdida de unos 0.5 kg por semana. Evite dietas extremas.",
    definir: "Déficit leve y proteína alta para conservar músculo mientras baja la grasa.",
    mantener: "Mantenga las calorías cerca de su gasto diario y revise su peso cada semana.",
    musculo: "Superávit leve de calorías y proteína repartida en 3 a 5 comidas.",
    peso: "Superávit moderado: agregue colaciones con carbohidratos y grasas saludables.",
  };
  return [specific[goal], ...common];
}

export type Exercise = { name: string; sets: number; reps: string; restSec: number };
export type RoutineDay = { day: string; focus: string; exercises: Exercise[] };

const REPS: Record<GoalKey, string> = { bajar: "12–15", definir: "10–12", mantener: "10–12", musculo: "8–12", peso: "6–10" };
const REST: Record<GoalKey, number> = { bajar: 60, definir: 60, mantener: 75, musculo: 90, peso: 90 };

const STRENGTH_TEMPLATES: { focus: string; names: string[] }[] = [
  { focus: "Piernas y glúteos", names: ["Sentadilla goblet", "Peso muerto rumano", "Zancada alterna", "Plancha"] },
  { focus: "Empuje y core", names: ["Flexiones (o en rodillas)", "Press de hombro con mancuernas", "Remo con banda o mancuerna", "Crunch abdominal"] },
  { focus: "Tirón y cuerpo completo", names: ["Jalón o dominadas asistidas", "Puente de glúteo", "Curl de bíceps", "Caminata en inclinación"] },
  { focus: "Cuerpo completo", names: ["Sentadilla búlgara", "Hip thrust", "Press inclinado con mancuernas", "Jalón al pecho"] },
];

/**
 * Rutina semanal: días de fuerza según el objetivo más sesiones de cardio
 * que suman los minutos aeróbicos semanales (OMS 150–300 min moderados).
 */
export function buildRoutine(goal: GoalKey): RoutineDay[] {
  const g = GOALS.find((x) => x.key === goal)!;
  const reps = REPS[goal];
  const rest = REST[goal];
  const strength: RoutineDay[] = STRENGTH_TEMPLATES.slice(0, g.strengthDays).map((t, i) => ({
    day: `Fuerza ${i + 1}`,
    focus: t.focus,
    exercises: t.names.map((name, j) => ({
      name,
      sets: j === t.names.length - 1 ? 2 : 3,
      reps: name === "Plancha" ? "20–40 s" : reps,
      restSec: name === "Plancha" ? 45 : rest,
    })),
  }));
  const sessions = Math.max(2, Math.ceil(g.aerobicMin / 45));
  const perSession = Math.round(g.aerobicMin / sessions);
  const cardio: RoutineDay[] = Array.from({ length: sessions }, (_, i) => ({
    day: `Cardio ${i + 1}`,
    focus: "Actividad aeróbica moderada",
    exercises: [{ name: "Caminata rápida, bicicleta o natación (conversación posible)", sets: 1, reps: `${perSession} min`, restSec: 0 }],
  }));
  return [...strength, ...cardio];
}

export const SOURCES_ES = [
  "Mifflin-St Jeor (gasto basal). Recomendación de actividad: OMS 2020, 150–300 min moderados por semana y fuerza en 2 o más días.",
  "Clasificación de IMC: OMS.",
];

/** Plan completo. El servidor recalcula siempre; nunca confía en resultados enviados por el navegador. */
export function buildPlan(input: PlanInputs) {
  const results = computeTargets(input);
  return {
    results,
    mealPlan: buildMealPlan(results.macros, results.kcal),
    routine: buildRoutine(input.goal),
    guide: nutritionGuide(input.goal),
    sources: SOURCES_ES,
  };
}
