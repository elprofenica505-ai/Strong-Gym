import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/data/queries";
import { readData } from "@/lib/data/read-result";
import { getExerciseDetail, getMyRoutine } from "@/lib/exercises/queries";
import {
  bodyPartLabel,
  categoryLabel,
  difficultyLabel,
  equipmentLabel,
  equipmentTone,
  forceLabel,
  goalLabel,
  mechanicLabel,
  muscleLabel,
} from "@/lib/exercises/terms";
import { doseLabel, restLabel, suggestDose } from "@/lib/exercises/prescription";
import { ExerciseAttribution } from "@/components/exercises/attribution";
import { exerciseFrames } from "@/components/exercises/exercise-figure";
import { ExerciseMotion } from "@/components/exercises/exercise-motion";
import { ExerciseTimer } from "@/components/exercises/exercise-timer";
import { SaveExercise } from "@/components/exercises/save-exercise";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: decodeURIComponent(id).replaceAll("-", " "),
    robots: { index: false, follow: false },
  };
}

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) redirect("/es");

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/ingresar`);

  const result = await readData(() =>
    Promise.all([getExerciseDetail(decodeURIComponent(id)), getMyRoutine()]),
  );

  const back = (
    <Link href={`/${locale}/mi-cuenta/ejercicios`} className="text-xs font-semibold text-fog hover:text-ink">
      ← Biblioteca
    </Link>
  );

  if (!result.ok) {
    return (
      <div className="container-x space-y-4 py-6">
        {back}
        <div className="rounded-2xl border border-alert/40 bg-card p-5">
          <p className="font-semibold text-alert">No pudimos leer este ejercicio</p>
          <p className="mt-1 text-sm text-fog">
            La ficha no se pudo cargar. No es que el ejercicio no exista: la lectura falló.
          </p>
          <p className="mt-2 text-xs text-fog">Código: {result.code}</p>
        </div>
      </div>
    );
  }

  const [exercise, routine] = result.data;
  if (!exercise) {
    return (
      <div className="container-x space-y-4 py-6">
        {back}
        <div className="rounded-2xl border border-line bg-card p-6">
          <p className="font-semibold text-ink">Ese ejercicio no está en la biblioteca</p>
          <p className="mt-1 text-sm text-fog">
            Puede que el catálogo se haya actualizado. Buscalo de nuevo desde la lista.
          </p>
        </div>
      </div>
    );
  }

  const dose = suggestDose({
    category: exercise.category,
    mechanic: exercise.mechanic,
    difficulty: exercise.difficulty,
    goals: exercise.goals,
    isBodyweight: exercise.isBodyweight,
    met: exercise.met,
  });
  const { animated } = exerciseFrames(exercise);

  return (
    <div className="container-x space-y-6 py-6">
      {back}

      <header className="space-y-2">
        <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-brand-300 uppercase">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: equipmentTone(exercise.equipment) }}
          />
          {bodyPartLabel(exercise.bodyPart)} · {equipmentLabel(exercise.equipment)}
        </p>
        <h1 className="display-xl text-[1.75rem] sm:text-[2.25rem]">{exercise.nameEs}</h1>
        {exercise.nameEn && exercise.nameEn.toLowerCase() !== exercise.nameEs.toLowerCase() ? (
          <p className="text-sm text-fog">{exercise.nameEn}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {[categoryLabel(exercise.category), difficultyLabel(exercise.difficulty), mechanicLabel(exercise.mechanic)]
            .filter(Boolean)
            .map((label) => (
              <span key={label} className="rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-fog">
                {label}
              </span>
            ))}
          {exercise.isUnilateral ? (
            <span className="rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-fog">
              Un lado por vez
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {/* El movimiento: las dos fotos del origen se alternan solas, y hay
              botón para forzarlo si el teléfono pide reducir movimiento. */}
          <section className="space-y-1.5">
            <ExerciseMotion
              name={exercise.nameEs}
              frames={exercise}
              tone={equipmentTone(exercise.equipment)}
              className="aspect-square w-full sm:aspect-[4/3]"
            />
            <p className="text-[0.6875rem] text-fog">
              {animated
                ? "La imagen alterna la posición inicial y la final del movimiento."
                : "Imagen de referencia del movimiento."}
            </p>
          </section>

          {exercise.descriptionEs ? (
            <section className="space-y-1">
              <h2 className="text-base font-bold text-ink">Qué es</h2>
              <p className="text-sm leading-relaxed text-fog">{exercise.descriptionEs}</p>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-base font-bold text-ink">Paso a paso</h2>
            {exercise.instructionsEs.length === 0 ? (
              <p className="text-sm text-fog">Este ejercicio no trae instrucciones escritas.</p>
            ) : (
              <ol className="space-y-2">
                {exercise.instructionsEs.map((step, index) => (
                  <li key={`${index}-${step.slice(0, 12)}`} className="flex gap-3 rounded-xl border border-line bg-card p-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-300">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-ink">{step}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {exercise.tipsEs.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-base font-bold text-ink">Consejos</h2>
              <ul className="space-y-1.5">
                {exercise.tipsEs.map((tip, index) => (
                  <li key={`tip-${index}`} className="rounded-xl border border-line bg-card p-3 text-sm leading-relaxed text-fog">
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Músculo principal", exercise.primaryMuscles.map(muscleLabel).join(", ") || "—"],
              ["También trabaja", exercise.secondaryMuscles.map(muscleLabel).join(", ") || "—"],
              ["Tipo de fuerza", forceLabel(exercise.forceType) || "—"],
              ["Objetivo", exercise.goals.map(goalLabel).join(", ") || "—"],
            ].map(([title, value]) => (
              <div key={title} className="rounded-xl border border-line bg-card p-3">
                <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-fog uppercase">{title}</p>
                <p className="mt-1 text-sm text-ink">{value}</p>
              </div>
            ))}
          </section>
        </div>

        {/* Columna de la sesión: dosis, guardar y reloj. */}
        <aside className="space-y-4">
          <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
            <div>
              <h2 className="text-base font-bold text-ink">Cómo hacerlo hoy</h2>
              <p className="text-xs text-fog">Sugerencia para sala; ajustá según tu entrenador.</p>
            </div>
            <p className="text-[2rem] leading-none font-bold text-ink">{doseLabel(dose)}</p>
            <p className="text-sm text-fog">
              {dose.sets === null ? "Duración sugerida" : "Series × repeticiones"} · descanso{" "}
              {restLabel(dose.restSeconds)}
            </p>
            <p className="text-sm leading-relaxed text-fog">{dose.how}</p>
            {exercise.met ? (
              <p className="text-xs text-fog">
                Gasto aproximado: {exercise.met} MET por hora de actividad.
              </p>
            ) : null}
          </section>

          <SaveExercise
            exerciseId={exercise.id}
            dose={dose}
            initialSaved={exercise.saved}
            canSave={routine.canSave}
          />

          <ExerciseTimer seconds={dose.restSeconds > 0 ? dose.restSeconds : 60} />

          <ExerciseAttribution />
        </aside>
      </div>
    </div>
  );
}
