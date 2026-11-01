/**
 * Cambio de día en las pantallas abiertas (OP-07).
 *
 * Problema: Horarios, el Panel y Mi cuenta calculan «hoy» al montar. Si el
 * gimnasio deja la tablet abierta y pasa la medianoche, la pantalla sigue
 * mostrando el día anterior hasta que alguien recarga a mano.
 *
 * Cómo se resuelve: este módulo sabe **cuándo** cambia el día en Managua. El
 * componente que lo usa pide un refresco suave (`router.refresh()`) justo
 * cuando cambia, y también cuando la pestaña vuelve a primer plano después de
 * dormir. Un refresco suave vuelve a leer los datos del servidor **sin**
 * perder lo que la persona estaba escribiendo.
 *
 * Lo que no hace: no toca la zona del aparato. Managua es UTC−6 todo el año
 * (Nicaragua no cambia de hora), así que la medianoche local es siempre las
 * 06:00 UTC.
 */

export const MANAGUA_TZ = "America/Managua";

/** Diferencia fija de Managua con UTC, en horas. Nicaragua no aplica horario de verano. */
export const MANAGUA_OFFSET_HOURS = -6;

/**
 * Hasta cuánto se duerme de una sola vez. Sirve para despertar aunque el
 * aparato haya estado suspendido o el reloj se haya movido: al despertar se
 * vuelve a comprobar la fecha.
 */
export const MAX_TIMER_MS = 15 * 60 * 1000;

/** Fecha de hoy en Managua como `YYYY-MM-DD`. */
export function managuaDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANAGUA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Partes de la fecha de Managua: año, mes (1–12) y día. */
export function managuaDateParts(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = managuaDayKey(now).split("-").map(Number);
  return { year, month, day };
}

/**
 * Momento exacto en que empieza el día siguiente en Managua.
 * Se arma en UTC: medianoche local = 06:00 UTC del mismo día siguiente.
 */
export function nextManaguaMidnight(now: Date = new Date()): Date {
  const { year, month, day } = managuaDateParts(now);
  return new Date(Date.UTC(year, month - 1, day + 1, -MANAGUA_OFFSET_HOURS, 0, 0, 0));
}

/**
 * Cuántos milisegundos faltan para el próximo cambio de día, con tope.
 * Nunca devuelve menos de un segundo: un temporizador en cero se dispararía en
 * bucle.
 */
export function msUntilNextDayChange(now: Date = new Date(), capMs = MAX_TIMER_MS): number {
  const remaining = nextManaguaMidnight(now).getTime() - now.getTime();
  const capped = Math.min(remaining, Math.max(capMs, 1000));
  return Math.max(capped, 1000);
}

/** Verdadero si `now` ya cayó en otro día de Managua que `previousKey`. */
export function dayChanged(previousKey: string, now: Date = new Date()): boolean {
  if (!previousKey) return false;
  return managuaDayKey(now) !== previousKey;
}
