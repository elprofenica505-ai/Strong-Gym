import { FinanceUnavailable } from "@/components/admin/finance-unavailable";
import { readFinance } from "@/lib/finance/read-result";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart3, Wallet } from "lucide-react";
import {
  getCurrentUser,
  getMonthlyPnl,
  getPaymentMethodsBreakdown,
} from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { formatMoney } from "@/components/admin/cash-panel";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Reportes",
    robots: { index: false, follow: false },
  };
}

export default async function ReportesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupabaseConfigured) {
    return (
      <Placeholder
        title="Reportes"
        message="Conectá Supabase para ver la ganancia/pérdida de cada mes y el desglose por método de pago."
        locale={locale}
      />
    );
  }
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "staff")) {
    redirect(`/${locale}/mi-cuenta`);
  }

  const result = await readFinance(() =>
    Promise.all([getMonthlyPnl(12), getPaymentMethodsBreakdown()]),
  );
  if (!result.ok)
    return (
      <FinanceUnavailable
        locale={locale}
        code={result.code}
        message={result.message}
      />
    );
  const [pnl, methods] = result.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/panel`}
          className="grid size-10 place-items-center rounded-full border border-line text-mist transition-colors hover:border-brand hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <span className="eyebrow">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            Caja · Reportes
          </span>
          <h1 className="display-xl mt-2 text-[1.75rem] sm:text-[2.25rem]">
            Ganancias y pérdidas
          </h1>
        </div>
      </div>

      <p className="text-sm text-fog">Importes consolidados NIO guardados en los movimientos completados; no se usa una tasa nueva. Las transferencias no son ingresos ni gastos. Estos resultados no certifican saldos de cuentas.</p>
      <div className="overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-left text-[0.8125rem]">
          <thead className="bg-card-2 text-[0.6875rem] uppercase tracking-wider text-fog">
            <tr>
              <th className="px-4 py-3 font-semibold">Mes</th>
              <th className="px-4 py-3 text-right font-semibold">Ingresos</th>
              <th className="px-4 py-3 text-right font-semibold">Egresos</th>
              <th className="px-4 py-3 text-right font-semibold">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pnl.map((m) => (
              <tr key={m.month} className="bg-card">
                <td className="px-4 py-3 font-mono text-ink">
                  {m.month.slice(0, 7)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-brand-300">
                  {formatMoney(m.incomeNio)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-fog">
                  {formatMoney(m.expenseNio)}
                </td>
                <td
                  className={
                    "px-4 py-3 text-right font-mono font-semibold tabular-nums " +
                    (m.netNio >= 0 ? "text-brand" : "text-alert")
                  }
                >
                  {formatMoney(m.netNio)}
                </td>
              </tr>
            ))}
            {pnl.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-fog">
                  Sin movimientos en los últimos 12 meses.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">
          Desglose por método de pago
        </h2>
        <p className="mt-1 text-[0.75rem] text-fog">
          Qué método se usa más para cobrar en el gimnasio.
        </p>
        {methods.length === 0 ? (
          <p className="py-6 text-center text-[0.875rem] text-fog">
            Sin datos.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {methods.map((m) => (
              <li
                key={`${m.paymentMethodId ?? "none"}-${m.nameEs}`}
                className="flex items-center justify-between rounded-lg border border-line bg-card-2 px-3 py-2"
              >
                <span className="text-[0.875rem] font-medium text-ink">
                  {m.nameEs ?? "Otros"}
                </span>
                <span className="font-mono text-[0.875rem] font-semibold text-brand-300 tabular-nums">
                  {formatMoney(m.totalNio)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Placeholder({
  title,
  message,
  locale,
}: {
  title: string;
  message: string;
  locale: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/panel`}
          className="grid size-10 place-items-center rounded-full border border-line text-mist transition-colors hover:border-brand hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="display-xl text-[1.75rem] sm:text-[2.25rem]">{title}</h1>
      </div>
      <div className="rounded-2xl border border-dashed border-brand/35 bg-brand-soft p-6 text-center">
        <BarChart3 className="mx-auto size-8 text-brand-300" />
        <p className="mt-3 text-[0.875rem] text-fog">{message}</p>
      </div>
    </div>
  );
}
