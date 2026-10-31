import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkedRead, DataReadError } from "@/lib/data/read-result";

/**
 * Lectura de la biblioteca de ejercicios (EX-01).
 *
 * Todo pasa por funciones de la base (`exercise_catalog`, `exercise_facets`,
 * `exercise_detail`, `client_routine_list`): el navegador nunca arma SQL ni
 * decide qué ejercicios existen. Si una lectura falla se lanza `DataReadError`
 * con su código —nunca una lista vacía—, porque «no hay ejercicios» y «no se
 * pudo leer» no son lo mismo y la pantalla los muestra distinto.
 */

export interface ExerciseCard {
  id: string;
  nameEs: string;
  nameEn: string;
  category: string;
  difficulty: string;
  bodyPart: string;
  equipment: string | null;
  primaryMuscles: string[];
  isBodyweight: boolean;
  met: number | null;
  imageStart: string | null;
  imagePeak: string | null;
  imageMain: string | null;
}

export interface ExercisePage {
  total: number;
  limit: number;
  offset: number;
  rows: ExerciseCard[];
}

export interface ExerciseDetail extends ExerciseCard {
  descriptionEs: string | null;
  descriptionEn: string | null;
  instructionsEs: string[];
  instructionsEn: string[];
  tipsEs: string[];
  tipsEn: string[];
  forceType: string | null;
  mechanic: string | null;
  secondaryMuscles: string[];
  goals: string[];
  tags: string[];
  isUnilateral: boolean;
  saved: { sets: number | null; reps: string | null; restSeconds: number | null; note: string | null } | null;
}

export interface ExerciseFacets {
  total: number;
  bodyParts: Record<string, number>;
  equipment: Record<string, number>;
  difficulty: Record<string, number>;
  category: Record<string, number>;
}

export interface RoutineItem {
  exerciseId: string;
  position: number;
  sets: number | null;
  reps: string | null;
  restSeconds: number | null;
  note: string | null;
  nameEs: string;
  bodyPart: string;
  equipment: string | null;
  difficulty: string;
  imageStart: string | null;
  imagePeak: string | null;
  imageMain: string | null;
}

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;
const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const card = (value: Record<string, unknown>): ExerciseCard => ({
  id: text(value.id),
  nameEs: text(value.nameEs),
  nameEn: text(value.nameEn),
  category: text(value.category, "strength"),
  difficulty: text(value.difficulty, "beginner"),
  bodyPart: text(value.bodyPart, "full_body"),
  equipment: textOrNull(value.equipment),
  primaryMuscles: stringArray(value.primaryMuscles),
  isBodyweight: value.isBodyweight === true,
  met: numberOrNull(value.met),
  imageStart: textOrNull(value.imageStart),
  imagePeak: textOrNull(value.imagePeak),
  imageMain: textOrNull(value.imageMain),
});

/** Una lectura con su código propio: la pantalla puede decir qué falló. */
async function rpc(operation: string, name: string, args?: Record<string, unknown>) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new DataReadError(operation, "DEMO");
  return checkedRead(operation, async () => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new DataReadError(operation, error.code);
    return data;
  });
}

export interface CatalogQuery {
  search?: string;
  bodyPart?: string;
  equipment?: string[] | null;
  difficulty?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export async function getExerciseCatalog(query: CatalogQuery): Promise<ExercisePage> {
  const data = await rpc("EXERCISES_CATALOG", "exercise_catalog", {
    p_search: query.search ?? "",
    p_body_part: query.bodyPart ?? "",
    // `null` = sin filtro; arreglo vacío = «Peso corporal» (sin equipo).
    p_equipment: query.equipment ?? null,
    p_difficulty: query.difficulty ?? "",
    p_category: query.category ?? "",
    p_limit: query.limit ?? 24,
    p_offset: query.offset ?? 0,
  });
  const value = record(data) ?? {};
  const rows = Array.isArray(value.rows) ? value.rows : [];
  return {
    total: numberOrNull(value.total) ?? 0,
    limit: numberOrNull(value.limit) ?? 24,
    offset: numberOrNull(value.offset) ?? 0,
    rows: rows
      .map(record)
      .filter((row): row is Record<string, unknown> => row !== null)
      .map(card),
  };
}

export async function getExerciseFacets(): Promise<ExerciseFacets> {
  const data = await rpc("EXERCISES_FACETS", "exercise_facets");
  const value = record(data) ?? {};
  const counts = (input: unknown): Record<string, number> => {
    const source = record(input);
    if (!source) return {};
    const entries = Object.entries(source)
      .map(([key, count]) => [key, numberOrNull(count) ?? 0] as const)
      .filter(([, count]) => count > 0);
    return Object.fromEntries(entries);
  };
  return {
    total: numberOrNull(value.total) ?? 0,
    bodyParts: counts(value.bodyParts),
    equipment: counts(value.equipment),
    difficulty: counts(value.difficulty),
    category: counts(value.category),
  };
}

export async function getExerciseDetail(id: string): Promise<ExerciseDetail | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new DataReadError("EXERCISE_DETAIL", "DEMO");
  const { data, error } = await supabase.rpc("exercise_detail", { p_id: id });
  if (error) {
    // Un id que no existe no es un fallo de lectura: la página dice «no está».
    if ((error.message ?? "").toUpperCase().includes("NOT_FOUND")) return null;
    throw new DataReadError("EXERCISE_DETAIL", error.code);
  }
  const value = record(data);
  if (!value) return null;
  const saved = record(value.saved);
  return {
    ...card(value),
    descriptionEs: textOrNull(value.descriptionEs),
    descriptionEn: textOrNull(value.descriptionEn),
    instructionsEs: stringArray(value.instructionsEs),
    instructionsEn: stringArray(value.instructionsEn),
    tipsEs: stringArray(value.tipsEs),
    tipsEn: stringArray(value.tipsEn),
    forceType: textOrNull(value.forceType),
    mechanic: textOrNull(value.mechanic),
    secondaryMuscles: stringArray(value.secondaryMuscles),
    goals: stringArray(value.goals),
    tags: stringArray(value.tags),
    isUnilateral: value.isUnilateral === true,
    saved: saved
      ? {
          sets: numberOrNull(saved.sets),
          reps: textOrNull(saved.reps),
          restSeconds: numberOrNull(saved.restSeconds),
          note: textOrNull(saved.note),
        }
      : null,
  };
}

export interface MyRoutine {
  items: RoutineItem[];
  /** `false` cuando quien mira no tiene ficha de cliente (por ejemplo, personal). */
  canSave: boolean;
}

export async function getMyRoutine(): Promise<MyRoutine> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new DataReadError("EXERCISE_ROUTINE", "DEMO");
  const { data, error } = await supabase.rpc("client_routine_list");
  // Sin ficha de cliente no hay rutina: es un caso real, no un error.
  if (error && (error.message ?? "").toUpperCase().includes("NO_CLIENT"))
    return { items: [], canSave: false };
  if (error) throw new DataReadError("EXERCISE_ROUTINE", error.code);
  const rows = Array.isArray(data) ? data : [];
  const items = rows
    .map(record)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      exerciseId: text(row.exerciseId),
      position: numberOrNull(row.position) ?? 0,
      sets: numberOrNull(row.sets),
      reps: textOrNull(row.reps),
      restSeconds: numberOrNull(row.restSeconds),
      note: textOrNull(row.note),
      nameEs: text(row.nameEs),
      bodyPart: text(row.bodyPart, "full_body"),
      equipment: textOrNull(row.equipment),
      difficulty: text(row.difficulty, "beginner"),
      imageStart: textOrNull(row.imageStart),
      imagePeak: textOrNull(row.imagePeak),
      imageMain: textOrNull(row.imageMain),
    }));
  return { items, canSave: true };
}

/** Guarda un ejercicio en «Mi rutina». Devuelve el código de la base si falla. */
export async function saveRoutineItem(input: {
  exerciseId: string;
  sets?: number | null;
  reps?: string | null;
  restSeconds?: number | null;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { ok: false, code: "DEMO" };
  const { error } = await supabase.rpc("client_routine_save", {
    p_exercise: input.exerciseId,
    p_sets: input.sets ?? null,
    p_reps: input.reps ?? null,
    p_rest: input.restSeconds ?? null,
    p_note: input.note ?? null,
  });
  if (error) return { ok: false, code: (error.message ?? "UNKNOWN").toUpperCase() };
  return { ok: true };
}

export async function removeRoutineItem(exerciseId: string): Promise<{ ok: boolean; code?: string }> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { ok: false, code: "DEMO" };
  const { error } = await supabase.rpc("client_routine_remove", { p_exercise: exerciseId });
  if (error) return { ok: false, code: (error.message ?? "UNKNOWN").toUpperCase() };
  return { ok: true };
}

/** Importación del catálogo: sólo administración, con el JSON ya descargado. */
export async function importExercises(
  payload: unknown,
): Promise<{ ok: true; imported: number; total: number } | { ok: false; code: string }> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { ok: false, code: "DEMO" };
  const { data, error } = await supabase.rpc("admin_import_exercises", { p_payload: payload });
  if (error) return { ok: false, code: (error.message ?? "UNKNOWN").toUpperCase() };
  const value = record(data) ?? {};
  return {
    ok: true,
    imported: numberOrNull(value.imported) ?? 0,
    total: numberOrNull(value.total) ?? 0,
  };
}
