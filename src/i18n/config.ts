export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

export const localeLabels: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

/** Etiqueta corta para el selector de idioma. */
export const localeShort: Record<Locale, string> = {
  es: "ES",
  en: "EN",
};

/** Cookie donde guardamos el idioma elegido por el usuario. */
export const LOCALE_COOKIE = "strong-gym-locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/**
 * Detecta el idioma preferido a partir del header Accept-Language.
 * Devuelve el idioma por defecto si no hay coincidencias.
 */
export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;

  const parsed = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const entry of parsed) {
    const base = entry.tag.split("-")[0];
    if (isLocale(base)) return base;
  }

  return defaultLocale;
}

/** Fechas y números en el formato correcto para cada idioma. */
export const intlLocale: Record<Locale, string> = {
  es: "es-NI",
  en: "en-US",
};
