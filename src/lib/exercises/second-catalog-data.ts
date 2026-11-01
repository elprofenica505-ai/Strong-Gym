import type { SecondTranslation } from "./second-catalog.ts";
import { BARBELL_ES } from "./catalog-barbell.ts";
import { CABLE_ES, DUMBBELL_ES, KETTLEBELL_ES, MACHINE_ES } from "./catalog-equipment.ts";

/**
 * Todo el contenido en español del segundo catálogo, en un solo lugar.
 *
 * Las claves son el `id` del origen (`Barbell_Squat`, `Cable_Crossover`…), pero
 * se comparan **normalizadas** (sin guiones, guiones bajos ni mayúsculas): así
 * un `-` que se pierde al copiar no deja un ejercicio afuera en silencio.
 */
const normalize = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, "");

const GROUPS: Record<string, SecondTranslation>[] = [
  BARBELL_ES,
  DUMBBELL_ES,
  MACHINE_ES,
  CABLE_ES,
  KETTLEBELL_ES,
];

export const SECOND_CATALOG_ES: Record<string, SecondTranslation> = (() => {
  const merged: Record<string, SecondTranslation> = {};
  for (const group of GROUPS) {
    for (const [id, translation] of Object.entries(group)) {
      const key = normalize(id);
      if (merged[key]) {
        throw new Error(`EXERCISE_TRANSLATION_DUPLICATED:${id}`);
      }
      merged[key] = translation;
    }
  }
  return merged;
})();

/** Traducción de un ejercicio del origen, o `undefined` si no está curado. */
export function translationFor(id: string): SecondTranslation | undefined {
  return SECOND_CATALOG_ES[normalize(id)];
}

export const SECOND_CATALOG_SIZE = Object.keys(SECOND_CATALOG_ES).length;
