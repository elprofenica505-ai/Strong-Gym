/**
 * Reglas de medidas, metas y seguimiento por cliente (etapa B).
 * Lógica pura: sin base de datos ni React. La base (00039) repite las reglas
 * duras como restricciones; aquí se calculan avisos, IMC y avance.
 *
 * Fuentes:
 * - IMC: OMS, clasificación para adultos (bajo peso < 18.5; normal 18.5 a 24.9;
 *   sobrepeso 25 a 29.9; obesidad ≥ 30). https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight
 * - Sitios de medición de circunferencias: protocolo ISAK (brazo relajado y contraído,
 *   cintura mínima, glúteo máximo, muslo, pantorrilla máxima, antebrazo máximo, pecho).
 *   https://pmc.ncbi.nlm.nih.gov/articles/PMC10975034/ y https://theiopn.com/wp-content/uploads/2014/09/Example-ISAK-Assessment-Report.pdf
 * Los rangos de "aviso de confirmación" NO son normas clínicas: sólo detectan
 * errores de digitación. Están marcados como provisionales hasta que el dueño los confirme.
 */

/** Ocho circunferencias del protocolo ISAK acordado. Cada una es opcional. */
export const MEASURE_SITES = [
  { key: "cintura_cm", label: "Cintura" },
  { key: "pecho_cm", label: "Pecho" },
  { key: "biceps_relajado_cm", label: "Bíceps relajado" },
  { key: "biceps_contraido_cm", label: "Bíceps contraído" },
  { key: "antebrazo_cm", label: "Antebrazo" },
  { key: "gluteo_cm", label: "Glúteo" },
  { key: "muslo_cm", label: "Muslo" },
  { key: "pantorrilla_cm", label: "Pantorrilla" },
] as const;

export type MeasureKey = (typeof MEASURE_SITES)[number]["key"];

export const GOAL_TYPES = [
  { key: "perdida", label: "Pérdida de peso" },
  { key: "ganancia", label: "Ganancia de peso o masa" },
  { key: "mantenimiento", label: "Mantenimiento" },
  { key: "otra", label: "Otra (se describe)" },
] as const;

export type GoalType = (typeof GOAL_TYPES)[number]["key"];

/** Plazo máximo de una meta y revisión cada 3 meses (decisión del dueño). */
export const MAX_GOAL_MONTHS = 12;
export const REVIEW_EVERY_MONTHS = 3;

/** Tolerancia (kg) para considerar "mantenimiento" cumplido. Provisional. */
export const MAINTENANCE_TOLERANCE_KG = 2;

/** Límite duro: por encima o por debajo, el dato se rechaza (cero no es un dato). */
export const HARD_LIMITS = { weightKg: [0, 500], heightCm: [0, 250], measureCm: [0, 300] } as const;

/** Rangos de aviso: fuera de ellos se pide confirmar, no se rechaza. Provisionales. */
export const CONFIRM_RANGES = {
  weightKg: [30, 250],
  heightCm: [120, 230],
  measureCm: [15, 200],
} as const;

export type Check = "ok" | "confirm" | "invalid" | "empty";

/** Valida un número capturado. Vacío significa "no tomada" y nunca se convierte en cero. */
export function checkValue(raw: unknown, range: readonly [number, number], hard: readonly [number, number]): Check {
  if (raw === null || raw === undefined || raw === "") return "empty";
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return "invalid";
  if (n <= hard[0] || n > hard[1]) return "invalid";
  if (n < range[0] || n > range[1]) return "confirm";
  return "ok";
}

export function checkWeight(raw: unknown): Check {
  return checkValue(raw, CONFIRM_RANGES.weightKg, HARD_LIMITS.weightKg);
}
export function checkHeight(raw: unknown): Check {
  return checkValue(raw, CONFIRM_RANGES.heightCm, HARD_LIMITS.heightCm);
}
export function checkMeasure(raw: unknown): Check {
  return checkValue(raw, CONFIRM_RANGES.measureCm, HARD_LIMITS.measureCm);
}

/** IMC = kg / m². Devuelve null si falta un dato o no es válido. */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export type BmiCategory = "bajo_peso" | "normal" | "sobrepeso" | "obesidad";

/** Clasificación de la OMS para adultos. */
export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return "bajo_peso";
  if (value < 25) return "normal";
  if (value < 30) return "sobrepeso";
  return "obesidad";
}

export const BMI_LABEL: Record<BmiCategory, string> = {
  bajo_peso: "Bajo peso",
  normal: "Peso normal",
  sobrepeso: "Sobrepeso",
  obesidad: "Obesidad",
};

/** Peso sano para una altura: IMC de 18.5 a 24.9. */
export function healthyWeightRange(heightCm: number): [number, number] {
  const m = heightCm / 100;
  return [Number((18.5 * m * m).toFixed(1)), Number((24.9 * m * m).toFixed(1))];
}

/** Suma meses a una fecha AAAA-MM-DD sin pasarse de fin de mes. */
export function addMonths(isoDay: string, months: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/** Fechas de revisión cada 3 meses, hasta el plazo máximo de 12 meses. */
export function reviewDates(startsOn: string, targetDate: string): string[] {
  const out: string[] = [];
  for (let k = REVIEW_EVERY_MONTHS; k <= MAX_GOAL_MONTHS; k += REVIEW_EVERY_MONTHS) {
    const d = addMonths(startsOn, k);
    if (d <= targetDate) out.push(d);
  }
  return out;
}

/** Errores de una meta antes de guardarla. Vacío = válida. */
export function goalErrors(input: {
  goalType: GoalType;
  startsOn: string;
  targetDate: string;
  targetWeightKg: number | null;
  otherLabel: string | null;
}): string[] {
  const errs: string[] = [];
  if (!(input.targetDate > input.startsOn)) errs.push("La fecha límite debe ser posterior al inicio.");
  if (input.targetDate > addMonths(input.startsOn, MAX_GOAL_MONTHS)) {
    errs.push(`El plazo máximo es de ${MAX_GOAL_MONTHS} meses.`);
  }
  if ((input.goalType === "perdida" || input.goalType === "ganancia" || input.goalType === "mantenimiento") &&
      (input.targetWeightKg === null || input.targetWeightKg <= 0)) {
    errs.push("Esta meta necesita un peso objetivo mayor que cero.");
  }
  if (input.goalType === "otra" && !(input.otherLabel && input.otherLabel.trim().length >= 3)) {
    errs.push("Describe la meta (mínimo 3 letras).");
  }
  return errs;
}

export type GoalStatus = "sin_datos" | "en_camino" | "cumplida" | "en_rango" | "fuera_de_rango" | "manual";

export interface GoalProgress {
  status: GoalStatus;
  /** Porcentaje hacia la meta, 0 a 100. Null si no se puede calcular. */
  percent: number | null;
}

/**
 * Avance de la meta. Si falta dato inicial o actual, devuelve "sin_datos"
 * con porcentaje null: nunca un número inventado.
 */
export function goalProgress(input: {
  goalType: GoalType;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
}): GoalProgress {
  const { goalType, startWeightKg: s, currentWeightKg: c, targetWeightKg: t } = input;
  if (goalType === "otra") return { status: "manual", percent: null };
  if (c === null || c === undefined) return { status: "sin_datos", percent: null };

  if (goalType === "mantenimiento") {
    if (t === null) return { status: "sin_datos", percent: null };
    const inRange = Math.abs(c - t) <= MAINTENANCE_TOLERANCE_KG;
    return { status: inRange ? "en_rango" : "fuera_de_rango", percent: null };
  }

  if (s === null || s === undefined || t === null || t === undefined) return { status: "sin_datos", percent: null };
  const span = goalType === "perdida" ? s - t : t - s;
  if (span === 0) return { status: "sin_datos", percent: null };
  const done = goalType === "perdida" ? s - c : c - s;
  const percent = Math.max(0, Math.min(100, Math.round((done / span) * 100)));
  return { status: percent >= 100 ? "cumplida" : "en_camino", percent };
}

/** Día civil de America/Managua en formato AAAA-MM-DD. */
export function managuaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Managua", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/**
 * Peso inicial de una meta: la medición más reciente hasta la fecha de inicio de la meta
 * (el peso registrado al crearla). Si no hay medición previa, devuelve null y el avance
 * muestra «sin datos» en lugar de tomar una medición posterior como inicio.
 */
export function goalStartWeight(
  measurements: ReadonlyArray<{ measuredOn: string; weightKg: number | null }>,
  startsOn: string,
): number | null {
  let best: { measuredOn: string; weightKg: number } | null = null;
  for (const m of measurements) {
    if (m.weightKg === null || m.measuredOn > startsOn) continue;
    if (!best || m.measuredOn > best.measuredOn) best = { measuredOn: m.measuredOn, weightKg: m.weightKg };
  }
  return best ? best.weightKg : null;
}
