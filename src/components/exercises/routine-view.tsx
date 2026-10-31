"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Loader2, Trash2 } from "lucide-react";
import type { RoutineItem } from "@/lib/exercises/queries";
import { bodyPartLabel, equipmentLabel } from "@/lib/exercises/terms";
import { estimateSessionMinutes, restLabel } from "@/lib/exercises/prescription";

/**
 * «Mi rutina» (EX-01): la lista que el cliente armó para su sesión.
 *
 * Es distinta de la rutina que asigna el entrenador (`client_routines`) y la
 * pantalla lo dice: acá el socio guarda ejercicios para acordarse de qué hacer
 * hoy. Muestra la duración estimada para que sepa cuánto le va a llevar.
 */
export function RoutineView({
  items,
  locale,
}: {
  items: RoutineItem[];
  locale: string;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);

  const visible = useMemo(() => items.filter((item) => !gone.includes(item.exerciseId)), [items, gone]);
  const minutes = useMemo(
    () =>
      estimateSessionMinutes(
        visible.map((item) => ({
          sets: item.sets,
          restSeconds: item.restSeconds,
          reps: item.reps,
          category: null,
        })),
      ),
    [visible],
  );

  async function remove(exerciseId: string) {
    setRemoving(exerciseId);
    setError(null);
    try {
      const response = await fetch("/api/exercises/routine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "remove", exerciseId }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !body || (body as { ok?: unknown }).ok !== true) {
        setError(
          body && typeof (body as { message?: unknown }).message === "string"
            ? (body as { message: string }).message
            : "No pudimos quitar el ejercicio. Reintentá.",
        );
        return;
      }
      setGone((current) => [...current, exerciseId]);
    } catch {
      setError("No pudimos quitar el ejercicio. Revisá la conexión y reintentá.");
    } finally {
      setRemoving(null);
    }
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
        <p className="text-sm text-fog">
          Todavía no guardaste ejercicios. Abrí la biblioteca, elegí uno y tocá
          «Guardar en mi rutina»: se arma acá con sus series y descansos.
        </p>
        <Link
          href={`/${locale}/mi-cuenta/ejercicios`}
          className="mt-3 inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-onbrand"
        >
          Ir a la biblioteca
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-4">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Clock className="size-4 text-brand" aria-hidden="true" />
          {visible.length} {visible.length === 1 ? "ejercicio" : "ejercicios"} · ≈ {minutes} min
        </p>
        <p className="text-xs text-fog">
          La duración es un cálculo con los descansos que guardaste, no un cronómetro.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-alert/40 bg-card p-3 text-sm text-alert" role="alert">
          {error}
        </p>
      ) : null}

      <ol className="space-y-2">
        {visible.map((item, index) => (
          <li
            key={item.exerciseId}
            className="flex items-start gap-3 rounded-2xl border border-line bg-card p-3"
          >
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-300">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/${locale}/mi-cuenta/ejercicios/${encodeURIComponent(item.exerciseId)}`}
                className="font-semibold text-ink hover:text-brand"
              >
                {item.nameEs}
              </Link>
              <p className="text-[0.75rem] text-fog">
                {bodyPartLabel(item.bodyPart)} · {equipmentLabel(item.equipment)}
              </p>
              <p className="mt-1 text-[0.8125rem] font-semibold text-ink">
                {item.sets ? `${item.sets} series` : "Series libres"}
                {item.reps ? ` × ${item.reps}` : ""}
                {item.restSeconds !== null ? ` · descanso ${restLabel(item.restSeconds)}` : ""}
              </p>
              {item.note ? <p className="mt-0.5 text-xs text-fog">{item.note}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => remove(item.exerciseId)}
              disabled={removing === item.exerciseId}
              aria-label={`Quitar ${item.nameEs} de mi rutina`}
              className="shrink-0 rounded-full border border-line p-2 text-fog transition-colors hover:border-alert hover:text-alert disabled:opacity-60"
            >
              {removing === item.exerciseId ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
