import Link from "next/link";
import type { ExerciseCard as ExerciseCardData } from "@/lib/exercises/queries";
import { bodyPartLabel, difficultyLabel, equipmentLabel } from "@/lib/exercises/terms";
import { suggestDose, doseLabel } from "@/lib/exercises/prescription";

/**
 * Tarjeta de un ejercicio en la biblioteca (EX-01).
 *
 * Muestra lo que el socio necesita para decidir en dos segundos: qué es, para
 * qué zona es, con qué se hace y cuántas series y repeticiones. Tocar la
 * tarjeta abre la ficha completa.
 */

/** Imagen de portada: la pose principal o, si hay dos, la de inicio. */
export function exerciseImage(card: Pick<ExerciseCardData, "imageMain" | "imageStart" | "imagePeak">) {
  const path = card.imageMain ?? card.imageStart ?? card.imagePeak;
  return path ? `/api/exercises/image?path=${encodeURIComponent(path)}` : null;
}

export function ExerciseCard({
  exercise,
  locale,
}: {
  exercise: ExerciseCardData;
  locale: string;
}) {
  const image = exerciseImage(exercise);
  const dose = suggestDose({
    category: exercise.category,
    difficulty: exercise.difficulty,
    isBodyweight: exercise.isBodyweight,
  });

  return (
    <Link
      href={`/${locale}/mi-cuenta/ejercicios/${encodeURIComponent(exercise.id)}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-brand focus-visible:border-brand focus-visible:outline-none"
    >
      <div className="flex aspect-square items-center justify-center bg-paper/70">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- WebP del catálogo servido por nuestra propia ruta; no necesita optimización extra.
          <img
            src={image}
            alt=""
            width={512}
            height={512}
            loading="lazy"
            className="size-full object-contain p-2"
          />
        ) : (
          <span className="text-xs text-fog">Sin imagen</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-brand-300 uppercase">
          {bodyPartLabel(exercise.bodyPart)}
        </p>
        <p className="text-sm leading-snug font-semibold text-ink group-hover:text-brand">
          {exercise.nameEs}
        </p>
        <p className="text-[0.75rem] text-fog">
          {equipmentLabel(exercise.equipment)} · {difficultyLabel(exercise.difficulty)}
        </p>
        <p className="mt-auto pt-1 text-[0.75rem] font-semibold text-ink">
          {dose.sets === null ? dose.reps : `${doseLabel(dose)} repeticiones`}
        </p>
      </div>
    </Link>
  );
}
