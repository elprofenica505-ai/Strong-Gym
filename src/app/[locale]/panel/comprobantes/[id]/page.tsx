import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canAccessPanel } from "@/lib/auth/current-user";
import { receiptSchema } from "@/lib/finance/movements";
import { FinanceUnavailable } from "@/components/admin/finance-unavailable";
import { formatMoney } from "@/lib/finance/format-money";
import { PrintReceipt } from "@/components/admin/print-receipt";
import { isLocale } from "@/i18n/config";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Comprobante interno",
  robots: { index: false, follow: false },
};
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  if (!canAccessPanel(await getCurrentUser())) redirect(`/${locale}/mi-cuenta`);
  if (!receiptSchema.shape.id.safeParse(id).success) notFound();
  const db = await getSupabaseServerClient();
  let receipt;
  try {
    if (!db) throw new Error("NO_DB");
    const { data, error } = await db
      .rpc("finance_receipt", { p_id: id })
      .abortSignal(AbortSignal.timeout(15000));
    if (error) throw error;
    receipt = receiptSchema.parse(data);
  } catch {
    return (
      <FinanceUnavailable
        locale={locale}
        code="FIN_RECEIPT_UNAVAILABLE"
        message="No se pudo leer este comprobante. Los movimientos anteriores a la nueva escritura pueden existir en el historial sin este comprobante. No repitas el cobro o gasto por este aviso."
      />
    );
  }
  const r = receipt;
  const when = new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(r.occurredAt));
  const rows = [
    ["Fecha · Managua", when],
    ["Concepto", r.concept],
    ["Cliente", r.clientName ?? "No aplica"],
    ["Categoría", r.categoryName ?? "No aplica"],
    ["Cuenta", r.accountName],
    ["Método", r.methodName],
    ["Registrado por", `${r.actorName ?? "Personal"} · ${r.actorId}`],
    ["Tasa NIO por 1 USD", String(r.fx)],
    ["Equivalente NIO guardado", formatMoney(r.amountNio, "NIO")],
    [
      "Equivalente USD guardado",
      new Intl.NumberFormat("es-NI", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }).format(r.amountUsd),
    ],
    ["Saldo informado antes", formatMoney(r.accountBefore, r.currency)],
    ["Saldo informado después", formatMoney(r.accountAfter, r.currency)],
    ...(r.kind === "debt_payment" ? [["Deuda antes del abono", r.debtBefore === undefined ? "No confirmada" : formatMoney(r.debtBefore, r.currency)],
      ["Deuda después del abono", r.debtAfter === undefined ? "No confirmada" : formatMoney(r.debtAfter, r.currency)]] : []),
    ...(r.cashReceived!==undefined&&r.changeGiven!==undefined?[
      ["Efectivo recibido",formatMoney(r.cashReceived,r.currency)],
      ["Vuelto entregado",formatMoney(r.changeGiven,r.currency)],
      [r.kind === "debt_payment" ? "Abono aplicado · ingreso neto en Caja" : "Cobro aplicado · ingreso neto en Caja",
        formatMoney(r.amount,r.currency)],
    ]:[]),
    ["Referencia del intento", r.requestId],
  ];
  return (
    <article className="container-x min-w-0 space-y-6 py-6 receipt-document">
      <style>{`@media print { header, footer, nav, aside, .receipt-actions { display:none!important } body { background:white!important;color:black!important } main { padding:0!important } .receipt-document { position:absolute;inset:0;max-width:100%;background:white;color:black;padding:24px } .receipt-document * { color:black!important;border-color:#ddd!important } }`}</style>
      <div className="receipt-actions flex flex-wrap gap-4 text-brand-300 underline">
        <Link href={`/${locale}/panel/caja`}>Volver a Caja</Link>
        <PrintReceipt />
      </div>
      <h1 className="display-xl text-3xl">
        Comprobante interno ·{" "}
        {r.kind === "expense" ? "Gasto" : r.kind === "debt_payment" ? "Abono de deuda" : "Cobro por servicio"}
      </h1>
      <p className="break-all text-sm text-fog">{r.reference}</p>
      <p className="font-mono text-2xl font-semibold">
        {formatMoney(r.amount, r.currency)}
      </p>
      <p className="text-sm text-fog">
        Movimiento completado. No es factura fiscal. Datos guardados al
        registrar; no se recalculan con nombres o tasas actuales.
      </p>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-xl border border-line p-3"
          >
            <dt className="text-sm text-fog">{label}</dt>
            <dd className="mt-1 break-words text-ink [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {r.accountAfter < 0 && (
        <p className="text-alert">
          El saldo informado de la cuenta quedó negativo. Requiere revisión;
          este comprobante no certifica un arqueo.
        </p>
      )}
      <p className="text-sm text-fog">
        {r.kind==='debt_payment' ? `Este abono reduce la deuda por el importe aplicado.${r.cashReceived!==undefined?' El efectivo recibido menos el vuelto es el ingreso neto en Caja.':''} No crea crédito ni compensa monedas.` : `Este comprobante registra un cobro por servicio.${r.cashReceived!==undefined?' El efectivo recibido menos el vuelto es el ingreso neto en Caja.':''} No aplica ni compensa deudas o créditos.`} No renueva planes ni
        descuenta comisiones automáticamente. Los saldos son informados, no
        saldos iniciales conciliados por el dueño.
      </p>
    </article>
  );
}
