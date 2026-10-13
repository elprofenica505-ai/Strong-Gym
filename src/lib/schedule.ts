import { siteConfig } from "@/config/site";
import { intlLocale, type Locale } from "@/i18n/config";
import type { WeekRange } from "@/lib/types";

/**
 * ============================================================
 *  Manejo de fechas en la zona horaria del gimnasio
 * ============================================================
 *  Todo el sitio piensa los horarios en la hora local del gym
 *  (config/site.ts → utcOffsetMinutes). Convertimos con un
 *  desplazamiento fijo: Managua no tiene horario de verano, así que
 *  el cálculo es exacto y no necesita dependencias como date-fns-tz.
 *  (Si algún día el gimnasio abre en un país con DST, revisá esto.)
 */

const OFFSET_MS = siteConfig.utcOffsetMinutes * 60_000;
const DAY_MS = 86_400_000;

export interface GymDateParts {
  year: number;
  month: number; // 0-11
  day: number;
  hour: number;
  minute: number;
  /** 0 = domingo, 1 = lunes ... 6 = sábado */
  weekday: number;
}

/** Descompone un instante UTC en la hora local del gimnasio. */
export function gymParts(date: Date): GymDateParts {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Construye un instante UTC a partir de una fecha/hora local del gimnasio. */
export function fromGymTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(Date.UTC(year, month, day, hour, minute, 0, 0) - OFFSET_MS);
}

/** Momento actual, expresado como instante UTC real. */
export function gymNow(): Date {
  return new Date();
}

function isoWeekKey(parts: GymDateParts): string {
  const d = new Date(Date.UTC(parts.year, parts.month, parts.day));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);

  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Devuelve el rango lunes→domingo de la semana a la que pertenece `anchor`. */
export function getWeekRange(anchor?: Date | string | null): WeekRange {
  const base = anchor ? new Date(anchor) : gymNow();
  const parts = gymParts(Number.isNaN(base.getTime()) ? gymNow() : base);

  const sinceMonday = (parts.weekday + 6) % 7;
  const start = fromGymTime(parts.year, parts.month, parts.day - sinceMonday, 0, 0);

  return {
    start,
    end: new Date(start.getTime() + 7 * DAY_MS - 1000),
    key: isoWeekKey(parts),
  };
}

/** Suma (o resta) semanas a un rango ya calculado. */
export function shiftWeeks(week: WeekRange, amount: number): WeekRange {
  const start = new Date(week.start.getTime() + amount * 7 * DAY_MS);
  return getWeekRange(start);
}

/**
 * Convierte una clave "2026-W42" en su rango semanal.
 * Si la clave es inválida, devuelve la semana actual.
 */
export function weekRangeFromKey(key: string | null | undefined): WeekRange {
  if (!key) return getWeekRange();

  const match = /^(\d{4})-W(\d{1,2})$/.exec(key.trim());
  if (!match) return getWeekRange();

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return getWeekRange();

  // 4 de enero siempre cae en la semana 1 del ISO.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - jan4DayNum * DAY_MS);
  const monday = new Date(week1Monday.getTime() + (week - 1) * 7 * DAY_MS);

  const parts: GymDateParts = {
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth(),
    day: monday.getUTCDate(),
    hour: 0,
    minute: 0,
    weekday: monday.getUTCDay(),
  };

  return getWeekRange(fromGymTime(parts.year, parts.month, parts.day, 12, 0));
}

/** Devuelve la fecha del día `index` (0 = lunes) dentro de la semana. */
export function dayOfWeek(week: WeekRange, index: number): Date {
  return new Date(week.start.getTime() + index * DAY_MS);
}

/** Los 7 días de la semana, de lunes a domingo. */
export function weekDays(week: WeekRange): Date[] {
  return Array.from({ length: 7 }, (_, i) => dayOfWeek(week, i));
}

/** ¿La fecha cae en el mismo día (hora del gimnasio) que `reference`? */
export function isSameGymDay(a: Date, b: Date): boolean {
  const pa = gymParts(a);
  const pb = gymParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

export function isToday(date: Date): boolean {
  return isSameGymDay(date, gymNow());
}

/** Rango pedido: "YYYY-MM-DD" en hora del gimnasio → Date de ese día 00:00. */
export function dateFromISO(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  return fromGymTime(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0);
}

/** Date → "YYYY-MM-DD" en hora del gimnasio (para la URL y los inputs). */
export function toISODate(date: Date): string {
  const p = gymParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/* ------------------------------------------------------------
   Formato para mostrar
   ------------------------------------------------------------ */

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: Locale, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlLocale[locale], {
      timeZone: siteConfig.timezone,
      ...options,
    });
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

function timeFormatter(locale: Locale, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = timeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlLocale[locale], {
      timeZone: siteConfig.timezone,
      ...options,
    });
    timeFormatters.set(key, formatter);
  }
  return formatter;
}

/** "19:00" en ES, "7:00 PM" en EN. */
export function formatTime(date: Date, locale: Locale): string {
  return timeFormatter(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** "lun 13 oct" */
export function formatShortDate(date: Date, locale: Locale): string {
  return dateFormatter(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** "lunes 13 de octubre" */
export function formatLongDate(date: Date, locale: Locale): string {
  return dateFormatter(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/** "13 oct 2026" */
export function formatDateNumeric(date: Date, locale: Locale): string {
  return dateFormatter(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** "13/10/2026" */
export function formatDateShort(date: Date, locale: Locale): string {
  return dateFormatter(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** "octubre de 2026" — para el encabezado de la semana. */
export function formatMonthYear(date: Date, locale: Locale): string {
  return dateFormatter(locale, { month: "long", year: "numeric" }).format(date);
}

/** "13 oct – 19 oct 2026" — encabezado de la semana. */
export function formatWeekRange(week: WeekRange, locale: Locale): string {
  const from = dateFormatter(locale, { day: "numeric", month: "short" }).format(week.start);
  const to = dateFormatter(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(week.end);
  return `${from} – ${to}`;
}

/** Nombre del día solo: "lunes" / "Monday". */
export function weekdayName(date: Date, locale: Locale): string {
  return dateFormatter(locale, { weekday: "long" }).format(date);
}

/** Día y mes cortos: "13/10". */
export function dayMonth(date: Date, locale: Locale): string {
  return dateFormatter(locale, { day: "numeric", month: "numeric" }).format(date);
}

/** Letra del día para el selector semanal: L, M, M, J, V, S, D */
export function weekdayInitial(date: Date, locale: Locale): string {
  const short = dateFormatter(locale, { weekday: "short" }).format(date);
  return short.replace(".", "").charAt(0).toUpperCase();
}

export function weekdayShort(date: Date, locale: Locale): string {
  return dateFormatter(locale, { weekday: "short" }).format(date).replace(".", "");
}

/** Duración legible a partir de minutos: "1 h 15 min" / "45 min". */
export function formatDuration(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hourLabel = locale === "es" ? "h" : "h";
  const minLabel = locale === "es" ? "min" : "min";
  if (h === 0) return `${m} ${minLabel}`;
  if (m === 0) return `${h} ${hourLabel}`;
  return `${h} ${hourLabel} ${m} ${minLabel}`;
}
