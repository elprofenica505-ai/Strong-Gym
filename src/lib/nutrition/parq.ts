// Cuestionario de actividad física (basado en PAR-Q) antes de calcular el plan.
// BORRADOR: el texto y las reglas deben ser revisados por un profesional (abogado y médico) antes de publicar.
// Cambiar preguntas o reglas = nueva versión.
export const PARQ_VERSION = "parq-v1-2026-10-21-borrador";

export const PARQ_QUESTIONS_ES: readonly string[] = [
  "¿Su médico le ha dicho alguna vez que tiene un problema del corazón y que sólo debe hacer actividad física recomendada por un médico?",
  "¿Siente dolor en el pecho cuando hace actividad física?",
  "En los últimos tres meses, ¿ha tenido dolor en el pecho cuando no estaba haciendo actividad física?",
  "¿Pierde el equilibrio por mareos o alguna vez ha perdido el conocimiento?",
  "¿Tiene algún problema de huesos o articulaciones que pueda empeorar con la actividad física?",
  "¿Su médico le ha recetado medicamentos para la presión arterial o para el corazón?",
  "¿Sabe de alguna otra razón por la que no debería hacer actividad física?",
];

/** Respuestas completas: exactamente una por pregunta, true = sí. */
export function parqAnswersComplete(answers: ReadonlyArray<boolean | null>): answers is boolean[] {
  return answers.length === PARQ_QUESTIONS_ES.length && answers.every((a) => typeof a === "boolean");
}

/** Si alguna respuesta es «sí», no se calcula el plan hasta que consulte a su médico. */
export function parqHasYes(answers: ReadonlyArray<boolean>): boolean {
  return answers.some(Boolean);
}
