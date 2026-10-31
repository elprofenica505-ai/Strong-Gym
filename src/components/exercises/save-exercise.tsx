"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import type { Dose } from "@/lib/exercises/prescription";
import { cn } from "@/lib/utils";

/**
 * «Guardar en mi rutina» (EX-01).
 *
 * Manda series, repeticiones y descanso sugeridos y el cliente los puede
 * cambiar antes de guardar. La base resuelve de quién es la rutina por la
 * sesión: acá nunca viaja un id de cliente.
 */
export function SaveExercise({
  exerciseId,
  dose,
  initialSaved,
  canSave,
  className = "",
}: {
  exerciseId: string;
  dose: Dose;
  initialSaved: { sets: number | null; reps: string | null; restSeconds: number | null } | null;
  canSave: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useState(Boolean(initialSaved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [sets, setSets] = useState(String(initialSaved?.sets ?? dose.sets ?? 3));
  const [reps, setReps] = useState(initialSaved?.reps ?? dose.reps);
  const [rest, setRest] = useState(String(initialSaved?.restSeconds ?? dose.restSeconds));

  async function send(action: "save" | "remove") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/exercises/routine", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify(
          action === "save"
            ? {
                action,
                exerciseId,
                sets: Number(sets) || null,
                reps: reps.trim() || null,
                restSeconds: rest === "" ? null : Number(rest),
              }
            : { action, exerciseId },
        ),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !body || (body as { ok?: unknown }).ok !== true) {
        setError(
          body && typeof (body as { message?: unknown }).message === "string"
            ? (body as { message: string }).message
            : "No pudimos guardar el cambio. Reintentá en un momento.",
        );
        return;
      }
      setSaved(action === "save");
      setOpen(false);
    } catch {
      setError("No pudimos guardar el cambio. Revisá la conexión y reintentá.");
    } finally {
      setBusy(false);
    }
  }

  if (!canSave) {
    return (
      <p className={cn("rounded-xl border border-line bg-card p-3 text-sm text-fog", className)}>
        Para guardar ejercicios en tu rutina necesitás ficha de cliente vinculada a tu cuenta.
        Pedile a recepción que la vincule.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {open ? (
        <div className="space-y-3 rounded-2xl border border-line bg-card p-4">
          <p className="text-sm font-semibold text-ink">Agregar a mi rutina</p>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs font-medium text-fog">
              Series
              <input
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                inputMode="numeric"
                value={sets}
                onChange={(event) => setSets(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              />
            </label>
            <label className="text-xs font-medium text-fog">
              Repeticiones
              <input
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                value={reps}
                onChange={(event) => setReps(event.target.value.slice(0, 20))}
              />
            </label>
            <label className="text-xs font-medium text-fog">
              Descanso (s)
              <input
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                inputMode="numeric"
                value={rest}
                onChange={(event) => setRest(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => send("save")}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-onbrand disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => (saved ? send("remove") : setOpen(true))}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
              saved
                ? "border border-brand/40 bg-brand-soft text-brand-300 hover:border-brand"
                : "bg-brand text-onbrand hover:opacity-90",
            )}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : saved ? (
              <Trash2 className="size-4" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {saved ? "Quitar de mi rutina" : "Guardar en mi rutina"}
          </button>
        </div>
      )}
      {error ? (
        <p className="rounded-xl border border-alert/40 bg-card p-3 text-sm text-alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
