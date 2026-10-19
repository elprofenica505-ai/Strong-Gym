"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Interruptor del administrador: permite que caja vea el cierre del día en Reportes.
 * Apagado por defecto. Caja nunca puede cambiarlo (la base lo impide, 00037).
 */
export function CashierDailyCloseToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/trainer-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_cashier_daily_close", enabled: next }),
      });
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setNotice({ tone: "error", text: json?.message ?? "No se pudo guardar el cambio. No se modificó nada." });
        return;
      }
      setEnabled(next);
      setNotice({
        tone: "ok",
        text: next
          ? "Caja ya puede ver el cierre del día en Reportes."
          : "Caja ya no ve el cierre del día. Los datos siguen guardados.",
      });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "No hay conexión. No se modificó nada." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="caja-cierre-titulo" className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">Caja · Reportes</p>
          <h2 id="caja-cierre-titulo" className="mt-1 text-[1rem] font-semibold text-ink">
            Cierre del día para caja
          </h2>
          <p className="mt-1 max-w-prose text-[0.8125rem] text-mist">
            Cuando está encendido, el usuario de caja puede abrir Reportes y ver sólo el cierre del día. No ve el comparativo,
            los pagos pendientes, las comisiones ni el Excel maestro.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-3 rounded-xl border border-line px-4 py-3">
          <span className={`text-[0.8125rem] font-semibold ${enabled ? "text-brand" : "text-fog"}`}>
            {enabled ? "Encendido" : "Apagado"}
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={enabled}
            aria-label="Permitir que caja vea el cierre del día"
            checked={enabled}
            disabled={busy}
            onChange={(e) => toggle(e.target.checked)}
            className="size-5 accent-brand disabled:opacity-50"
          />
        </label>
      </div>
      {notice ? (
        <p
          role="status"
          className={`rounded-xl px-4 py-2 text-[0.8125rem] ${
            notice.tone === "ok" ? "bg-brand/[0.08] text-ink" : "border border-red-400/40 bg-red-400/[0.06] text-red-300"
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
