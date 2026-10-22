// Fecha de nacimiento y mayoría de edad (18 años, Nicaragua).
// La fecha "hoy" se toma en America/Managua, igual que la función SQL client_age_status (00047).

export const MIN_AGE_YEARS = 18;
const TZ = "America/Managua";
const EARLIEST = "1920-01-01";

/** Fecha de hoy en Managua como YYYY-MM-DD. */
export function todayInManagua(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Verdadero si es una fecha real YYYY-MM-DD, no futura y posterior a 1920. */
export function validBirthDate(value: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  return value >= EARLIEST && value <= todayInManagua(now);
}
