/**
 * Vista de la rutina activa en el módulo de progreso.
 * La rutina se guarda con una sola etiqueta por ejercicio, con este formato:
 *   "Fuerza 1 · Piernas y glúteos: Sentadilla goblet"
 * Aquí se separa en día, enfoque y ejercicio, y se agrupa por día para mostrar tablas.
 * Sólo lectura: no cambia lo que se guarda en la base.
 */

export type RoutineExerciseRow = {
  ejercicio: string;
  series: number | null;
  reps: string | null;
  descanso_s: number | null;
};

export type RoutineItem = {
  name: string;
  series: number | null;
  reps: string | null;
  restSec: number | null;
};

export type RoutineGroup = {
  day: string;
  focus: string | null;
  items: RoutineItem[];
};

/** Separa "Día · Enfoque: Ejercicio". Si la etiqueta no tiene ese formato, el texto completo queda como ejercicio. */
export function parseRoutineLabel(label: string): { day: string; focus: string | null; name: string } {
  const full = /^(.+?) · (.+?): (.+)$/.exec(label);
  if (full) return { day: full[1].trim(), focus: full[2].trim(), name: full[3].trim() };
  const short = /^(.+?): (.+)$/.exec(label);
  if (short) return { day: short[1].trim(), focus: null, name: short[2].trim() };
  return { day: "Otros", focus: null, name: label.trim() };
}

/** Las sesiones de cardio ("Cardio 1", "Cardio 2") se muestran juntas como "Cardio". */
function groupKey(day: string): string {
  return /^Cardio\b/.test(day) ? "Cardio" : day;
}

/** Agrupa los ejercicios por día, en el orden en que se guardaron. */
export function groupRoutineByDay(exercises: RoutineExerciseRow[]): RoutineGroup[] {
  const groups: RoutineGroup[] = [];
  const byKey = new Map<string, RoutineGroup>();
  for (const ex of exercises) {
    const parsed = parseRoutineLabel(ex.ejercicio);
    const key = groupKey(parsed.day);
    let group = byKey.get(key);
    if (!group) {
      group = { day: key, focus: parsed.focus, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push({ name: parsed.name, series: ex.series, reps: ex.reps, restSec: ex.descanso_s });
  }
  return groups;
}

/** Descanso en segundos. Cero o vacío se muestra como guion (cardio sin pausa). */
export function formatRest(sec: number | null): string {
  if (sec === null || sec === undefined || sec <= 0) return "—";
  return sec >= 60 && sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`;
}

/** Series en número, o guion si no se guardó. */
export function formatSeries(series: number | null): string {
  return series === null || series === undefined ? "—" : String(series);
}
