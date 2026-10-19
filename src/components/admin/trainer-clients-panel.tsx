"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Dumbbell, Search, UserPlus, Users } from "lucide-react";
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

const MAX_VISITS_BAR = 30;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Vista del entrenador: resumen de sus clientes, tarjetas con asistencia reciente
 * y, si el administrador lo permite, búsqueda por nombre para pedir acceso.
 * Sin teléfono, correo ni notas: la base ya no los entrega.
 */
export function TrainerClientsPanel({
  initialRoster,
  searchEnabled,
}: {
  initialRoster: TrainerRosterRow[];
  searchEnabled: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Las asignaciones y aprobaciones del administrador aparecen al volver a la pantalla, sin recargar a mano.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
  const [refreshing, setRefreshing] = useState(false);
  function refreshNow() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const attendedToday = initialRoster.filter((r) => r.visitedToday).length;
  const totalVisits = initialRoster.reduce((sum, r) => sum + r.visits30d, 0);
  const averageVisits = initialRoster.length ? Math.round((totalVisits / initialRoster.length) * 10) / 10 : 0;

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

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={Users} label="Clientes asignados" value={initialRoster.length} />
        <SummaryCard icon={CalendarCheck} label="Asistieron hoy" value={attendedToday} accent />
        <SummaryCard icon={Dumbbell} label="Visitas en 30 días" value={totalVisits} />
        <SummaryCard icon={Users} label="Promedio por cliente" value={averageVisits} />
      </section>

      <section aria-labelledby="asignados-titulo" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="asignados-titulo" className="text-[1rem] font-semibold text-ink">
            Tus clientes
          </h2>
          <button
            type="button"
            onClick={refreshNow}
            disabled={refreshing}
            className="h-8 rounded-lg border border-line px-3 text-[0.75rem] font-semibold text-mist hover:text-ink disabled:opacity-50"
          >
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        {initialRoster.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[0.875rem] text-mist">
            Todavía no tenés clientes asignados.
            {searchEnabled ? " Buscá un cliente abajo y pedí acceso." : ""}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...initialRoster]
              .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"))
              .map((row) => {
                const pct = Math.min(100, Math.round((row.visits30d / MAX_VISITS_BAR) * 100));
                return (
                  <li key={row.clientId} className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-[0.875rem] font-bold text-brand">
                        {initials(row.fullName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.9375rem] font-semibold text-ink">{row.fullName}</p>
                        {row.visitedToday ? (
                          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-brand">
                            Asistió hoy
                          </span>
                        ) : (
                          <span className="mt-0.5 inline-flex rounded-full bg-cloud px-2 py-0.5 text-[0.6875rem] font-semibold text-fog">
                            Sin asistencia hoy
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between text-[0.75rem] text-mist">
                        <span>Visitas, últimos 30 días</span>
                        <span className="font-semibold text-ink">
                          {row.visits30d} {row.visits30d === 1 ? "visita" : "visitas"}
                        </span>
                      </div>
                      <div
                        className="mt-2 h-2 overflow-hidden rounded-full bg-cloud"
                        role="img"
                        aria-label={`${row.visits30d} visitas en 30 días`}
                      >
                        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section aria-labelledby="pedir-titulo" className="flex flex-col gap-3 rounded-2xl border border-line bg-cloud/50 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
            <UserPlus className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="pedir-titulo" className="text-[1rem] font-semibold text-ink">
              Pedir acceso a otro cliente
            </h2>
            <p className="text-[0.8125rem] text-mist">El administrador revisa cada pedido antes de asignarlo.</p>
          </div>
        </div>

        {!searchEnabled ? (
          <p className="rounded-xl border border-line bg-card px-4 py-3 text-[0.8125rem] text-mist">
            El administrador desactivó por ahora la búsqueda de clientes. Si lo necesitás, pedile que la active.
          </p>
        ) : (
          <>
            <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex w-full max-w-sm flex-col gap-1.5 text-[0.75rem] font-semibold text-fog">
                Nombre del cliente (mínimo 3 letras)
                <span className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fog" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-10 w-full rounded-xl border border-line bg-card pr-3 pl-9 text-[0.875rem] text-ink"
                    placeholder="Ej.: Ana"
                    maxLength={60}
                  />
                </span>
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
                <ul className="grid gap-3 sm:grid-cols-2">
                  {results.map((item) => {
                    const done = item.myStatus === "pending" || item.myStatus === "approved";
                    return (
                      <li key={item.clientId} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-4">
                        <div className="min-w-0">
                          <p className="truncate text-[0.875rem] font-semibold text-ink">{item.fullName}</p>
                          {item.myStatus ? (
                            <p className="text-[0.75rem] text-fog">{STATUS_TEXT[item.myStatus] ?? item.myStatus}</p>
                          ) : null}
                        </div>
                        {done ? null : (
                          <button
                            type="button"
                            disabled={busy === item.clientId}
                            onClick={() => request(item)}
                            className="h-9 shrink-0 rounded-lg border border-brand px-3 text-[0.8125rem] font-semibold text-brand disabled:opacity-50"
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

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <span className={accent ? "grid size-9 place-items-center rounded-xl bg-brand text-white" : "grid size-9 place-items-center rounded-xl bg-brand/10 text-brand"}>
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div>
        <p className="text-[1.625rem] leading-none font-bold text-ink tabular-nums">{value}</p>
        <p className="mt-1 text-[0.75rem] text-mist">{label}</p>
      </div>
    </div>
  );
}
