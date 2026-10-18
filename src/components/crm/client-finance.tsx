import { Button } from "@/components/ui/button";
import { readClientFinance, readClientPayments } from "@/lib/crm/client-finance";
import type { ClientDetail } from "@/lib/crm/types";

export function ClientFinanceSummary({ detail, pending, stale, retry, disabled }: {
  detail: ClientDetail; pending: boolean; stale: boolean; retry: () => void; disabled: boolean;
}) {
  const finance = readClientFinance(detail.finance, detail.client.id, detail.client.profile_id);
  const problem = !finance || stale;
  return (
    <section aria-label="Saldo y cobros del cliente" className="space-y-4 rounded-xl border border-line p-4 text-sm text-fog">
      <h3 className="font-bold text-ink">Saldo y cobros del cliente</h3>
      {pending ? <p role="status">Confirmando saldo y cobros…</p>
        : problem ? <div role="alert" className="space-y-2">
          <p>No pudimos confirmar el saldo y los totales de cobros de esta ficha. No equivale a cero ni confirma que esté al día.</p>
          <p className="break-all font-mono text-xs">CRM_FINANCE_READ_UNCONFIRMED</p>
          <p>Si la lectura sigue incompleta, falta revisar la actualización de lectura financiera; no creés otra ficha ni repitás cobros.</p>
          <Button variant="outline" disabled={disabled} onClick={retry}>Reintentar saldo y cobros</Button>
        </div> : <>
          {finance.balance_status === "ready" && finance.balances ? <div className="space-y-1">
            <h4 className="font-semibold text-ink">{finance.source === "client" ? "Créditos y deudas de esta ficha" : "Créditos y deudas de la cuenta vinculada"}</h4>
            <p>Crédito NIO: C$ {finance.balances.credit_nio.toFixed(2)}</p>
            <p>Deuda NIO: C$ {finance.balances.debt_nio.toFixed(2)}</p>
            <p>Crédito USD: US$ {finance.balances.credit_usd.toFixed(2)}</p>
            <p>Deuda USD: US$ {finance.balances.debt_usd.toFixed(2)}</p>
            <p>Valores guardados por separado. No se compensan ni convierten automáticamente.</p>
          </div> : finance.balance_status === "ready" && finance.balance_nio !== null ? <p>
            Saldo legado de cuenta vinculada: C$ {finance.balance_nio.toFixed(2)} (+ a favor / − deuda). Este modelo sólo registra un saldo neto en NIO; no informa saldos separados en USD.
          </p> : finance.balance_status === "unlinked" ? <p>
            Ficha sin cuenta web vinculada. Sus cobros se identifican por esta ficha; no hay un saldo de cuenta vinculado para consultar. No significa que esté al día.
          </p> : finance.balance_status === "missing" ? <p>
            Cuenta web vinculada, pero sin registro de saldo. No se creó un saldo cero ni se dedujo deuda a partir de los cobros. Falta conciliar y registrar el saldo inicial antes de informarlo.
          </p> : <p role="alert">Estructura financiera no reconocida. No se pueden confirmar saldos ni totales.</p>}
          {finance.collections && <div className="space-y-1 border-t border-line pt-3">
            <h4 className="font-semibold text-ink">Cobros completados registrados · todo el historial</h4>
            <p>Córdobas: C$ {finance.collections.amount_nio.toFixed(2)} · {finance.collections.count_nio} {finance.collections.count_nio === 1 ? "cobro" : "cobros"}</p>
            <p>Dólares: US$ {finance.collections.amount_usd.toFixed(2)} · {finance.collections.count_usd} {finance.collections.count_usd === 1 ? "cobro" : "cobros"}</p>
            <p>Importes en su moneda original, sin conversión. Excluye pendientes, cancelados/revertidos y egresos. No es el saldo del cliente ni el dinero disponible en Caja.</p>
            {finance.layout === "bank_accounts_split" && <p>Los cobros por servicio actuales no abonan deudas, crean crédito ni renuevan planes automáticamente.</p>}
          </div>}
          <p>El saldo no bloquea entradas automáticamente. Asignar un plan no confirma pago ni vigencia.</p>
        </>}
    </section>
  );
}

export function ClientIncomeHistory({ detail, pending, stale }: {
  detail: ClientDetail; pending: boolean; stale: boolean;
}) {
  const finance = readClientFinance(detail.finance, detail.client.id, detail.client.profile_id);
  const payments = readClientPayments(detail.payments);
  return <div>
    <h3 className="mb-3 text-lg font-bold">Últimos 40 ingresos registrados</h3>
    <p className="mb-3 text-xs text-fog">Incluye estados no completados. Esta lista no es un saldo ni el total de cobros completados.</p>
    {pending ? <p role="status">Confirmando ingresos…</p>
      : stale || !finance || finance.layout === "unsupported" || !payments ? <p role="alert">Historial de ingresos no confirmado. Reintentá la ficha; no repitás cobros.</p>
      : payments.length === 0 ? <p className="text-fog">Sin ingresos registrados para esta ficha.</p>
      : <ul className="space-y-2 text-sm">{payments.map(payment => <li key={payment.id} className="rounded-lg border border-line p-3">
        <p>{payment.currency} {payment.amount.toFixed(2)} · {payment.concept}</p>
        <p className="text-xs text-fog">{new Intl.DateTimeFormat("es-NI", {dateStyle:"medium",timeStyle:"short",timeZone:"America/Managua"}).format(new Date(payment.occurred_at))} · {{completed:"Completado",pending:"Pendiente",cancelled:"Cancelado",reversed:"Revertido"}[payment.status]}</p>
        <p className="break-all text-xs text-fog">Referencia: {payment.id}</p>
      </li>)}</ul>}
  </div>;
}
