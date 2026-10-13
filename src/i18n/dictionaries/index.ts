import es from "./es";
import en from "./en";
import type { Locale } from "../config";

export type Dictionary = typeof es;

export const dictionaries: Record<Locale, Dictionary> = { es, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.es;
}

export { es, en };
