/**
 * Asistencia por cliente: funciones puras para armar las tablas.
 * Un mes o una semana sin visitas se muestra como 0 (es un dato), no se omite.
 * Las fechas son AAAA-MM-DD en America/Managua (las calcula la base).
 */

export interface AttendanceWeek { weekStart: string; visits: number }
export interface AttendanceMonth { month: string; visits: number }

export interface AttendanceData {
  clientId: string;
  today: string;
  totalVisits: number;
  lastVisit: string | null;
  visits30Days: number;
  days: string[];
  weeks: AttendanceWeek[];
  months: AttendanceMonth[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Suma días a una fecha AAAA-MM-DD usando UTC (sin depender de la zona del servidor). */
export function addDays(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d + days);
  const x = new Date(t);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

/** Lunes de la semana de una fecha. */
export function mondayOf(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(isoDay, dow === 0 ? -6 : 1 - dow);
}

/** Últimas `count` semanas (lunes), de la más reciente a la más antigua, con 0 donde no hubo visitas. */
export function fillWeeks(weeks: AttendanceWeek[], today: string, count = 12): AttendanceWeek[] {
  const map = new Map(weeks.map(w => [w.weekStart, w.visits]));
  const start = mondayOf(today);
  const out: AttendanceWeek[] = [];
  for (let i = 0; i < count; i++) {
    const ws = addDays(start, -7 * i);
    out.push({ weekStart: ws, visits: map.get(ws) ?? 0 });
  }
  return out;
}

/** Últimos `count` meses (AAAA-MM), del más reciente al más antiguo, con 0 donde no hubo visitas. */
export function fillMonths(months: AttendanceMonth[], today: string, count = 12): AttendanceMonth[] {
  const map = new Map(months.map(m => [m.month, m.visits]));
  const [y, m] = today.split("-").map(Number);
  const out: AttendanceMonth[] = [];
  for (let i = 0; i < count; i++) {
    const idx = y * 12 + (m - 1) - i;
    const key = `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
    out.push({ month: key, visits: map.get(key) ?? 0 });
  }
  return out;
}

/** Texto legible de una semana: "del 13/10 al 19/10". */
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const f = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return `del ${f(weekStart)} al ${f(end)}`;
}

const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Texto legible de un mes: "octubre 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_ES[m - 1]} ${y}`;
}
