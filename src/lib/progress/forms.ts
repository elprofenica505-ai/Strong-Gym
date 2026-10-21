/**
 * Conversión de lo que escribe la persona en el formulario a datos válidos.
 * Pura: la usan la pantalla y la ruta /api/progress. La base vuelve a validar.
 */
import {
  MEASURE_SITES, checkHeight, checkMeasure, checkWeight, goalErrors, managuaToday,
  type GoalType, type MeasureKey,
} from "./rules.ts";

export type MeasureValues = Partial<Record<MeasureKey, number | null>>;

export interface MeasurementInput {
  measuredOn: string;
  weightKg: number;
  heightCm: number | null;
  values: Record<MeasureKey, number | null>;
  notes: string | null;
  /** Campos fuera de rango de aviso: la persona debe confirmarlos. */
  needsConfirmation: string[];
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

const LABEL: Record<string, string> = { weightKg: "Peso", heightCm: "Altura" };
const SITE_LABEL = Object.fromEntries(MEASURE_SITES.map(m => [m.key, m.label]));

function num(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : NaN as unknown as number;
}

export function parseMeasurementForm(raw: Record<string, unknown>): ParseResult<MeasurementInput> {
  const errors: string[] = [];
  const confirm: string[] = [];
  const measuredOn = String(raw.measuredOn ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredOn)) errors.push("La fecha no es válida.");
  else if (measuredOn > managuaToday()) errors.push("La fecha no puede ser futura (día de Managua).");

  const weightCheck = checkWeight(raw.weightKg);
  if (weightCheck === "empty") errors.push("El peso es obligatorio.");
  else if (weightCheck === "invalid") errors.push("El peso debe ser mayor que cero y válido.");
  else if (weightCheck === "confirm") confirm.push("weightKg");

  const heightRaw = num(raw.heightCm);
  const heightCheck = checkHeight(raw.heightCm);
  if (heightCheck === "invalid") errors.push("La altura debe ser mayor que cero y válida.");
  else if (heightCheck === "confirm") confirm.push("heightCm");

  const values = {} as Record<MeasureKey, number | null>;
  for (const site of MEASURE_SITES) {
    const c = checkMeasure((raw.values as Record<string, unknown> | undefined)?.[site.key]);
    if (c === "invalid") errors.push(`${site.label}: debe ser mayor que cero y válida. Si no la tomaste, déjala vacía.`);
    else if (c === "confirm") confirm.push(site.key);
    values[site.key] = c === "ok" || c === "confirm" ? num((raw.values as Record<string, unknown>)[site.key]) : null;
  }

  const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
  if (notes.length > 300) errors.push("Las notas no pueden pasar de 300 letras.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      measuredOn,
      weightKg: num(raw.weightKg) as number,
      heightCm: heightCheck === "empty" ? null : heightRaw,
      values,
      notes: notes || null,
      needsConfirmation: confirm,
    },
  };
}

/** Nombres legibles de los campos que piden confirmación (para el aviso en pantalla). */
export function confirmationLabel(key: string): string {
  return LABEL[key] ?? SITE_LABEL[key as MeasureKey] ?? key;
}

export interface RoutineExercise { ejercicio: string; series: number | null; reps: string | null; descanso_s: number | null }

/**
 * Una línea por ejercicio: "Sentadilla; 4; 8; 90". Sólo el nombre es obligatorio.
 */
export function parseRoutineExercises(text: string): ParseResult<RoutineExercise[]> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const errors: string[] = [];
  if (lines.length === 0) errors.push("Escribe al menos un ejercicio.");
  if (lines.length > 40) errors.push("Una rutina admite hasta 40 ejercicios.");
  const exercises: RoutineExercise[] = [];
  lines.forEach((line, i) => {
    const [name, series, reps, rest] = line.split(";").map(p => p.trim());
    if (!name || name.length < 2 || name.length > 80) {
      errors.push(`Línea ${i + 1}: el nombre del ejercicio debe tener entre 2 y 80 letras.`);
      return;
    }
    const s = series ? Number(series) : null;
    if (s !== null && (!Number.isInteger(s) || s <= 0 || s > 20)) errors.push(`Línea ${i + 1}: las series deben ser un número entre 1 y 20.`);
    const d = rest ? Number(rest) : null;
    if (d !== null && (!Number.isInteger(d) || d < 0 || d > 900)) errors.push(`Línea ${i + 1}: el descanso va en segundos (0 a 900).`);
    exercises.push({ ejercicio: name, series: s, reps: reps || null, descanso_s: d });
  });
  return errors.length ? { ok: false, errors } : { ok: true, data: exercises };
}

export const DAY_KEYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

export interface GoalInput {
  goalType: GoalType;
  otherLabel: string | null;
  startsOn: string;
  targetDate: string;
  targetWeightKg: number | null;
}

export function parseGoalForm(raw: Record<string, unknown>): ParseResult<GoalInput> {
  const goalType = String(raw.goalType ?? "") as GoalType;
  if (!["perdida", "ganancia", "mantenimiento", "otra"].includes(goalType)) {
    return { ok: false, errors: ["Elige el tipo de meta."] };
  }
  const startsOn = String(raw.startsOn ?? "");
  const targetDate = String(raw.targetDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return { ok: false, errors: ["Las fechas no son válidas."] };
  }
  const weight = num(raw.targetWeightKg);
  const targetWeightKg = weight === null ? null : weight;
  if (targetWeightKg !== null && (Number.isNaN(targetWeightKg) || checkWeight(targetWeightKg) === "invalid")) {
    return { ok: false, errors: ["El peso objetivo debe ser mayor que cero y válido."] };
  }
  const otherLabel = typeof raw.otherLabel === "string" && raw.otherLabel.trim() ? raw.otherLabel.trim() : null;
  const errors = goalErrors({ goalType, startsOn, targetDate, targetWeightKg, otherLabel });
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { goalType, otherLabel: goalType === "otra" ? otherLabel : null, startsOn, targetDate, targetWeightKg } };
}
