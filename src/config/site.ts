/**
 * ============================================================
 *  DATOS DEL GIMNASIO — editá este archivo para personalizar
 * ============================================================
 *  Todos los datos "de negocio" están acá: nombre, dirección,
 *  teléfono, redes, horarios y moneda. Cambiá lo que necesites
 *  y el sitio entero se actualiza.
 */

export const siteConfig = {
  name: "Strong Gym",
  shortName: "Strong",
  legalName: "Strong Gym S.A.",
  domain: "stronggym.com",

  /** Email que recibe las consultas del formulario de contacto. */
  contactEmail: "hola@stronggym.com",

  phone: "+505 8888 1234",
  /** Sólo dígitos, con código de país. Se usa para el link de WhatsApp. */
  whatsapp: "50588881234",

  address: {
    street: "Colonia Centroamérica, Rotonda 2 c. al sur",
    city: "Managua",
    region: "Managua",
    country: "Nicaragua",
    postalCode: "12046",
  },

  /** Coordenadas para el mapa. Buscá las tuyas en Google Maps. */
  geo: { lat: 12.1364, lng: -86.2514 },

  /**
   * Zona horaria del gimnasio. Se usa para calcular "hoy" y para
   * mostrar los horarios de las clases.
   */
  timezone: "America/Managua",
  /** Diferencia con UTC en minutos (Managua = UTC-6). Sin DST. */
  utcOffsetMinutes: -360,

  /** Moneda de los planes. */
  currency: { code: "USD", symbol: "$", decimals: 0 },

  social: {
    instagram: "https://instagram.com/stronggym",
    facebook: "https://facebook.com/stronggym",
    tiktok: "https://tiktok.com/@stronggym",
    youtube: "https://youtube.com/@stronggym",
  },

  /** Horario de atención (se muestra en Contacto y en el footer). */
  openingHours: {
    weekday: { opens: "05:30", closes: "22:00" },
    saturday: { opens: "07:00", closes: "18:00" },
    sunday: { opens: "09:00", closes: "13:00" },
  },

  /** Cuántas horas antes de una clase se puede cancelar sin penalidad. */
  cancellationWindowHours: 3,

  /** La primera clase es gratis para nuevos socios. */
  freeTrialClass: true,
} as const;

export type SiteConfig = typeof siteConfig;

/** URL pública del sitio (localhost en desarrollo, el dominio en producción). */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${siteConfig.whatsapp}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function mapsLink(): string {
  const { lat, lng } = siteConfig.geo;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function mapsEmbedUrl(): string {
  const { lat, lng } = siteConfig.geo;
  return `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
}

/** Formatea un precio según la moneda configurada. */
export function formatPrice(value: number): string {
  const { symbol, decimals } = siteConfig.currency;
  const formatted = value.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${formatted}`;
}
