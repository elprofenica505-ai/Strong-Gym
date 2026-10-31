"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance/format-money";
import type { Currency } from "@/lib/data/queries";
import {
  VOID_REASON_MAX,
  VOID_REASON_MIN,
  parseVoidReceipt,
  voidMessage,
  type VoidReceipt,
} from "@/lib/finance/voids";

/** Lo que devuelve `finance_void_plan` para un movimiento concreto. */
interface VoidPlan {
  transactionId: string;
  concept: string;
  type: string;
  amount: number;
  currency: string;
  occurredAt: string;
  accountId: string;
  isReversal: boolean;
  alreadyVoided: boolean;
  voidedAt: string | null;
  allowed: boolean;
  code: string;
}

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "00000000-0000-4000-8000-000000000000";
  }
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
 * base en `finance_void_movement`; esta pantalla solo pide el motivo y muestra
 * el comprobante de la reversa.
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
  const router = useRouter();
  const [plan, setPlan] = useState<VoidPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<VoidReceipt | null>(null);
  // El pedido no se cambia al reintentar: la base reconoce el mismo `requestId`
  // y devuelve el comprobante guardado en vez de anular dos veces.
  const [requestId] = useState(newRequestId);
  const [unconfirmed, setUnconfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/finance/void?transaction=${encodeURIComponent(transactionId)}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as
          | (VoidPlan & { error?: string; message?: string })
          | null;
        if (cancelled) return;
        if (!res.ok || !json || "error" in json) {
          setLoadError(json?.message ?? voidMessage(json?.error ?? "UNKNOWN"));
          return;
        }
        setPlan(json);
      } catch {
        if (!cancelled) setLoadError("No hay conexión. Cerrá y volvé a intentar.");
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
  const reasonOk = trimmed.length >= VOID_REASON_MIN && trimmed.length <= VOID_REASON_MAX;
  const blocked = busy || !plan?.allowed || !reasonOk;

  async function confirm() {
    if (blocked) return;
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    try {
      const res = await fetch("/api/admin/finance/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, reason: trimmed, requestId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; receipt?: unknown; error?: string; message?: string }
        | null;
      if (!res.ok || !json?.ok) {
        const code = json?.error;
        // Sin código claro, o con un código que no explica el motivo, no se
        // sabe si quedó guardada: se dice así y se ofrece reintentar.
        const unknown = !code || code === "UNKNOWN" || code === "UNCONFIRMED";
        setUnconfirmed(unknown);
        setError(json?.message ?? voidMessage(code ?? "UNCONFIRMED"));
        return;
      }
      const parsed = parseVoidReceipt(json.receipt);
      if (!parsed) {
        setUnconfirmed(true);
        setError(voidMessage("UNCONFIRMED"));
        return;
      }
      setReceipt(parsed);
      router.refresh();
    } catch {
      setError("No hay conexión. No se anuló nada; volvé a intentar.");
    } finally {
      setBusy(false);
    }
  }

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
              {receipt ? "Anulación registrada" : "Anular este movimiento"}
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

        {receipt ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-2xl border border-brand/40 bg-brand-soft p-3 text-[0.8125rem] text-brand-300">
              No se borró nada: se registró una reversa por el mismo importe en la
              misma cuenta. El movimiento original queda en el historial.
            </p>
            <dl className="space-y-1.5 rounded-2xl border border-line bg-card p-4 text-[0.8125rem]">
              <Row label="Movimiento original" value={receipt.originalConcept} />
              <Row
                label="Reversa"
                value={`${formatMoney(receipt.amount, receipt.currency as Currency)} · ${receipt.reversalId.slice(0, 8)}`}
              />
              <Row label="Cuenta" value={receipt.accountName} />
              <Row
                label="Saldo de la cuenta"
                value={`${formatMoney(receipt.accountBefore, receipt.currency as Currency)} → ${formatMoney(receipt.accountAfter, receipt.currency as Currency)}`}
              />
              {receipt.stockRestored && receipt.stockRestored.length > 0 && (
                <Row
                  label="Stock devuelto"
                  value={receipt.stockRestored
                    .map((item) => `${item.name} ×${item.qty}`)
                    .join(" · ")}
                />
              )}
              <Row label="Motivo" value={receipt.reason} />
              <Row label="Quién" value={receipt.actorName} />
              <Row label="Cuándo" value={localDateTime(receipt.occurredAt)} />
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-onbrand"
              >
                Volver a Caja
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
              >
                Imprimir comprobante
              </button>
            </div>
          </div>
        ) : (
          <>
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

            {plan?.allowed && (
              <div className="mt-4">
                <label
                  htmlFor="void-reason"
                  className="text-sm font-semibold text-ink"
                >
                  Motivo de la anulación
                </label>
                <textarea
                  id="void-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  maxLength={VOID_REASON_MAX}
                  placeholder="Ejemplo: el cobro se cargó a la cuenta equivocada"
                  className="mt-1.5 w-full rounded-2xl border border-line bg-card p-3 text-[0.875rem] text-ink outline-none focus:border-brand"
                />
                <div className="mt-1 flex items-center justify-between text-[0.6875rem] text-fog">
                  <span>
                    Mínimo {VOID_REASON_MIN} caracteres; queda guardado con tu
                    nombre y la fecha.
                  </span>
                  <span>{trimmed.length}/{VOID_REASON_MAX}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-2xl border border-alert/40 bg-night-3 p-3 text-[0.8125rem] text-alert">
                <p>{error}</p>
                {unconfirmed && (
                  <p className="mt-2 text-mist">
                    Antes de reintentar podés mirar Caja: si la reversa ya está
                    en el historial, la anulación se hizo y no hace falta
                    repetirla.
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={blocked}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold",
                  blocked
                    ? "cursor-not-allowed bg-night-3 text-fog"
                    : "bg-alert text-white",
                )}
              >
                {busy
                  ? "Anulando…"
                  : unconfirmed
                    ? "Reintentar la anulación"
                    : "Anular y generar reversa"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-fog">{label}</dt>
      <dd className="text-right font-medium break-words text-ink">{value}</dd>
    </div>
  );
}
