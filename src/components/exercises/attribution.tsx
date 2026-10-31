import { EXERCISE_ATTRIBUTION } from "@/lib/exercises/terms";

/**
 * Atribución obligatoria del dataset (EX-01).
 *
 * La licencia del catálogo exige un enlace visible «Exercise data by RepDB
 * (repdb.co)». Vive en un solo componente para que no se pierda en un rediseño:
 * `tests/exercises-attribution.test.mjs` comprueba que las pantallas lo usen.
 */
export function ExerciseAttribution({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[0.6875rem] text-fog ${className}`}>
      <a
        href={EXERCISE_ATTRIBUTION.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="underline decoration-line underline-offset-2 hover:text-ink"
      >
        {EXERCISE_ATTRIBUTION.text}
      </a>
    </p>
  );
}
