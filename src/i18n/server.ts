import { notFound } from "next/navigation";
import { isLocale, locales, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./dictionaries";

export type { Locale };
export { locales, isLocale, getDictionary };
export type { Dictionary };

/**
 * Valida el segmento `[locale]` de la ruta. Si no es un idioma soportado,
 * corta con un 404 en lugar de renderizar contenido roto.
 */
export function resolveLocale(value: string): Locale {
  if (!isLocale(value)) notFound();
  return value;
}

/** Reemplaza placeholders tipo {name} dentro de un string traducido. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
