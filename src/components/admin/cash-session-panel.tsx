"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, CheckCircle2, LockKeyhole, RefreshCw, ShieldAlert } from "lucide-react";
import { formatMoney } from "@/lib/finance/format-money";
import {
  CASH_HISTORY_LIMIT,
  CASH_NOTES_MAX,
  cashDifference,
  cashError,
  cashNeedsReason,
  cashNotesProblem,
  markExpectedFill,
  parseCashAmount,
  parseCashState,
  type CashSession,
  type CashState,
} from "@/lib/finance/cash-session";
import { cn } from "@/lib/utils";

/**
 * Cierre y arqueo de caja (FIN-04), dentro de la pantalla de Caja.
 *
 * Tres pasos, cada uno con una sola decisión:
 *   1. Abrir: cuánto efectivo hay al empezar (queda a nombre de quien abre).
 *   2. Contar: cuánto hay al cerrar, moneda por moneda.
 *   3. Cerrar: la base compara lo contado con lo esperado y guarda la
 *      diferencia; si no cuadra, exige el motivo por escrito.
 *
 * La pantalla no calcula el arqueo definitivo: muestra lo que la base ya
 * calculó (`expectedNio`, `expectedUsd`) y el navegador solo adelanta el mismo
 * número para que se vea antes de confirmar. Los permisos, la caja única y el
 * motivo obligatorio los vuelve a comprobar la base.
 */

interface AccountOption {
  id: string;
  name: string;
  currency: "NIO" | "USD";
}

const dateTime = (value: string) =>
  new Date(value).toLocaleString("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Managua",
  });

const dateOnly = (value: string) =>
  new Date(value).toLocaleDateString("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Managua",
  });

/** Diferencia con su lectura en palabras: falta, sobra o cuadra. */
function differenceLabel(difference: number, currency: "NIO" | "USD"): string {
  if (difference === 0) return "Cuadra exacto";
  return difference < 0
    ? `Falta ${formatMoney(Math.abs(difference), currency)}`
    : `Sobra ${formatMoney(difference, currency)}`;
}

function differenceTone(difference: number): string {
  return difference === 0 ? "text-brand-300" : "text-alert";
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper/60 p-3">
      <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-fog uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[0.6875rem] text-fog">{hint}</p> : null}
    </div>
  );
}

export function CashSessionPanel({
  accounts,
  canPrefillExpected = false,
}: {
  accounts: AccountOption[];
  /**
   * `true` sólo para administración. «Usar lo esperado» rellena el arqueo con
   * el número que la base ya calcula, así que un faltante deja de verse y deja
   * de tener motivo. El cajero escribe lo que contó y justifica la diferencia.
   */
  canPrefillExpected?: boolean;
}) {
  const [state, setState] = useState<CashState | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [busy, setBusy] = useState<"open" | "close" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [openNio, setOpenNio] = useState("");
  const [openUsd, setOpenUsd] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [countedNio, setCountedNio] = useState("");
  const [countedUsd, setCountedUsd] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const accountName = (id: string) =>
    accounts.find((account) => account.id === id)?.name ?? id;

  // Se lee al abrir el módulo y cada vez que se pide «Reintentar» o se guarda
  // un cambio. Nunca se pone «no hay caja» cuando en realidad no se pudo leer.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/finance/cash", {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    })
      .then((response) => response.json().catch(() => null))
      .then((body: unknown) => {
        const next = parseCashState(body);
        if (!next) {
          const code =
            body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string"
              ? (body as { code: string }).code
              : "CASH_STATE_UNREADABLE";
          setErrorCode(code);
          setLoad("error");
          return;
        }
        setState(next);
        setErrorCode(null);
        setLoad("ready");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string } | null)?.name === "AbortError") return;
        setErrorCode("SIN_RESPUESTA");
        setLoad("error");
      });
    return () => controller.abort();
  }, [reload]);

  const retry = () => {
    setLoad("loading");
    setReload((value) => value + 1);
  };

  const refresh = () => setReload((value) => value + 1);

  async function send(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/finance/cash", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || (body as { ok?: unknown }).ok !== true) {
      const code =
        body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string"
          ? (body as { code: string }).code
          : "UNKNOWN";
      const mapped = cashError(code);
      const message =
        body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
          ? (body as { message: string }).message
          : mapped.message;
      setFormError(message);
      return false;
    }
    return true;
  }

  async function handleOpen(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    const nio = parseCashAmount(openNio);
    if (!nio.ok) return setFormError(nio.message);
    const usd = parseCashAmount(openUsd);
    if (!usd.ok) return setFormError(usd.message);
    setBusy("open");
    const ok = await send({
      action: "open",
      requestId: crypto.randomUUID(),
      openNio: nio.value,
      openUsd: usd.value,
      notes: openNotes.trim().slice(0, CASH_NOTES_MAX),
    });
    setBusy(null);
    if (!ok) return;
    setOpenNio("");
    setOpenUsd("");
    setOpenNotes("");
    setNotice("Caja abierta. Ahora todo cobro y gasto de efectivo se suma o se resta solo.");
    refresh();
  }

  const openSession = state?.open ?? null;

  const expectedNio = openSession?.expectedNio ?? 0;
  const expectedUsd = openSession?.expectedUsd ?? 0;
  const countedNioValue = parseCashAmount(countedNio, { required: true });
  const countedUsdValue = parseCashAmount(countedUsd, { required: true });
  const bothCounted = countedNioValue.ok && countedUsdValue.ok;
  const liveDifferenceNio = bothCounted ? cashDifference(expectedNio, countedNioValue.value) : null;
  const liveDifferenceUsd = bothCounted ? cashDifference(expectedUsd, countedUsdValue.value) : null;
  const needsReason =
    bothCounted &&
    cashNeedsReason(
      { nio: expectedNio, usd: expectedUsd },
      { nio: countedNioValue.value, usd: countedUsdValue.value },
    );

  async function handleClose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    if (!openSession) return;
    if (!countedNioValue.ok) return setFormError(countedNioValue.message);
    if (!countedUsdValue.ok) return setFormError(countedUsdValue.message);
    const needed =
      cashDifference(expectedNio, countedNioValue.value) !== 0 ||
      cashDifference(expectedUsd, countedUsdValue.value) !== 0;
    const notesProblem = cashNotesProblem(closeNotes, needed);
    if (notesProblem) return setFormError(notesProblem);
    setBusy("close");
    const ok = await send({
      action: "close",
      requestId: crypto.randomUUID(),
      sessionId: openSession.id,
      countedNio: countedNioValue.value,
      countedUsd: countedUsdValue.value,
      notes: closeNotes.trim().slice(0, CASH_NOTES_MAX),
    });
    setBusy(null);
    if (!ok) return;
    setCountedNio("");
    setCountedUsd("");
    setCloseNotes("");
    setNotice("Caja cerrada. El arqueo quedó guardado y ya no se puede cambiar.");
    refresh();
  }

  const fieldClass =
    "w-full min-w-0 rounded-lg border border-line bg-paper px-3 py-2.5 text-ink outline-none focus:border-brand";
  const labelClass = "block text-sm font-medium text-ink";

  const history = state?.history ?? [];

  if (load === "loading" && !state) {
    return (
      <p className="rounded-2xl border border-line bg-card p-5 text-sm text-fog" role="status">
        Leyendo la caja…
      </p>
    );
  }

  if (load === "error") {
    return (
      <div className="space-y-3 rounded-2xl border border-alert/40 bg-card p-5">
        <p className="flex items-center gap-2 font-semibold text-alert">
          <ShieldAlert className="size-5" aria-hidden="true" />
          No pudimos leer el estado de la caja
        </p>
        <p className="text-sm text-fog">
          No es que no haya caja abierta: es que la lectura falló. No abras ni
          cierres nada hasta poder ver el estado real.
        </p>
        <p className="text-xs text-fog">Código: {errorCode ?? "SIN_RESPUESTA"}</p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {notice ? (
        <p className="rounded-xl border border-brand/40 bg-brand-soft p-3 text-sm text-brand-300" role="status">
          {notice}
        </p>
      ) : null}
      {formError ? (
        <p className="rounded-xl border border-alert/40 bg-card p-3 text-sm text-alert" role="alert">
          {formError}
        </p>
      ) : null}

      {openSession ? (
        <>
          {/* ---------- Caja abierta y lo esperado ---------- */}
          <section className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-ink">Caja abierta</h3>
                <p className="text-sm text-fog">
                  La abrió {openSession.openedByName ?? "—"} el{" "}
                  {dateTime(openSession.openedAt)}.
                </p>
              </div>
              <span className="rounded-full border border-brand/40 bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-300">
                Turno en curso
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure
                label="Apertura NIO"
                value={formatMoney(openSession.openingNio)}
                hint="Con lo que empezó el turno"
              />
              <Figure
                label="Apertura USD"
                value={formatMoney(openSession.openingUsd, "USD")}
                hint="Con lo que empezó el turno"
              />
              <Figure
                label="Ingresos de efectivo · NIO"
                value={formatMoney(openSession.movements.incomeNio)}
                hint={`Dólares: ${formatMoney(openSession.movements.incomeUsd, "USD")}`}
              />
              <Figure
                label="Ingresos de efectivo · USD"
                value={formatMoney(openSession.movements.incomeUsd, "USD")}
                hint="Cada moneda se cuenta aparte"
              />
              <Figure
                label="Egresos de efectivo · NIO"
                value={formatMoney(openSession.movements.expenseNio)}
                hint={`Dólares: ${formatMoney(openSession.movements.expenseUsd, "USD")}`}
              />
              <Figure
                label="Egresos de efectivo · USD"
                value={formatMoney(openSession.movements.expenseUsd, "USD")}
                hint="Cada moneda se cuenta aparte"
              />
              <Figure
                label="Transferencias · NIO"
                value={formatMoney(
                  openSession.movements.transferInNio - openSession.movements.transferOutNio,
                )}
                hint={`Entró ${formatMoney(openSession.movements.transferInNio)} · salió ${formatMoney(
                  openSession.movements.transferOutNio,
                )}`}
              />
              <Figure
                label="Transferencias · USD"
                value={formatMoney(
                  openSession.movements.transferInUsd - openSession.movements.transferOutUsd,
                  "USD",
                )}
                hint={`Entró ${formatMoney(
                  openSession.movements.transferInUsd,
                  "USD",
                )} · salió ${formatMoney(openSession.movements.transferOutUsd, "USD")}`}
              />
              <Figure
                label="Debería haber NIO"
                value={formatMoney(openSession.expectedNio)}
                hint="Apertura + ingresos − egresos ± transferencias"
              />
              <Figure
                label="Debería haber USD"
                value={formatMoney(openSession.expectedUsd, "USD")}
                hint="Apertura + ingresos − egresos ± transferencias"
              />
              <Figure
                label="Movimientos de caja"
                value={String(openSession.movements.count)}
                hint="Solo efectivo, desde la apertura"
              />
              <Figure
                label="Nota del turno"
                value={openSession.notes ?? "Sin nota"}
                hint="Escrita al abrir"
              />
            </div>

            {openSession.movements.accounts.length > 0 ? (
              <div className="rounded-xl border border-line bg-paper/60 p-3">
                <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-fog uppercase">
                  De dónde sale cada número
                </p>
                <ul className="mt-2 space-y-1 text-sm text-fog">
                  {openSession.movements.accounts.map((row) => (
                    <li key={`${row.accountId}-${row.currency}`} className="flex flex-wrap justify-between gap-2">
                      <span className="text-ink">{accountName(row.accountId)}</span>
                      <span>
                        Entró {formatMoney(row.income, row.currency === "USD" ? "USD" : "NIO")} · Salió{" "}
                        {formatMoney(row.expense, row.currency === "USD" ? "USD" : "NIO")}
                        {row.transferIn > 0 || row.transferOut > 0
                          ? ` · Transferencias: entró ${formatMoney(
                              row.transferIn,
                              row.currency === "USD" ? "USD" : "NIO",
                            )}, salió ${formatMoney(row.transferOut, row.currency === "USD" ? "USD" : "NIO")}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-fog">
                Todavía no hay movimientos de efectivo en este turno. Lo que se
                cobre o gaste en efectivo desde ahora aparece acá.
              </p>
            )}
          </section>

          {/* ---------- Contar y cerrar ---------- */}
          <form onSubmit={handleClose} className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
            <div>
              <h3 className="text-lg font-bold text-ink">Contar y cerrar</h3>
              <p className="text-sm text-fog">
                Contá el efectivo que hay ahora mismo en la caja —billetes y
                monedas, nada más— y escribí el total de cada moneda. Al cerrar,
                la base compara con lo que debería haber y guarda la diferencia.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Contaste en córdobas (C$)
                <input
                  className={cn(fieldClass, "mt-1")}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={countedNio}
                  onChange={(event) => setCountedNio(event.target.value)}
                />
              </label>
              <label className={labelClass}>
                Contaste en dólares (US$)
                <input
                  className={cn(fieldClass, "mt-1")}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={countedUsd}
                  onChange={(event) => setCountedUsd(event.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {canPrefillExpected ? (
                <button
                  type="button"
                  onClick={() => {
                    setCountedNio(expectedNio.toFixed(2));
                    setCountedUsd(expectedUsd.toFixed(2));
                    setCloseNotes((current) => markExpectedFill(current));
                    setFormError(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
                >
                  <ArrowLeftRight className="size-4" aria-hidden="true" />
                  Usar lo esperado
                </button>
              ) : null}
              {bothCounted ? (
                <p className="text-sm">
                  <span className={differenceTone(liveDifferenceNio ?? 0)}>
                    Córdobas: {differenceLabel(liveDifferenceNio ?? 0, "NIO")}
                  </span>
                  {" · "}
                  <span className={differenceTone(liveDifferenceUsd ?? 0)}>
                    Dólares: {differenceLabel(liveDifferenceUsd ?? 0, "USD")}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-fog">
                  Escribí las dos monedas (podés poner 0) para ver si cuadra.
                </p>
              )}
            </div>

            {canPrefillExpected ? (
              <p className="rounded-xl border border-line bg-paper/60 px-4 py-3 text-[0.8125rem] text-fog">
                «Usar lo esperado» rellena lo contado con lo que debería haber
                —para cuando ya contaste y coincide— y deja la constancia en la
                nota del cierre. Si la diferencia es real, no lo uses: escribí
                lo que contaste y el motivo.
              </p>
            ) : (
              <p className="rounded-xl border border-line bg-paper/60 px-4 py-3 text-[0.8125rem] text-fog">
                Escribí lo que contaste. Si falta o sobra, el motivo es
                obligatorio y el arqueo queda con la diferencia a la vista en
                «Últimos cierres»; el faltante no se puede tapar rellenando con
                lo esperado.
              </p>
            )}

            <label className={labelClass}>
              {needsReason ? "Motivo del faltante o sobrante (obligatorio)" : "Nota del cierre (opcional)"}
              <textarea
                className={cn(fieldClass, "mt-1 min-h-20 resize-y")}
                maxLength={CASH_NOTES_MAX}
                placeholder={
                  needsReason
                    ? "Ejemplo: faltaron C$40, no se pudo dar vuelto en un cobro."
                    : "Ejemplo: turno sin novedades."
                }
                value={closeNotes}
                onChange={(event) => setCloseNotes(event.target.value)}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-onbrand transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
                {busy === "close" ? "Cerrando…" : "Cerrar caja y guardar arqueo"}
              </button>
              <p className="text-xs text-fog">
                El arqueo se guarda una sola vez: después no se puede modificar.
              </p>
            </div>
          </form>
        </>
      ) : (
        /* ---------- Abrir ---------- */
        <form onSubmit={handleOpen} className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <div>
            <h3 className="text-lg font-bold text-ink">Abrir la caja</h3>
            <p className="text-sm text-fog">
              No hay ninguna caja abierta. Antes de cobrar, contá el efectivo que
              hay en la caja en este momento y escribí el total de cada moneda:
              ese número es el punto de partida del turno. Después, los cobros y
              gastos en efectivo se suman o se restan solos.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Efectivo inicial en córdobas (C$)
              <input
                className={cn(fieldClass, "mt-1")}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={openNio}
                onChange={(event) => setOpenNio(event.target.value)}
              />
            </label>
            <label className={labelClass}>
              Efectivo inicial en dólares (US$)
              <input
                className={cn(fieldClass, "mt-1")}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={openUsd}
                onChange={(event) => setOpenUsd(event.target.value)}
              />
            </label>
          </div>

          <label className={labelClass}>
            Nota del turno (opcional)
            <input
              className={cn(fieldClass, "mt-1")}
              maxLength={CASH_NOTES_MAX}
              placeholder="Ejemplo: turno de la mañana"
              value={openNotes}
              onChange={(event) => setOpenNotes(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-onbrand transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {busy === "open" ? "Abriendo…" : "Abrir caja"}
            </button>
            <p className="text-xs text-fog">
              Solo puede haber una caja abierta a la vez.
            </p>
          </div>
        </form>
      )}

      {/* ---------- Historial de arqueos ---------- */}
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div>
          <h3 className="text-lg font-bold text-ink">Últimos cierres</h3>
          <p className="text-sm text-fog">
            Cada cierre guarda lo contado, lo esperado y la diferencia. Se
            muestran los últimos {CASH_HISTORY_LIMIT}; no se borra ninguno.
          </p>
        </div>
        {history.length === 0 ? (
          <p className="py-3 text-sm text-fog">
            Todavía no cerraste ninguna caja. Cuando cierres la primera, aparece
            acá con su arqueo.
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((session: CashSession) => {
              const diffNio = session.differenceNio ?? 0;
              const diffUsd = session.differenceUsd ?? 0;
              const cuadra = diffNio === 0 && diffUsd === 0;
              return (
                <li key={session.id} className="rounded-xl border border-line bg-paper/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{dateOnly(session.openedAt)}</p>
                      <p className="text-xs text-fog">
                        {session.openedByName ?? "—"} abrió ·{" "}
                        {session.closedByName ?? "—"} cerró el{" "}
                        {session.closedAt ? dateTime(session.closedAt) : "—"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        cuadra
                          ? "border-brand/40 bg-brand-soft text-brand-300"
                          : "border-alert/40 bg-card text-alert",
                      )}
                    >
                      {cuadra ? "Cuadró" : "Con diferencia"}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fog sm:grid-cols-4">
                    <div>
                      <dt>Contado NIO</dt>
                      <dd className="font-semibold text-ink">
                        {formatMoney(session.countedNio ?? 0)}
                      </dd>
                    </div>
                    <div>
                      <dt>Esperado NIO</dt>
                      <dd className="text-ink">{formatMoney(session.expectedNio)}</dd>
                    </div>
                    <div>
                      <dt>Contado USD</dt>
                      <dd className="font-semibold text-ink">
                        {formatMoney(session.countedUsd ?? 0, "USD")}
                      </dd>
                    </div>
                    <div>
                      <dt>Esperado USD</dt>
                      <dd className="text-ink">{formatMoney(session.expectedUsd, "USD")}</dd>
                    </div>
                  </dl>
                  {cuadra ? null : (
                    <p className="mt-2 text-xs font-semibold text-alert">
                      {differenceLabel(diffNio, "NIO")} · {differenceLabel(diffUsd, "USD")}
                    </p>
                  )}
                  {session.closeNotes ? (
                    <p className="mt-1 text-xs text-fog">Motivo: {session.closeNotes}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
