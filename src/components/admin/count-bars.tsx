import { cn } from "@/lib/utils";

/**
 * Gráfico de barras para conteos (reservas, visitas). Sin librerías externas.
 * Cada barra tiene su valor escrito y una descripción para lectores de pantalla.
 */
export function CountBars({
  data,
  label,
  emptyText = "Sin registros para este período.",
}: {
  data: { label: string; value: number; highlight?: boolean }[];
  label: string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...data.map((d) => (Number.isFinite(d.value) ? d.value : 0)));
  const total = data.reduce((sum, d) => sum + (Number.isFinite(d.value) ? d.value : 0), 0);

  return (
    <section className="min-w-0" aria-label={label}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">{label}</p>
        <p className="text-[0.75rem] text-mist">
          Total: <span className="font-semibold text-ink">{total}</span>
        </p>
      </div>

      {data.length === 0 || total === 0 ? (
        <p className="py-8 text-sm text-fog">{emptyText}</p>
      ) : (
        <div className="flex h-44 items-end gap-2" role="list">
          {data.map((d) => {
            const value = Number.isFinite(d.value) ? d.value : 0;
            const pct = Math.round((value / max) * 100);
            return (
              <div key={d.label} role="listitem" className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[0.6875rem] font-semibold text-ink">{value}</span>
                <div
                  className="flex w-full flex-1 items-end"
                  role="img"
                  aria-label={`${d.label}: ${value}`}
                >
                  <div
                    aria-hidden="true"
                    className={cn(
                      "w-full rounded-t-md transition-[height]",
                      d.highlight ? "bg-brand" : "bg-brand/55",
                    )}
                    style={{ height: value === 0 ? 2 : `${Math.max(4, pct)}%` }}
                  />
                </div>
                <span className="text-[0.6875rem] text-fog">{d.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
