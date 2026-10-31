"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * «Actualizar catálogo» (EX-01), sólo para administración.
 *
 * Descarga el JSON oficial y lo carga de nuevo: el cargador hace *upsert* por
 * `id`, así que repetirlo no duplica y lo que ya estaba cargado no se pierde
 * aunque la descarga falle.
 */
export function UpdateLibrary() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/exercises/import", {
        method: "POST",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !body || (body as { ok?: unknown }).ok !== true) {
        setError(
          body && typeof (body as { message?: unknown }).message === "string"
            ? (body as { message: string }).message
            : "No se pudo actualizar el catálogo.",
        );
        return;
      }
      const imported = (body as { imported?: number }).imported ?? 0;
      const total = (body as { total?: number }).total ?? 0;
      setMessage(
        `Catálogo al día: ${imported} ${imported === 1 ? "ejercicio" : "ejercicios"} procesados, ${total} en total.`,
      );
    } catch {
      setError("No pudimos completar la actualización. Lo cargado sigue igual; probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        {busy ? "Actualizando…" : "Actualizar catálogo"}
      </button>
      {message ? <span className="text-xs text-brand-300">{message}</span> : null}
      {error ? (
        <span className="text-xs text-alert" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
