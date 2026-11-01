/**
 * Segundo catálogo de ejercicios (EX-01).
 *
 * Por qué existe: RepDB tiene 61 máquinas, 31 poleas y 88 ejercicios de
 * mancuerna, y el dueño pidió más sala —barra, banco, mancuernas— y menos
 * «ejercicios que se hacen en casa».
 *
 * Origen: `yuhonas/free-exercise-db`, **dominio público (Unlicense)**: a
 * diferencia de RepDB, sus datos se pueden usar sin atribución obligatoria y
 * sus fotos se pueden servir igual. Igual se acredita en la pantalla, porque es
 * lo correcto y porque el socio merece saber de dónde sale.
 *
 * Cómo entra:
 *   1. Se descarga el JSON del origen (la ruta de administración, nunca el
 *      navegador).
 *   2. Se queda **sólo** lo que tiene traducción en `second-catalog-data.ts`:
 *      esa lista es la curaduría. Lo que no está, no entra; así no se cuela un
 *      ejercicio en inglés ni uno que ya existe en RepDB.
 *   3. Se traduce y se mapea al mismo formato que el catálogo actual, para que
 *      la biblioteca, «Mi rutina» y el cronómetro funcionen igual.
 *
 * Funciones puras: se prueban sin red ni base.
 */
import {
  bodyPartLabel,
  categoryLabel,
  difficultyLabel,
  equipmentLabel,
  goalLabel,
  muscleLabel,
} from "./terms.ts";
import type { ImportRow } from "./import.ts";
import { SECOND_CATALOG_ES, translationFor } from "./second-catalog-data.ts";

/** Lo que escribe una persona: nombre, pasos y consejos en español. */
export interface SecondTranslation {
  name: string;
  steps: string[];
  tip?: string;
  /** Slug de equipo de nuestro catálogo, si hay que corregir el del origen. */
  equipment?: string;
  /** Zona del cuerpo, si el músculo principal no alcanza para deducirla. */
  bodyPart?: string;
}

type TranslationMap = Record<string, SecondTranslation>;

/** Músculos del origen (gruesos) a los nuestros (finos). */
const MUSCLES: Record<string, string> = {
  abdominals: "rectus_abdominis",
  biceps: "biceps_brachii",
  triceps: "triceps_brachii",
  chest: "pectoralis_major",
  lats: "latissimus_dorsi",
  "middle back": "rhomboids",
  "lower back": "erector_spinae",
  traps: "trapezius",
  neck: "trapezius",
  shoulders: "anterior_deltoid",
  forearms: "forearms",
  quadriceps: "quadriceps",
  hamstrings: "hamstrings",
  glutes: "gluteus_maximus",
  calves: "gastrocnemius",
  abductors: "abductors",
  adductors: "adductors",
};

/** Zona del cuerpo a partir del músculo principal. */
const BODY_PART: Record<string, string> = {
  rectus_abdominis: "core",
  biceps_brachii: "upper_arms",
  triceps_brachii: "upper_arms",
  forearms: "lower_arms",
  pectoralis_major: "chest",
  latissimus_dorsi: "back",
  rhomboids: "back",
  erector_spinae: "back",
  trapezius: "back",
  anterior_deltoid: "shoulders",
  quadriceps: "upper_legs",
  hamstrings: "upper_legs",
  gluteus_maximus: "upper_legs",
  abductors: "upper_legs",
  adductors: "upper_legs",
  gastrocnemius: "lower_legs",
};

/** Categorías del origen que no son las nuestras. */
const CATEGORIES: Record<string, string> = {
  strength: "strength",
  stretching: "stretching",
  cardio: "cardio",
  plyometrics: "plyometrics",
  powerlifting: "strength",
  strongman: "strength",
  "olympic weightlifting": "olympic",
};

const LEVELS: Record<string, string> = {
  beginner: "beginner",
  intermediate: "intermediate",
  expert: "advanced",
  advanced: "advanced",
};

/** Equipo del origen → slug nuestro. `null` es peso corporal. */
function equipmentSlug(origin: unknown, name: string): string | null {
  const raw = typeof origin === "string" ? origin.trim().toLowerCase() : "";
  if (name.toLowerCase().includes("smith")) return "smith_machine";
  switch (raw) {
    case "barbell":
      return "barbell";
    case "dumbbell":
      return "dumbbell";
    case "e-z curl bar":
      return "ez_bar";
    case "kettlebells":
      return "kettlebell";
    case "cable":
      return "cable";
    case "machine":
      return "machine";
    case "body only":
    case "foam roll":
      return null;
    default:
      return null;
  }
}

const str = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Foto del origen: `Carpeta/0.jpg` o `Carpeta/1.jpg`, nada más. */
const photo = (value: unknown): string | null => {
  const path = str(value);
  return /^[A-Za-z0-9][A-Za-z0-9 _().,'&-]{0,90}\/[01]\.jpg$/.test(path) ? path : null;
};

export interface SecondResult {
  rows: ImportRow[];
  /** Cuántos quedaron afuera por no tener traducción (curaduría). */
  skipped: number;
}

/**
 * Convierte el JSON del segundo catálogo en filas de nuestra base.
 * Sólo pasan los `id` que tienen traducción escrita a mano.
 */
export function toSecondCatalogRows(
  dataset: unknown,
  translations: TranslationMap = SECOND_CATALOG_ES,
): SecondResult {
  const items = Array.isArray(dataset) ? dataset : [];
  const rows: ImportRow[] = [];
  let skipped = 0;

  for (const item of items) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      skipped += 1;
      continue;
    }
    const raw = item as Record<string, unknown>;
    const id = str(raw.id);
    // La curaduría está por `id` normalizado: un guion perdido no deja afuera
    // un ejercicio sin que nadie se entere.
    const translation = id
      ? (translations[id.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? translationFor(id))
      : undefined;
    if (!id || !translation) {
      skipped += 1;
      continue;
    }

    const nameEn = str(raw.name) || id;
    const primary = list(raw.primaryMuscles).map((muscle) => MUSCLES[muscle] ?? muscle);
    const secondary = list(raw.secondaryMuscles)
      .map((muscle) => MUSCLES[muscle] ?? muscle)
      .filter((muscle) => !primary.includes(muscle));
    const equipment = translation.equipment ?? equipmentSlug(raw.equipment, nameEn);
    const bodyPart =
      translation.bodyPart ?? BODY_PART[primary[0] ?? ""] ?? "full_body";
    const category = CATEGORIES[str(raw.category).toLowerCase()] ?? "strength";
    const difficulty = LEVELS[str(raw.level).toLowerCase()] ?? "intermediate";
    const photos = list(raw.images).map(photo).filter((path): path is string => path !== null);

    const steps = translation.steps.map((step) => step.trim()).filter(Boolean);
    const tips = translation.tip ? [translation.tip.trim()] : [];
    const searchExtra = [
      bodyPartLabel(bodyPart),
      equipmentLabel(equipment),
      ...primary.map(muscleLabel),
      ...secondary.map(muscleLabel),
      goalLabel("strength"),
      categoryLabel(category),
      difficultyLabel(difficulty),
    ]
      .filter(Boolean)
      .join(" ");

    rows.push({
      id: `fd-${id}`.slice(0, 80),
      name_es: translation.name.slice(0, 160),
      name_en: nameEn.slice(0, 160),
      description_es: steps[0] ?? null,
      description_en: list(raw.instructions)[0] ?? null,
      instructions_es: steps,
      instructions_en: list(raw.instructions),
      tips_es: tips,
      tips_en: [],
      category,
      force_type: str(raw.force) || null,
      mechanic: str(raw.mechanic) || null,
      difficulty,
      body_part: bodyPart,
      equipment,
      primary_muscles: primary,
      secondary_muscles: secondary,
      goals: ["strength"],
      tags: [],
      met: null,
      is_unilateral: /single|one[- ]arm|one[- ]leg|alternat/i.test(nameEn),
      is_bodyweight: equipment === null,
      image_start: photos[0] ?? null,
      image_peak: photos[1] ?? photos[0] ?? null,
      image_main: null,
      search_extra: searchExtra,
      source: "free-exercise-db",
    });
  }

  return { rows, skipped };
}
