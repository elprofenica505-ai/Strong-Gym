"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance/format-money";

/** Formato de valores. Texto plano: las funciones no cruzan de Server a Client Components. */
export type ChartFormat = "nio-compact" | "count";

function formatValue(value: number, kind: ChartFormat): string {
  return kind === "nio-compact" ? formatMoney(value, "NIO", { compact: true }) : String(value);
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  /** Clase Tailwind de color de fondo para las barras positivas. */
  tone: "brand" | "alert" | "ink";
  data: ChartPoint[];
}

const TONE_BAR: Record<ChartSeries["tone"], string> = {
  brand: "bg-brand",
  alert: "bg-alert",
  ink: "bg-ink",
};

const TONE_TEXT: Record<ChartSeries["tone"], string> = {
  brand: "text-brand",
  alert: "text-alert",
  ink: "text-ink",
};

/**
 * Gráfico de barras interactivo sin librerías: selector de serie, valor al pasar el
 * mouse o enfocar cada barra (teclado), y eje cero para valores negativos.
 * Cada barra expone su valor a lectores de pantalla. Los valores llegan ya calculados.
 */
export function InteractiveBarChart({
  title,
  series,
  format,
  emptyText = "Sin registros para mostrar.",
  countUnit,
}: {
  title: string;
  series: ChartSeries[];
  format: ChartFormat;
  emptyText?: string;
  /** Si se indica, el gráfico cuenta elementos y no muestra moneda. */
  countUnit?: string;
}) {
  const [activeId, setActiveId] = useState(series[0]?.id ?? "");
  const [hover, setHover] = useState<number | null>(null);
  const groupId = useId();
  const active = series.find((s) => s.id === activeId) ?? series[0];

  if (!active || active.data.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">{title}</p>
        <p className="py-10 text-center text-sm text-fog">{emptyText}</p>
      </div>
    );
  }

  const values = active.data.map((d) => (Number.isFinite(d.value) ? d.value : 0));
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const hasNegative = values.some((v) => v < 0);
  const total = values.reduce((a, b) => a + b, 0);
  const allZero = values.every((v) => v === 0);
  const focused = hover !== null ? active.data[hover] : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">{title}</p>
        {series.length > 1 ? (
          <div role="tablist" aria-label={`Series de ${title}`} className="flex flex-wrap gap-1.5">
            {series.map((s) => {
              const selected = s.id === active.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  id={`${groupId}-${s.id}`}
                  aria-selected={selected}
                  onClick={() => {
                    setActiveId(s.id);
                    setHover(null);
                  }}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[0.75rem] font-semibold transition-colors",
                    selected ? "border-ink bg-ink text-white" : "border-line text-mist hover:border-ink hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.75rem] text-mist">
          {focused ? (
            <>
              <span className="font-semibold text-ink">{focused.label}</span>:{" "}
              <span className={cn("font-semibold", TONE_TEXT[active.tone])}>
                {countUnit ? `${focused.value} ${countUnit}` : formatValue(focused.value, format)}
              </span>
            </>
          ) : (
            "Pasá el cursor sobre una barra para ver el valor"
          )}
        </p>
        <p className="text-[0.75rem] text-mist">
          Total: <span className="font-semibold text-ink">{countUnit ? `${total} ${countUnit}` : formatValue(total, format)}</span>
        </p>
      </div>

      {allZero ? (
        <p className="text-xs text-fog">Todos los valores de este período son cero.</p>
      ) : null}

      <div
        className="relative flex h-52 items-stretch gap-2 sm:gap-3"
        role="list"
        aria-label={`${title}: ${active.label}`}
        onMouseLeave={() => setHover(null)}
      >
        {hasNegative ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line" aria-hidden />
        ) : null}
        {active.data.map((d, i) => {
          const v = values[i];
          const pct = Math.max(3, Math.round((Math.abs(v) / max) * (hasNegative ? 46 : 100)));
          const isHover = hover === i;
          const label = countUnit ? `${v} ${countUnit}` : formatValue(v, format);
          return (
            <div
              key={`${d.label}-${i}`}
              role="listitem"
              tabIndex={0}
              aria-label={`${d.label}: ${label}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className={cn(
                "group relative flex min-w-0 flex-1 cursor-default flex-col rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand",
                hasNegative ? "justify-center" : "justify-end",
              )}
            >
              {isHover ? (
                <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-[0.6875rem] font-semibold whitespace-nowrap text-white shadow-lg">
                  {d.label}: {label}
                </span>
              ) : null}
              {hasNegative ? (
                <div className="flex h-1/2 flex-col justify-end">
                  {v > 0 ? (
                    <div
                      aria-hidden
                      className={cn("w-full rounded-t-md transition-all duration-300", TONE_BAR[active.tone], isHover ? "opacity-100" : "opacity-80")}
                      style={{ height: `${pct * 2}%` }}
                    />
                  ) : null}
                </div>
              ) : null}
              {hasNegative ? (
                <div className="flex h-1/2 flex-col justify-start">
                  {v < 0 ? (
                    <div
                      aria-hidden
                      className={cn("w-full rounded-b-md bg-alert transition-all duration-300", isHover ? "opacity-100" : "opacity-80")}
                      style={{ height: `${pct * 2}%` }}
                    />
                  ) : null}
                </div>
              ) : (
                <div
                  aria-hidden
                  className={cn("w-full rounded-t-md transition-all duration-300", TONE_BAR[active.tone], isHover ? "opacity-100" : "opacity-75")}
                  style={{ height: v === 0 ? 2 : `${pct}%` }}
                />
              )}
              <span className={cn("mt-2 text-center text-[0.6875rem]", isHover ? "font-semibold text-ink" : "text-fog")}>
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
