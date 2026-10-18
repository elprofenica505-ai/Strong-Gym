"use client";

import { useState, type FormEvent } from "react";
import type { TrainerRosterRow } from "@/lib/data/queries";

interface SearchResult {
  clientId: string;
  fullName: string;
  myStatus: string | null;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

const STATUS_TEXT: Record<string, string> = {
  pending: "Pedido enviado. Espera la aprobación del administrador.",
  approved: "Asignado a vos.",
};

/**
 * Vista del entrenador: sus clientes asignados con asistencia y, si el
 * administrador lo permite, búsqueda por nombre para pedir acceso. Sin contacto.
 */
export function TrainerClientsPanel({
  initialRoster,
  searchEnabled,
}: {
  initialRoster: TrainerRosterRow[];
  searchEnabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function call(payload: unknown): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; message: string }> {
    try {
      const response = await fetch("/api/trainer/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) return { ok: false, message: (body?.message as string) ?? "No se pudo completar." };
      return { ok: true, body: body ?? {} };
    } catch {
      return { ok: false, message: "Sin conexión. Intentá de nuevo." };
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) {
      setNotice({ tone: "error", text: "Escribí al menos 3 letras del nombre." });
      return;
    }
    setBusy("search");
    setNotice(null);
    const result = await call({ action: "search", query: q });
    setBusy(null);
    if (!result.ok) {
      setResults(null);
      setNotice({ tone: "error", text: result.message });
      return;
    }
    setResults((result.body.results as SearchResult[]) ?? []);
  }

  async function request(item: SearchResult) {
    setBusy(item.clientId);
    setNotice(null);
    const result = await call({ action: "request", clientId: item.clientId });
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return;
    }
    setResults((prev) =>
      (prev ?? []).map((r) => (r.clientId === item.clientId ? { ...r, myStatus: "pending" } : r)),
    );
    setNotice({ tone: "ok", text: `Pedido enviado para ${item.fullName}. Lo aprueba el administrador.` });
  }

  return (
    <div className="flex flex-col gap-8">
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

      <section aria-labelledby="asignados-titulo" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="asignados-titulo" className="text-[1rem] font-semibold text-ink">
            Clientes asignados
          </h2>
          <p className="text-[0.75rem] text-fog">
            {initialRoster.length} {initialRoster.length === 1 ? "cliente" : "clientes"}
          </p>
        </div>

        {initialRoster.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[0.875rem] text-mist">
            Todavía no tenés clientes asignados.
            {searchEnabled ? " Buscá un cliente abajo y pedí acceso." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[24rem] text-left text-[0.875rem]">
              <thead className="bg-cloud text-[0.6875rem] font-semibold tracking-[0.12em] text-fog uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">Cliente</th>
                  <th scope="col" className="px-4 py-3">Hoy</th>
                  <th scope="col" className="px-4 py-3">Últimos 30 días</th>
                </tr>
              </thead>
              <tbody>
                {initialRoster.map((row) => (
                  <tr key={row.clientId} className="border-t border-line">
                    <td className="px-4 py-3 text-ink">{row.fullName}</td>
                    <td className="px-4 py-3">
                      {row.visitedToday ? (
                        <span className="font-semibold text-brand">Asistió</span>
                      ) : (
                        <span className="text-fog">Sin asistencia</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-mist">
                      {row.visits30d} {row.visits30d === 1 ? "visita" : "visitas"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="pedir-titulo" className="flex flex-col gap-3">
        <h2 id="pedir-titulo" className="text-[1rem] font-semibold text-ink">
          Pedir acceso a otro cliente
        </h2>

        {!searchEnabled ? (
          <p className="rounded-xl border border-line bg-card px-4 py-3 text-[0.8125rem] text-mist">
            El administrador desactivó por ahora la búsqueda de clientes. Si lo necesitás, pedile que la active.
          </p>
        ) : (
          <>
            <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex w-full max-w-sm flex-col gap-1.5 text-[0.75rem] font-semibold text-fog">
                Nombre del cliente (mínimo 3 letras)
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10 rounded-xl border border-line bg-card px-3 text-[0.875rem] text-ink"
                  placeholder="Ej.: Ana"
                  maxLength={60}
                />
              </label>
              <button
                type="submit"
                disabled={busy === "search"}
                className="h-10 rounded-xl bg-brand px-5 text-[0.875rem] font-semibold text-white disabled:opacity-50"
              >
                Buscar
              </button>
            </form>

            {results ? (
              results.length === 0 ? (
                <p className="text-[0.8125rem] text-mist">No encontramos clientes activos con ese nombre.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                  {results.map((item) => {
                    const done = item.myStatus === "pending" || item.myStatus === "approved";
                    return (
                      <li key={item.clientId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[0.875rem] text-ink">{item.fullName}</p>
                          {item.myStatus ? (
                            <p className="text-[0.75rem] text-fog">{STATUS_TEXT[item.myStatus] ?? item.myStatus}</p>
                          ) : null}
                        </div>
                        {done ? null : (
                          <button
                            type="button"
                            disabled={busy === item.clientId}
                            onClick={() => request(item)}
                            className="h-9 rounded-lg border border-brand px-3 text-[0.8125rem] font-semibold text-brand disabled:opacity-50"
                          >
                            Pedir acceso
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
