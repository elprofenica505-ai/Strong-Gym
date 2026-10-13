import { dayOfWeek, fromGymTime, gymParts } from "@/lib/schedule";
import type { Coach, GymClass, SessionDetail, WeekRange } from "@/lib/types";
import { demoClasses, demoCoaches } from "./demo-content";

/**
 * ============================================================
 *  Grilla semanal de clases (modo demo)
 * ============================================================
 *  El gimnasio repite la misma grilla todas las semanas.
 *  Acá está definida como plantilla: día (0 = lunes) y horario
 *  local del gym. Las fechas reales se calculan según la semana
 *  que el usuario esté mirando, así la web nunca queda "vieja".
 *
 *  Cuando conectes Supabase, esta grilla se reemplaza por la
 *  tabla `sessions` (ver supabase/migrations/00003_sessions.sql).
 */

interface Slot {
  /** Hora local del gimnasio, formato "HH:MM". */
  time: string;
  /** Slug de la disciplina (ver demo-content.ts). */
  slug: string;
}

const WEEKLY_TEMPLATE: Record<number, Slot[]> = {
  // Lunes
  0: [
    { time: "06:00", slug: "funcional" },
    { time: "07:00", slug: "spinning" },
    { time: "08:30", slug: "stretching" },
    { time: "10:00", slug: "zumba" },
    { time: "17:00", slug: "funcional" },
    { time: "18:00", slug: "spinning" },
    { time: "19:00", slug: "cross-training" },
    { time: "20:00", slug: "boxeo" },
  ],
  // Martes
  1: [
    { time: "06:00", slug: "funcional" },
    { time: "07:00", slug: "hiit" },
    { time: "09:00", slug: "pilates" },
    { time: "12:30", slug: "spinning" },
    { time: "17:30", slug: "funcional" },
    { time: "18:30", slug: "boxeo" },
    { time: "19:30", slug: "cross-training" },
    { time: "20:30", slug: "stretching" },
  ],
  // Miércoles
  2: [
    { time: "06:00", slug: "cross-training" },
    { time: "07:00", slug: "spinning" },
    { time: "10:00", slug: "zumba" },
    { time: "12:30", slug: "hiit" },
    { time: "17:00", slug: "funcional" },
    { time: "18:00", slug: "pilates" },
    { time: "19:00", slug: "spinning" },
    { time: "20:00", slug: "boxeo" },
  ],
  // Jueves
  3: [
    { time: "06:00", slug: "funcional" },
    { time: "07:00", slug: "spinning" },
    { time: "10:30", slug: "stretching" },
    { time: "12:30", slug: "hiit" },
    { time: "17:30", slug: "funcional" },
    { time: "18:30", slug: "cross-training" },
    { time: "19:30", slug: "boxeo" },
    { time: "20:30", slug: "yoga" },
  ],
  // Viernes
  4: [
    { time: "06:00", slug: "funcional" },
    { time: "07:00", slug: "spinning" },
    { time: "08:30", slug: "yoga" },
    { time: "10:00", slug: "zumba" },
    { time: "17:00", slug: "funcional" },
    { time: "18:00", slug: "spinning" },
    { time: "19:00", slug: "cross-training" },
    { time: "20:00", slug: "boxeo" },
  ],
  // Sábado
  5: [
    { time: "08:00", slug: "funcional" },
    { time: "09:00", slug: "spinning" },
    { time: "10:00", slug: "cross-training" },
    { time: "11:00", slug: "stretching" },
    { time: "12:00", slug: "zumba" },
  ],
  // Domingo
  6: [
    { time: "09:30", slug: "yoga" },
    { time: "11:00", slug: "stretching" },
  ],
};

const ROOMS: Record<string, string> = {
  funcional: "Salón A",
  "cross-training": "Salón A",
  boxeo: "Ring",
  spinning: "Sala Cycling",
  hiit: "Salón B",
  zumba: "Salón B",
  pilates: "Salón Zen",
  yoga: "Salón Zen",
  stretching: "Salón Zen",
};

const classesBySlug = new Map<string, GymClass>(demoClasses.map((c) => [c.slug, c]));

function coachesFor(slug: string): Coach[] {
  return demoCoaches.filter((coach) => coach.specialties.includes(slug));
}

/** Hash determinista (FNV-1a) para que el servidor y el cliente coincidan. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Ocupación simulada de una clase. Es determinista (misma clase, mismo
 * número siempre) y más alta en los horarios pico.
 */
function simulatedBookedCount(sessionId: string, capacity: number, hour: number): number {
  const h = hash(sessionId);
  const roll = (h % 1000) / 1000;

  // Una de cada doce clases aparece completa, para probar ese estado.
  if (h % 12 === 0) return capacity;

  const peak = hour >= 17 && hour <= 21 ? 1 : hour <= 8 ? 0.82 : 0.55;
  const ratio = Math.min(0.97, Math.max(0.18, roll * peak + (peak - 0.55) * 0.3));
  return Math.min(capacity, Math.round(capacity * ratio));
}

/** Todas las clases de una semana, con su profe y su ocupación. */
export function generateWeekSessions(week: WeekRange): SessionDetail[] {
  const sessions: SessionDetail[] = [];
  let counter = 0;

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const date = dayOfWeek(week, dayIndex);
    const parts = gymParts(date);
    const slots = WEEKLY_TEMPLATE[dayIndex] ?? [];

    for (const slot of slots) {
      const gymClass = classesBySlug.get(slot.slug);
      if (!gymClass) continue;

      const [hour, minute] = slot.time.split(":").map(Number);
      const startsAt = fromGymTime(parts.year, parts.month, parts.day, hour, minute);
      const endsAt = new Date(startsAt.getTime() + gymClass.duration_min * 60_000);

      const candidates = coachesFor(slot.slug);
      const coach = candidates.length > 0 ? candidates[counter % candidates.length] : null;

      const id = `ses_${week.key}_${dayIndex}_${counter}`;
      const bookedCount = simulatedBookedCount(id, gymClass.capacity, hour);

      sessions.push({
        id,
        class_id: gymClass.id,
        coach_id: coach?.id ?? null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        capacity: gymClass.capacity,
        room: ROOMS[slot.slug] ?? "Salón principal",
        status: "scheduled",
        gymClass,
        coach,
        bookedCount,
        spotsLeft: Math.max(0, gymClass.capacity - bookedCount),
      });

      counter++;
    }
  }

  return sessions.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

/** Ocupación media del gimnasio (para el panel de administración). */
export function averageOccupancy(sessions: SessionDetail[]): number {
  if (sessions.length === 0) return 0;
  const total = sessions.reduce((acc, s) => acc + s.bookedCount / Math.max(1, s.capacity), 0);
  return Math.round((total / sessions.length) * 100);
}
