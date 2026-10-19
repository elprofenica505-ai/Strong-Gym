import { formatMoney } from "@/lib/finance/format-money";
import type { CashSummary } from "@/lib/data/queries";

/** Indicadores de caja del día y del mes. Recibe cifras ya confirmadas por la base. */
export function FinanceKpis({ summary }: { summary: CashSummary }) {
  const items = [
    { label: "Ingresos del mes", value: formatMoney(summary.incomeMonth) },
    { label: "Egresos del mes", value: formatMoney(summary.expenseMonth) },
    { label: "Saldo del mes", value: formatMoney(summary.netMonth) },
    { label: "Ingresos de hoy", value: formatMoney(summary.incomeToday) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-2xl border border-brand/25 bg-brand/[0.04] p-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-fog uppercase">{i.label}</p>
          <p className="mt-2 font-display text-[1.375rem] leading-none text-ink">{i.value}</p>
        </div>
      ))}
    </div>
  );
}
