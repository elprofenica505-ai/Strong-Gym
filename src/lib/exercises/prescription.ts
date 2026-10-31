/**
 * Cuántas series, cuántas repeticiones y cuánto descansar (EX-01).
 *
 * Por qué existe: lo que el socio quiere ver no es «hacé el ejercicio», es
 * «4 series de 8 a 10, descansá 90 segundos». El dataset no trae dosis; trae
 * categoría, dificultad y objetivo. Esta tabla traduce esas tres cosas a una
 * indicación concreta **de gimnasio** y la pantalla la muestra como sugerencia
 * editable, nunca como una orden médica.
 *
 * Funciones puras: se prueban sin base ni navegador.
 */

export interface Dose {
  /** Series sugeridas (null para cardio y estiramiento, que no van por series). */
  sets: number | null;
  /** Repeticiones como texto: «8-10», «12», «30 s». */
  reps: string;
  /** Descanso entre series, en segundos. */
  restSeconds: number;
  /** Una línea de cómo hacerlo, en voseo. */
  how: string;
}

export interface DoseInput {
  category?: string | null;
  mechanic?: string | null;
  difficulty?: string | null;
  goals?: string[] | null;
  isBodyweight?: boolean | null;
  met?: number | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * La indicación sugerida. El orden de las reglas importa: primero lo que no se
 * mide en series (estiramiento y cardio), después pesas.
 */
export function suggestDose(input: DoseInput): Dose {
  const category = (input.category ?? "strength").toLowerCase();
  const advancement =
    input.difficulty === "advanced" ? 1 : input.difficulty === "beginner" ? -1 : 0;

  if (category === "stretching") {
    return {
      sets: 2,
      reps: "30-45 s",
      restSeconds: 20,
      how: "Sostené la posición sin rebotar y respirá parejo. Hacelo al terminar la rutina.",
    };
  }

  if (category === "cardio") {
    const minutes = clamp(Math.round(10 + (input.met ?? 5) * 2), 12, 35);
    return {
      sets: null,
      reps: `${minutes} min`,
      restSeconds: 0,
      how: "Ritmo parejo que te deje hablar; subí si te sobra aire, bajá si te falta.",
    };
  }

  if (category === "plyometrics") {
    return {
      sets: 4,
      reps: "5",
      restSeconds: 120,
      how: "Pocas, explosivas y completas. Si perdés la técnica o la potencia, terminá la serie.",
    };
  }

  if (category === "olympic") {
    return {
      sets: 5,
      reps: advancement > 0 ? "3" : "5",
      restSeconds: 150,
      how: "Priorizá la técnica antes que el peso; si la barra sale lenta, bajá la carga.",
    };
  }

  const isolated = input.mechanic === "isolation";
  const hypertrophy = (input.goals ?? []).includes("hypertrophy");
  const bodyweight = input.isBodyweight === true;

  if (isolated) {
    return {
      sets: clamp(3 + advancement, 2, 5),
      reps: hypertrophy ? "12-15" : "10-12",
      restSeconds: 60,
      how: "Movimiento corto y controlado: sentí el músculo, no balancees el peso.",
    };
  }

  if (bodyweight) {
    return {
      sets: clamp(3 + advancement, 2, 5),
      reps: hypertrophy ? "10-15" : "8-12",
      restSeconds: 60,
      how: "Si te salen muchas de más, sumá una banda o hacelo más lento antes de agregar peso.",
    };
  }

  return {
    sets: clamp(4 + advancement, 3, 6),
    reps: hypertrophy ? "8-12" : "6-10",
    restSeconds: hypertrophy ? 90 : 120,
    how: "Bajá controlado y subí firme. Dejá una o dos repeticiones en reserva.",
  };
}

/**
 * Cuánto dura una sesión, aproximado. Sirve para que «Mi rutina» diga
 * «≈ 45 min» en vez de dejar al socio adivinando.
 *
 * Cada serie son ~35 s de trabajo efectivo más el descanso indicado.
 */
export function estimateSessionMinutes(
  items: Array<{ sets?: number | null; restSeconds?: number | null; category?: string | null; reps?: string | null }>,
): number {
  let seconds = 0;
  for (const item of items) {
    const rest = clamp(item.restSeconds ?? 60, 0, 900);
    const category = (item.category ?? "strength").toLowerCase();
    if (category === "cardio") {
      const match = /(\d+)/.exec(item.reps ?? "");
      seconds += (match ? Number(match[1]) : 20) * 60;
      continue;
    }
    const sets = clamp(item.sets ?? 3, 1, 20);
    seconds += sets * (35 + rest);
  }
  return Math.max(0, Math.round(seconds / 60));
}

/** Texto corto de la dosis, para listas y tarjetas. */
export function doseLabel(dose: Dose): string {
  return dose.sets === null
    ? dose.reps
    : `${dose.sets} × ${dose.reps}`;
}

/** Formato del descanso: «60 s» o «2 min». */
export function restLabel(restSeconds: number): string {
  if (restSeconds <= 0) return "sin descanso";
  if (restSeconds < 60) return `${restSeconds} s`;
  const minutes = restSeconds / 60;
  return Number.isInteger(minutes) ? `${minutes} min` : `${restSeconds} s`;
}
