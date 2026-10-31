"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Undo2, X } from "lucide-react";
import { formatMoney } from "@/lib/finance/format-money";
import type { Currency } from "@/lib/data/queries";
import {
  VOID_REASON_MAX,
  VOID_REASON_MIN,
  parseVoidPlan,
  voidMessage,
  type VoidPlan,
} from "@/lib/finance/voids";

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "00000000-0000-4000-8000-000000000000";
  }
}

function currentLocale(): string {
  if (typeof window === "undefined") return "es";
  const first = window.location.pathname.split("/").filter(Boolean)[0];
  return first === "en" || first === "es" ? first : "es";
}

function localDateTime(value: string): string {
  return new Date(value).toLocaleString("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Managua",
  });
}

/**
 * Anular un cobro o un gasto sin borrarlo.
 *
 * El botón solo se muestra cuando el servidor dice que el rol puede anular.
 * La decisión final (rol, MFA, interruptor, dueño y día) la vuelve a tomar la
 * base en `finance_void_movement`.
 *
 * La confirmación es un **formulario del navegador**, no una llamada que
 * espera un JSON: al enviarlo, el servidor anula y redirige a la página de
 * resultado, que lee la base. Así el resultado no se pierde cuando la
 * respuesta de datos no llega completa en el celular — que es exactamente lo
 * que pasaba antes: la anulación se guardaba y la pantalla mostraba un error.
 */
export function VoidMovementButton({
  transactionId,
  concept,
  amount,
  currency,
  disabled,
}: {
  transactionId: string;
  concept: string;
  amount: number;
  currency: Currency;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[0.6875rem] font-semibold text-mist transition-colors hover:border-alert/70 hover:text-alert disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Undo2 className="size-3" aria-hidden="true" />
        Anular
      </button>
      {open && (
        <VoidDialog
          transactionId={transactionId}
          concept={concept}
          amount={amount}
          currency={currency}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function VoidDialog({
  transactionId,
  concept,
  amount,
  currency,
  onClose,
}: {
  transactionId: string;
  concept: string;
  amount: number;
  currency: Currency;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<VoidPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [requestId] = useState(newRequestId);
  const [locale] = useState(currentLocale);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/finance/void?transaction=${encodeURIComponent(transactionId)}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as
          | (Record<string, unknown> & { error?: string; message?: string })
          | null;
        if (cancelled) return;
        if (!res.ok || !json || "error" in json) {
          // Sin la consulta previa no se bloquea nada: la base decide y la
          // página de resultado explica el motivo si no se puede anular.
          setLoadError(json?.message ?? voidMessage(json?.error ?? "UNKNOWN"));
          return;
        }
        setPlan(parseVoidPlan(json));
      } catch {
        if (!cancelled)
          setLoadError(
            "No pudimos leer el estado de este movimiento. Podés intentar la anulación igual: la base decide y te cuenta el resultado en la pantalla siguiente.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = reason.trim();
  const reasonOk =
    trimmed.length >= VOID_REASON_MIN && trimmed.length <= VOID_REASON_MAX;
  // Solo se bloquea cuando la base ya dijo que no se puede anular.
  const blocked = !reasonOk || Boolean(plan && !plan.allowed);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-night/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="void-title"
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-line bg-paper p-5 text-ink shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-bold tracking-[0.18em] text-brand-300 uppercase">
              Caja · Anulación
            </p>
            <h2 id="void-title" className="display-xl mt-1 text-[1.375rem]">
              Anular este movimiento
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full border border-line p-2 text-mist transition-colors hover:border-brand hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-card p-4">
          <p className="font-medium text-ink">{plan?.concept ?? concept}</p>
          <p className="mt-1 font-mono text-[0.9375rem] font-semibold tabular-nums text-mist">
            {plan?.type === "expense" ? "−" : "+"}
            {formatMoney(plan?.amount ?? amount, (plan?.currency ?? currency) as Currency)}
          </p>
          {plan?.occurredAt && (
            <p className="mt-1 text-[0.75rem] text-fog">{localDateTime(plan.occurredAt)}</p>
          )}
        </div>

        {loadError && (
          <p className="mt-3 rounded-2xl border border-alert/40 bg-night-3 p-3 text-[0.8125rem] text-alert">
            {loadError}
          </p>
        )}

        {plan && !plan.allowed && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl border border-alert/40 bg-night-3 p-3 text-[0.8125rem] text-alert">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{voidMessage(plan.code)}</span>
          </p>
        )}

        <form
          method="post"
          action="/api/admin/finance/void"
          className="mt-4 space-y-3"
        >
          <input type="hidden" name="transactionId" value={transactionId} />
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="locale" value={locale} />
          <div>
            <label htmlFor="void-reason" className="text-sm font-semibold text-ink">
              Motivo de la anulación
            </label>
            <textarea
              id="void-reason"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={VOID_REASON_MAX}
              minLength={VOID_REASON_MIN}
              required
              placeholder="Ejemplo: el cobro se cargó a la cuenta equivocada"
              className="mt-1.5 w-full rounded-2xl border border-line bg-card p-3 text-[0.875rem] text-ink outline-none focus:border-brand"
            />
            <div className="mt-1 flex items-center justify-between text-[0.6875rem] text-fog">
              <span>
                Mínimo {VOID_REASON_MIN} caracteres; queda guardado con tu
                nombre y la fecha.
              </span>
              <span>
                {trimmed.length}/{VOID_REASON_MAX}
              </span>
            </div>
          </div>

          <p className="rounded-2xl border border-line bg-card p-3 text-[0.75rem] text-fog">
            Al confirmar, la base registra la reversa y te muestra el resultado
            en su propia pantalla. Nada se borra: el movimiento original queda
            en el historial.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={blocked}
              className="rounded-full bg-alert px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-fog"
            >
              Anular y generar reversa
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
