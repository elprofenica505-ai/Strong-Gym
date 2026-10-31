/**
 * Traducción del JSON de origen a filas de la base (EX-01).
 *
 * Por qué existe: el dataset habla en inglés técnico (`gluteus_maximus`,
 * `upper_legs`, `leg_press`) y el socio busca «glúteo» o «pierna». Acá se arma,
 * con el **mismo** mapa de etiquetas que usa la pantalla, el texto extra que la
 * base indexa junto al nombre. Así «glúteo» encuentra la prensa y no hay que
 * mantener la traducción en dos lugares.
 *
 * También aplana las imágenes (`images.flat.start/peak/main` → tres columnas) y
 * tira lo que no sirve, en vez de romper toda la carga por un registro raro.
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

export interface ImportRow {
  id: string;
  name_es: string;
  name_en: string;
  description_es: string | null;
  description_en: string | null;
  instructions_es: string[];
  instructions_en: string[];
  tips_es: string[];
  tips_en: string[];
  category: string;
  force_type: string | null;
  mechanic: string | null;
  difficulty: string;
  body_part: string;
  equipment: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  goals: string[];
  tags: string[];
  met: number | null;
  is_unilateral: boolean;
  is_bodyweight: boolean;
  image_start: string | null;
  image_peak: string | null;
  image_main: string | null;
  search_extra: string;
  source: string;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item !== "") : [];

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Sólo rutas de imagen del dataset: nada de URLs ni de otros directorios. */
const imagePath = (value: unknown): string | null => {
  const path = str(value);
  return path && /^images\/flat\/[a-z0-9][a-z0-9-]{0,60}\.webp$/.test(path) ? path : null;
};

/**
 * Texto de búsqueda en español: zona, equipo, músculos, objetivo, nivel y
 * categoría, tal como se ven en pantalla. Es lo que permite buscar «glúteo»,
 * «pierna», «máquina» o «principiante».
 */
function searchExtra(row: {
  bodyPart: string;
  equipment: string | null;
  primary: string[];
  secondary: string[];
  goals: string[];
  category: string;
  difficulty: string;
}) {
  return [
    bodyPartLabel(row.bodyPart),
    equipmentLabel(row.equipment),
    ...row.primary.map(muscleLabel),
    ...row.secondary.map(muscleLabel),
    ...row.goals.map(goalLabel),
    categoryLabel(row.category),
    difficultyLabel(row.difficulty),
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ImportResult {
  rows: ImportRow[];
  skipped: number;
}

/** Convierte el JSON completo ({exercises:[…]}) o un arreglo suelto. */
export function toImportRows(dataset: unknown): ImportResult {
  const source = Array.isArray(dataset) ? dataset : record(dataset).exercises;
  const items = Array.isArray(source) ? source : [];
  const rows: ImportRow[] = [];
  let skipped = 0;

  for (const item of items) {
    const raw = record(item);
    const id = str(raw.id);
    const nameEs = str(raw.name_es) ?? str(raw.name_en);
    const nameEn = str(raw.name_en) ?? nameEs;
    if (!id || !nameEs || !nameEn || id.length > 80) {
      skipped += 1;
      continue;
    }
    const images = record(record(raw.images).flat);
    const primary = list(raw.primary_muscles);
    const secondary = list(raw.secondary_muscles);
    const goals = list(raw.goals);
    const category = str(raw.category) ?? "strength";
    const difficulty = str(raw.difficulty) ?? "beginner";
    const bodyPart = str(raw.body_part) ?? "full_body";
    const equipment = str(raw.equipment);

    rows.push({
      id,
      name_es: nameEs.slice(0, 160),
      name_en: nameEn.slice(0, 160),
      description_es: str(raw.description_es),
      description_en: str(raw.description_en),
      instructions_es: list(raw.instructions_es),
      instructions_en: list(raw.instructions_en),
      tips_es: list(raw.tips_es),
      tips_en: list(raw.tips_en),
      category,
      force_type: str(raw.force_type),
      mechanic: str(raw.mechanic),
      difficulty,
      body_part: bodyPart,
      equipment,
      primary_muscles: primary,
      secondary_muscles: secondary,
      goals,
      tags: list(raw.tags),
      met: num(raw.met),
      is_unilateral: raw.is_unilateral === true,
      is_bodyweight: raw.is_bodyweight === true,
      image_start: imagePath(images.start),
      image_peak: imagePath(images.peak),
      image_main: imagePath(images.main),
      search_extra: searchExtra({
        bodyPart,
        equipment,
        primary,
        secondary,
        goals,
        category,
        difficulty,
      }),
      source: str(raw.source) ?? "repdb",
    });
  }

  return { rows, skipped };
}
