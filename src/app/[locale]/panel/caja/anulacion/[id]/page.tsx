import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";
import { FinanceUnavailable } from "@/components/admin/finance-unavailable";
import { PrintReceipt } from "@/components/admin/print-receipt";
import { canManageFinance, isFinanceRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { formatMoney } from "@/lib/finance/format-money";
import { FinanceReadError, readFinance } from "@/lib/finance/read-result";
import {
  VOID_REASON_MAX,
  VOID_REASON_MIN,
  findStoredVoidReceipt,
  voidOutcome,
} from "@/lib/finance/voids";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resultado de la anulación",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function localDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Resultado de una anulación, armado en el servidor.
 *
 * Por qué existe: la anulación se escribe bien en la base, pero en el celular
 * la respuesta del cobro puede no llegar completa. Cuando eso pasaba, la
 * pantalla decía «no pudimos confirmar» aunque el dinero y el stock ya estaban
 * movidos, y el movimiento seguía viéndose igual en Caja.
 *
 * Esta página no recibe el resultado: lo **lee de la base**. Si la anulación
 * está guardada, muestra su comprobante; si no está, lo dice y ofrece
 * intentarlo otra vez. No hay cuerpo de respuesta que se pueda perder, porque
 * es una página y no un dato.
 */
export default async function VoidResultPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  const user = await getCurrentUser();
  if (!canManageFinance(user)) {
    if (user && isFinanceRole(user.role)) redirect(`/${locale}/panel/caja`);
    redirect(`/${locale}/mi-cuenta`);
  }
  if (!UUID_RE.test(id)) notFound();

  const db = await getSupabaseServerClient();
  if (!db) {
    return (
      <FinanceUnavailable
        locale={locale}
        code="FIN_VOID_UNAVAILABLE"
        message="La anulación solo aplica con la base conectada. No interpretes este aviso como que no se anuló nada."
      />
    );
  }

  const loaded = await readFinance(async () => {
    const [plan, receipt] = await Promise.all([
      db.rpc("finance_void_plan", { p_transaction: id }),
      findStoredVoidReceipt(db, id),
    ]);
    if (plan.error) {
      const code = (plan.error.message ?? "").trim().toUpperCase();
      if (code.startsWith("AUTH")) throw new FinanceReadError("VOID", "AUTH");
      if (code.startsWith("NOT_FOUND")) return { plan: null, receipt: null };
      throw new FinanceReadError("VOID", plan.error.code);
    }
    return { plan: plan.data, receipt };
  });

  const backToCash = (
    <Link
      href={`/${locale}/panel/caja`}
      className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Volver a Caja
    </Link>
  );

  if (!loaded.ok) {
    return (
      <div className="container-x min-w-0 space-y-6 py-6">
        <Heading />
        <FinanceUnavailable
          locale={locale}
          code={loaded.code}
          message={`${loaded.message} Si el aviso sigue, probá de nuevo desde Caja en unos minutos: acá no se borró nada.`}
        />
        {backToCash}
      </div>
    );
  }

  const outcome = voidOutcome(loaded.data.plan, loaded.data.receipt);

  if (outcome.kind === "done") {
    const r = outcome.receipt;
    const money = r.currency as "NIO" | "USD";
    const rows: [string, string][] = [
      ["Movimiento original", r.originalConcept],
      ["Reversa", `${formatMoney(r.amount, money)} · ${r.reversalId.slice(0, 8)}`],
      ["Cuenta", r.accountName],
      [
        "Saldo de la cuenta",
        `${formatMoney(r.accountBefore, money)} → ${formatMoney(r.accountAfter, money)}`,
      ],
      ["Motivo", r.reason],
      ["Quién", r.actorName],
      ["Cuándo", localDateTime(r.occurredAt)],
    ];
    if (r.stockRestored && r.stockRestored.length) {
      rows.splice(4, 0, [
        "Stock devuelto",
        r.stockRestored.map((item) => `${item.name} ×${item.qty}`).join(" · "),
      ]);
    }

    return (
      <div className="container-x min-w-0 space-y-6 py-6">
        <Heading />
        <div className="flex flex-wrap gap-3">{backToCash}</div>
        <section className="space-y-4 rounded-3xl border border-brand/40 bg-brand-soft p-5" aria-labelledby="anulacion-hecha">
          <p className="flex items-center gap-2 text-[0.7rem] font-bold tracking-[0.16em] text-brand-300 uppercase">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Caja · Anulación
          </p>
          <h2 id="anulacion-hecha" className="display-xl text-[1.5rem]">
            La anulación quedó guardada
          </h2>
          <p className="text-[0.875rem] text-ink">
            No se borró nada: se registró una reversa por el mismo importe en la
            misma cuenta y el movimiento original sigue en el historial.
          </p>
          <dl className="space-y-2 rounded-2xl border border-line bg-card p-4 text-[0.8125rem]">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-2">
                <dt className="text-fog">{label}</dt>
                <dd className="text-right font-medium break-words text-ink [overflow-wrap:anywhere]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/${locale}/panel/comprobantes/${r.reversalId}`}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-onbrand"
            >
              Ver comprobante de la reversa
            </Link>
            <PrintReceipt />
          </div>
        </section>
      </div>
    );
  }

  // No quedó guardada (o no se pudo leer). Se explica por qué y, si la base
  // permite, se ofrece reintentar con el mismo formulario de Caja.
  return (
    <div className="container-x min-w-0 space-y-6 py-6">
      <Heading />
      <div className="flex flex-wrap gap-3">{backToCash}</div>
      <section className="space-y-4 rounded-3xl border border-line bg-card p-5" aria-labelledby="anulacion-pendiente">
        <p className="flex items-center gap-2 text-[0.7rem] font-bold tracking-[0.16em] text-alert uppercase">
          <ShieldAlert className="size-4" aria-hidden="true" />
          Caja · Anulación
        </p>
        <h2 id="anulacion-pendiente" className="display-xl text-[1.5rem]">
          {/* El título no puede afirmar más que el dato: si no se pudo leer el
              estado, se dice eso, no que la anulación no se hizo. */}
          {outcome.kind === "unknown"
            ? "Todavía no pudimos leer si quedó guardada"
            : outcome.canRetry
              ? "La anulación no quedó guardada"
              : "Esta anulación no se hizo"}
        </h2>
        <p className="text-[0.875rem] text-ink">{outcome.message}</p>
        {outcome.kind === "not_done" && (
          <p className="font-mono text-[0.6875rem] text-fog">Código: {outcome.code}</p>
        )}
        {outcome.kind === "not_done" && outcome.canRetry && (
          <form
            method="post"
            action="/api/admin/finance/void"
            className="space-y-3 rounded-2xl border border-line bg-paper p-4"
          >
            <input type="hidden" name="transactionId" value={id} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="requestId" value={crypto.randomUUID()} />
            <label htmlFor="void-reason-retry" className="block text-sm font-semibold text-ink">
              Motivo de la anulación
            </label>
            <textarea
              id="void-reason-retry"
              name="reason"
              rows={3}
              maxLength={VOID_REASON_MAX}
              required
              minLength={VOID_REASON_MIN}
              placeholder="Ejemplo: el cobro se cargó a la cuenta equivocada"
              className="w-full rounded-2xl border border-line bg-card p-3 text-[0.875rem] text-ink outline-none focus:border-brand"
            />
            <p className="text-[0.6875rem] text-fog">
              Mínimo {VOID_REASON_MIN} caracteres; queda guardado con tu nombre y
              la fecha. Si la anulación ya se hubiera guardado, la base no la
              repite.
            </p>
            <button
              type="submit"
              className="rounded-full bg-alert px-4 py-2 text-sm font-semibold text-white"
            >
              Anular ahora
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function Heading() {
  return (
    <div>
      <span className="eyebrow">
        <span className="h-px w-6 bg-brand" aria-hidden="true" />
        Caja · Anulación
      </span>
      <h1 className="display-xl mt-2 text-[1.75rem] sm:text-[2.25rem]">
        Resultado de la anulación
      </h1>
    </div>
  );
}
