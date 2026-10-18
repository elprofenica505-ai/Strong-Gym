"use client";

import { useMemo, useState } from "react";
import type { TrainerAccessRow, TrainerAccessStatus } from "@/lib/data/queries";

const STATUS_LABEL: Record<TrainerAccessStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  revoked: "Revocado",
};

const STATUS_ORDER: Record<TrainerAccessStatus, number> = { pending: 0, approved: 1, revoked: 2, rejected: 3 };

const VIA_LABEL: Record<string, string> = { trainer: "Entrenador", cashier: "Caja" };

const dateFormat = new Intl.DateTimeFormat("es-NI", {
  timeZone: "America/Managua",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Notice = { tone: "ok" | "error"; text: string } | null;

/**
 * Administración de entrenadores: interruptor de búsqueda y pedidos, y decisiones
 * sobre cada pedido. Cada acción pasa por POST /api/admin/trainer-access; la base
 * vuelve a validar sesión con verificación en dos pasos y el estado del pedido.
 */
export function TrainerAccessManager({
  initialEnabled,
  initialRequests,
}: {
  initialEnabled: boolean;
  initialRequests: TrainerAccessRow[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [rows, setRows] = useState(initialRequests);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt),
      ),
    [rows],
  );
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  async function post(key: string, payload: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
    setBusy(key);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/trainer-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) return { ok: false, message: body?.message ?? "No se pudo guardar el cambio." };
      return { ok: true };
    } catch {
      return { ok: false, message: "Sin conexión. No se cambió nada." };
    } finally {
      setBusy(null);
    }
  }

  async function toggle(next: boolean) {
    const result = await post("toggle", { action: "toggle", enabled: next });
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return;
    }
    setEnabled(next);
    setNotice({
      tone: "ok",
      text: next
        ? "Los entrenadores ya pueden buscar y pedir clientes. Cada pedido igual lo aprobás vos."
        : "Los entrenadores ya no pueden buscar ni pedir clientes. Los clientes ya aprobados siguen asignados.",
    });
  }

  async function decide(row: TrainerAccessRow, decision: "approved" | "rejected" | "revoked") {
    const result = await post(row.id, { action: "decide", requestId: row.id, decision });
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: decision, decidedAt: new Date().toISOString() } : r)),
    );
    const verb = decision === "approved" ? "aprobado" : decision === "rejected" ? "rechazado" : "revocado";
    setNotice({ tone: "ok", text: `Pedido de ${row.clientName} ${verb} para ${row.trainerName}.` });
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="interruptor-titulo" className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 id="interruptor-titulo" className="text-[1rem] font-semibold text-ink">
              Buscar y pedir clientes
            </h2>
            <p className="mt-1 text-[0.8125rem] text-mist">
              Si está activado, los entrenadores pueden buscar clientes por nombre y pedir acceso a ellos. Cada pedido
              requiere tu aprobación. Si lo desactivás, no pueden buscar ni pedir, pero conservan los clientes ya
              aprobados.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-3">
            <span className="text-[0.8125rem] font-semibold text-ink">{enabled ? "Activado" : "Desactivado"}</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={enabled}
              aria-label="Permitir que los entrenadores busquen y pidan clientes"
              checked={enabled}
              disabled={busy === "toggle"}
              onChange={(e) => toggle(e.target.checked)}
              className="size-5 accent-brand disabled:opacity-50"
            />
          </label>
        </div>
      </section>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "rounded-xl border border-alert/40 bg-alert/10 px-4 py-3 text-[0.8125rem] text-alert"
              : "rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist"
          }
        >
          {notice.text}
        </p>
      ) : null}

      <section aria-labelledby="pedidos-titulo" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="pedidos-titulo" className="text-[1rem] font-semibold text-ink">
            Pedidos de acceso
          </h2>
          <p className="text-[0.75rem] text-fog">
            {pendingCount === 0 ? "Sin pedidos pendientes" : `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`}
          </p>
        </div>

        {sorted.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[0.875rem] text-mist">
            Todavía no hay pedidos de acceso.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[48rem] text-left text-[0.875rem]">
              <thead className="bg-cloud text-[0.6875rem] font-semibold tracking-[0.12em] text-fog uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">Entrenador</th>
                  <th scope="col" className="px-4 py-3">Cliente</th>
                  <th scope="col" className="px-4 py-3">Pedido por</th>
                  <th scope="col" className="px-4 py-3">Fecha</th>
                  <th scope="col" className="px-4 py-3">Estado</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="px-4 py-3 text-ink">{row.trainerName}</td>
                    <td className="px-4 py-3 text-ink">{row.clientName}</td>
                    <td className="px-4 py-3 text-mist">
                      {VIA_LABEL[row.requestedVia] ?? row.requestedVia}
                      {row.reason ? <span className="block text-[0.75rem] text-fog">“{row.reason}”</span> : null}
                    </td>
                    <td className="px-4 py-3 text-mist">{dateFormat.format(new Date(row.createdAt))}</td>
                    <td className="px-4 py-3 text-mist">{STATUS_LABEL[row.status]}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {row.status === "pending" ? (
                          <>
                            <button
                              type="button"
                              disabled={busy === row.id}
                              onClick={() => decide(row, "approved")}
                              className="h-9 rounded-lg bg-brand px-3 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
                            >
                              Aprobar
                            </button>
                            <button
                              type="button"
                              disabled={busy === row.id}
                              onClick={() => decide(row, "rejected")}
                              className="h-9 rounded-lg border border-line px-3 text-[0.8125rem] font-semibold text-ink disabled:opacity-50"
                            >
                              Rechazar
                            </button>
                          </>
                        ) : null}
                        {row.status === "approved" ? (
                          <button
                            type="button"
                            disabled={busy === row.id}
                            onClick={() => decide(row, "revoked")}
                            className="h-9 rounded-lg border border-alert/50 px-3 text-[0.8125rem] font-semibold text-alert disabled:opacity-50"
                          >
                            Revocar acceso
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
