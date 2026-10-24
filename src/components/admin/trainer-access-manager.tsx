"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserPlus, Users } from "lucide-react";
import type { TrainerAccessRow, TrainerAccessStatus } from "@/lib/data/queries";

const STATUS_LABEL: Record<TrainerAccessStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  revoked: "Revocado",
};

const STATUS_ORDER: Record<TrainerAccessStatus, number> = { pending: 0, approved: 1, revoked: 2, rejected: 3 };

const VIA_LABEL: Record<string, string> = { trainer: "Entrenador", cashier: "Cajero", admin: "Administración" };

const dateFormat = new Intl.DateTimeFormat("es-NI", {
  timeZone: "America/Managua",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Notice = { tone: "ok" | "error"; text: string } | null;

export interface TrainerOption {
  id: string;
  fullName: string;
}

export interface ClientOption {
  id: string;
  fullName: string;
}

/**
 * Administración de entrenadores: asignación directa de clientes, interruptor de
 * búsqueda y pedidos, tarjetas por entrenador y decisiones sobre cada pedido.
 * Cada acción pasa por POST /api/admin/trainer-access; la base vuelve a validar
 * sesión con verificación en dos pasos, rol y estado.
 */
export function TrainerAccessManager({
  initialEnabled,
  initialRequests,
  trainers,
  clients,
}: {
  initialEnabled: boolean;
  initialRequests: TrainerAccessRow[];
  trainers: TrainerOption[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const rows = initialRequests;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [trainerId, setTrainerId] = useState(trainers[0]?.id ?? "");
  const [clientId, setClientId] = useState("");

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt),
      ),
    [rows],
  );
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  const byTrainer = useMemo(() => {
    return trainers.map((t) => ({
      ...t,
      approved: rows
        .filter((r) => r.trainerId === t.id && r.status === "approved")
        .map((r) => ({ key: r.id, name: r.clientName })),
    }));
  }, [trainers, rows]);

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

  async function assign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!trainerId || !clientId) {
      setNotice({ tone: "error", text: "Elegí un entrenador y un cliente." });
      return;
    }
    const result = await post("assign", { action: "assign", trainerId, clientId });
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return;
    }
    const trainer = trainers.find((t) => t.id === trainerId);
    const client = clients.find((c) => c.id === clientId);
    setNotice({
      tone: "ok",
      text: `${client?.fullName ?? "El cliente"} quedó asignado a ${trainer?.fullName ?? "el entrenador"}.`,
    });
    setClientId("");
    router.refresh();
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
    router.refresh();
    const verb = decision === "approved" ? "aprobado" : decision === "rejected" ? "rechazado" : "revocado";
    setNotice({ tone: "ok", text: `Pedido de ${row.clientName} ${verb} para ${row.trainerName}.` });
  }

  const noTrainers = trainers.length === 0;

  return (
    <div className="flex flex-col gap-6">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section aria-labelledby="asignar-titulo" className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
              <UserPlus className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="asignar-titulo" className="text-[1rem] font-semibold text-ink">
                Asignar cliente a entrenador
              </h2>
              <p className="text-[0.8125rem] text-mist">El entrenador sólo ve a los clientes asignados.</p>
            </div>
          </div>

          {noTrainers ? (
            <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[0.875rem] text-mist">
              Todavía no hay cuentas con rol de entrenador. Asignalo desde Personal en la sección Clientes.
            </p>
          ) : (
            <form onSubmit={assign} className="mt-5 grid gap-4">
              <label className="grid gap-1.5">
                <span className="text-[0.75rem] font-semibold tracking-[0.08em] text-fog uppercase">Entrenador</span>
                <select
                  value={trainerId}
                  onChange={(e) => setTrainerId(e.target.value)}
                  className="h-11 rounded-xl border border-line bg-card px-3 text-[0.9375rem] text-ink"
                >
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id} className="bg-card text-ink">
                      {t.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[0.75rem] font-semibold tracking-[0.08em] text-fog uppercase">Cliente activo</span>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="h-11 rounded-xl border border-line bg-card px-3 text-[0.9375rem] text-ink"
                >
                  <option value="" className="bg-card text-ink">Elegí un cliente…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id} className="bg-card text-ink">
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy === "assign" || !clientId || !trainerId}
                className="h-11 rounded-xl bg-brand px-5 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
              >
                {busy === "assign" ? "Guardando…" : "Asignar cliente"}
              </button>
            </form>
          )}
        </section>

        <section aria-labelledby="interruptor-titulo" className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-md">
              <h2 id="interruptor-titulo" className="text-[1rem] font-semibold text-ink">
                Buscar y pedir clientes
              </h2>
              <p className="mt-1 text-[0.8125rem] text-mist">
                Si está activado, los entrenadores pueden buscar clientes y pedir acceso a ellos. Cada pedido requiere tu
                aprobación. Desactivado, no pueden buscar ni pedir, pero conservan los clientes ya aprobados.
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
      </div>

      <section aria-labelledby="equipo-titulo" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="equipo-titulo" className="text-[1rem] font-semibold text-ink">
            Clientes por entrenador
          </h2>
          <p className="text-[0.75rem] text-fog">
            {byTrainer.length} entrenador{byTrainer.length === 1 ? "" : "es"}
          </p>
        </div>
        {byTrainer.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[0.875rem] text-mist">
            Todavía no hay entrenadores. Asigná el rol de entrenador desde «Personal y roles».
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {byTrainer.map((t) => (
              <article key={t.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
                <header className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
                    <UserCheck className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-[0.9375rem] font-semibold text-ink">{t.fullName}</h3>
                    <p className="text-[0.75rem] text-fog">
                      <Users className="mr-1 inline size-3.5" aria-hidden />
                      {t.approved.length} cliente{t.approved.length === 1 ? "" : "s"} asignado
                      {t.approved.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </header>
                {t.approved.length === 0 ? (
                  <p className="text-[0.8125rem] text-mist">Sin clientes asignados todavía.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {t.approved.map((c) => (
                      <li key={c.key} className="rounded-full bg-cloud px-3 py-1 text-[0.75rem] text-ink">
                        {c.name}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

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
