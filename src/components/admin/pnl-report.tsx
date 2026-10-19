import { formatMoney } from "@/lib/finance/format-money";

/**
 * Resumen oficial de la base (legado): resultado mensual y movimientos por método.
 * Se conserva tal cual para no cambiar lo ya revisado. "Volumen" no es resultado.
 */
export function PnlReport({
  pnl,
  methods,
}: {
  pnl: { month: string; incomeNio: number; expenseNio: number; netNio: number }[];
  methods: {
    paymentMethodId: string | null;
    nameEs: string | null;
    icon?: string;
    txCount: number;
    totalNio: number;
    incomeNio: number;
    expenseNio: number;
  }[];
}) {
  return (
    <div className="min-w-0 space-y-6">
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
