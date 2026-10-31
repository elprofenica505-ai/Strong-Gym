/**
 * Tipos y cálculos del calendario que usan **el servidor y el navegador**.
 *
 * Vive fuera de los componentes a propósito: la página de horarios arma su
 * estado inicial en el servidor y React no permite ejecutar funciones sueltas
 * exportadas desde un archivo marcado `"use client"`. Poner acá lo compartido
 * evita ese error y deja los componentes solo con lo suyo.
 */

/** Fila de `sessions` tal como la devuelve `admin_schedule_sessions()`. */
export type ScheduleSession = {
  id: string;
  class_id: string;
  class_name: string;
  class_color: string;
  class_active: boolean;
  coach_id: string | null;
  coach_name: string | null;
  room: string;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  capacity: number;
  booked: number;
  status: "scheduled" | "cancelled";
  origin: "grid" | "manual";
  note: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  is_past: boolean;
};

export type SessionsBoard = {
  from: string;
  to: string;
  today: string;
  sessions: ScheduleSession[];
};

/** Período con el que arranca el paso de sesiones: hoy y las próximas cuatro semanas. */
export function sessionsBoardFrom(today: string): SessionsBoard {
  const [year, month, day] = today.split("-").map(Number);
  const to = new Date(Date.UTC(year, month - 1, day + 27))
    .toISOString()
    .slice(0, 10);
  return { from: today, to, today, sessions: [] };
}
