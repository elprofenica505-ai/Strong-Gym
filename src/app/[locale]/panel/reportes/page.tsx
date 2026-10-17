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
import { formatMoney } from "@/lib/finance/format-money";

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
    <div className="min-w-0 space-y-6">
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

      <p className="text-sm text-fog">
        Importes consolidados NIO guardados en los movimientos completados; no
        se usa una tasa nueva. Las transferencias no son ingresos ni gastos.
        Estos resultados no certifican saldos de cuentas.
      </p>
      <p className="text-xs text-fog sm:hidden">
        Deslizá la tabla horizontalmente para ver todas las columnas.
      </p>
      <div
        className="w-full min-w-0 max-w-full overflow-x-auto rounded-2xl border border-line"
        role="region"
        aria-label="Resultados mensuales en NIO · tabla desplazable"
        tabIndex={0}
      >
        <table className="w-full min-w-[32rem] whitespace-nowrap text-left text-[0.8125rem]">
          <caption className="sr-only">
            Resultados mensuales · equivalentes NIO guardados
          </caption>
          <thead className="bg-card-2 text-[0.6875rem] uppercase tracking-wider text-fog">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Mes
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Ingresos
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Egresos
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Resultado
              </th>
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
                  Sin resultados mensuales informados en esta consulta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">
          Movimientos por método · todo el historial
        </h2>
        <p className="mt-1 text-[0.75rem] text-fog">
          Movimientos completados en equivalentes NIO guardados. Volumen =
          ingresos + egresos; no es ganancia ni saldo de cuenta.
        </p>
        {methods.length === 0 ? (
          <p className="py-6 text-center text-[0.875rem] text-fog">
            Sin movimientos por método informados en esta consulta.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {methods.map((m) => (
              <li
                key={`${m.paymentMethodId ?? "none"}-${m.nameEs}`}
                className="min-w-0 rounded-lg border border-line bg-card-2 p-3"
              >
                <p className="break-words text-[0.875rem] font-medium text-ink">
                  {m.nameEs?.trim() || "Sin método informado"}
                </p>
                <p className="mt-1 text-xs text-fog">
                  {m.txCount} movimientos completados
                </p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-fog">Ingresos NIO</dt>
                    <dd className="font-mono text-sm tabular-nums text-ink">
                      {formatMoney(m.incomeNio)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog">Egresos NIO</dt>
                    <dd className="font-mono text-sm tabular-nums text-ink">
                      {formatMoney(m.expenseNio)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog">
                      Volumen NIO · no es resultado
                    </dt>
                    <dd className="font-mono text-sm tabular-nums text-mist">
                      {formatMoney(m.totalNio)}
                    </dd>
                  </div>
                </dl>
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
