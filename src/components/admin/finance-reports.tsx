"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatMoney } from "@/lib/finance/format-money";
import {
  KIND_LABEL,
  commissionsByMethod,
  dailyClose,
  monthlyComparison,
  pendingPayments,
  type DebtEntryRow,
  type LedgerRow,
  type PendingClient,
} from "@/lib/reports/finance-report";
import type { FinanceReportData } from "@/lib/reports/load";
import { MasterExportButton } from "./master-export-button";

type Tab = "dia" | "mes" | "pendientes" | "comisiones";
type Selection =
  | { type: "movement"; row: LedgerRow }
  | { type: "month"; month: string }
  | { type: "client"; clientId: string }
  | { type: "method"; methodName: string }
  | null;

const TABS: { id: Tab; label: string }[] = [
  { id: "dia", label: "Cierre del día" },
  { id: "mes", label: "Comparativo mensual" },
  { id: "pendientes", label: "Pagos pendientes" },
  { id: "comisiones", label: "Comisiones" },
];

const nio = (n: number) => formatMoney(n, "NIO");
const usd = (n: number) => formatMoney(n, "USD");
const time = (iso: string) =>
  new Intl.DateTimeFormat("es-NI", { timeZone: "America/Managua", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
const shiftDay = (day: string, delta: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

export function FinanceReports({ data, today }: { data: FinanceReportData; today: string }) {
  const [tab, setTab] = useState<Tab>("dia");
  const [selection, setSelection] = useState<Selection>(null);
  const [day, setDay] = useState(today);

  const rows = data.rows;
  const pending = useMemo(() => pendingPayments(data.debtEntries), [data.debtEntries]);

  const pick = (s: Selection) => setSelection((cur) => (JSON.stringify(cur) === JSON.stringify(s) ? null : s));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Reportes">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setSelection(null);
            }}
            className={`rounded-full border px-4 py-2 text-[0.8125rem] font-semibold transition-colors ${
              tab === t.id ? "border-brand bg-brand text-onbrand" : "border-line bg-card text-mist hover:border-brand hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dia" ? (
        <DayTab rows={rows} day={day} setDay={setDay} today={today} selection={selection} pick={pick} />
      ) : null}
      {tab === "mes" ? <MonthTab rows={rows} today={today} selection={selection} pick={pick} /> : null}
      {tab === "pendientes" ? <PendingTab pending={pending} selection={selection} pick={pick} /> : null}
      {tab === "comisiones" ? <CommissionTab rows={rows} selection={selection} pick={pick} /> : null}

      <p className="text-[0.75rem] leading-relaxed text-fog">
        Actualizado: {dateTime(data.generatedAt)} (Managua). Las cifras consolidadas en NIO usan la tasa manual guardada en cada movimiento.
        Las comisiones son estimadas y no se descuentan de la caja. Los saldos de deuda se muestran por moneda, sin convertir.
      </p>
    </div>
  );
}

/* ---------- Piezas comunes ---------- */

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-2xl border border-brand/25 bg-brand/[0.04] p-4">
      <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-fog uppercase">{label}</p>
      <p
        className={`mt-2 font-display text-[1.25rem] leading-none sm:text-[1.5rem] ${
          tone === "neg" ? "text-red-400" : tone === "pos" ? "text-emerald-400" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function BarList({ items, format }: { items: { label: string; value: number; sub?: string; onClick?: () => void; active?: boolean }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  if (items.length === 0) return <p className="text-[0.8125rem] text-fog">Sin datos en este período.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="truncate text-ink">{i.label}</span>
              <span className="shrink-0 font-semibold text-ink">{format(i.value)}</span>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-line/60">
              <div className="h-full rounded-full bg-brand" style={{ width: `${(Math.abs(i.value) / max) * 100}%` }} />
            </div>
            {i.sub ? <p className="mt-1 text-[0.6875rem] text-fog">{i.sub}</p> : null}
          </>
        );
        return (
          <li key={i.label}>
            {i.onClick ? (
              <button type="button" onClick={i.onClick} aria-pressed={i.active} className={`w-full rounded-xl p-2 text-left transition-colors hover:bg-brand/[0.06] ${i.active ? "bg-brand/[0.08]" : ""}`}>
                {body}
              </button>
            ) : (
              <div className="p-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ColumnChart({ data }: { data: { label: string; income: number; expense: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  return (
    <div className="flex h-56 items-end gap-2 overflow-x-auto pb-6" role="img" aria-label="Ingresos y egresos por mes">
      {data.map((d) => (
        <div key={d.label} className="flex h-full min-w-[3.25rem] flex-1 flex-col items-center justify-end gap-1">
          <div className="flex h-full w-full items-end justify-center gap-1">
            <div className="w-1/2 max-w-[1.25rem] rounded-t bg-emerald-400/80" style={{ height: `${(d.income / max) * 100}%` }} title={`Ingresos ${nio(d.income)}`} />
            <div className="w-1/2 max-w-[1.25rem] rounded-t bg-red-400/80" style={{ height: `${(d.expense / max) * 100}%` }} title={`Egresos ${nio(d.expense)}`} />
          </div>
          <span className="text-[0.625rem] text-fog">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ children, onClick, active, label }: { children: React.ReactNode; onClick?: () => void; active?: boolean; label?: string }) {
  const base = `rounded-2xl border bg-card p-4 text-left transition-colors ${active ? "border-brand" : "border-line"}`;
  if (!onClick) return <div className={base}>{children}</div>;
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={`${base} w-full hover:border-brand`}>
      {children}
    </button>
  );
}

function DetailCard({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-brand/50 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="font-display text-[1.125rem] text-ink">{title}</h3>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle" className="grid size-8 place-items-center rounded-full border border-line text-mist hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
      {children}
    </section>
  );
}

function Fields({ items }: { items: [string, string | number | null | undefined][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-[0.8125rem] sm:grid-cols-2">
      {items
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[0.6875rem] tracking-[0.1em] text-fog uppercase">{k}</dt>
            <dd className="mt-0.5 break-words text-ink">{String(v)}</dd>
          </div>
        ))}
    </dl>
  );
}

function MovementDetail({ row, onClose }: { row: LedgerRow; onClose: () => void }) {
  return (
    <DetailCard title={row.type === "income" ? "Detalle del ingreso" : "Detalle del gasto"} onClose={onClose}>
      <Fields
        items={[
          ["Fecha y hora", dateTime(row.occurredAt)],
          ["Origen", KIND_LABEL[row.kind]],
          ["Estado", row.status === "completed" ? "Completado" : row.status === "pending" ? "Pendiente" : "Anulado"],
          ["Cliente", row.clientName || null],
          ["Concepto", row.concept],
          ["Método", row.methodName],
          ["Cuenta", row.accountName],
          ["Categoría", row.categoryName || null],
          ["Monto original", `${row.currency === "USD" ? usd(row.amount) : nio(row.amount)}`],
          ["Tasa manual guardada", row.fxUsed ? `C$ ${row.fxUsed.toFixed(4)} por US$1` : null],
          ["Equivalente en NIO", nio(row.amountNio)],
          ["Efectivo recibido", row.cashReceived != null ? `${row.currency === "USD" ? usd(row.cashReceived) : nio(row.cashReceived)}` : null],
          ["Vuelto", row.changeGiven != null ? nio(row.changeGiven) : null],
          ["Deuda antes / después (NIO)", row.debtBefore != null ? `${nio(row.debtBefore)} → ${nio(row.debtAfter ?? 0)}` : null],
          ["Comisión estimada (no descontada)", row.commissionNio ? `${nio(row.commissionNio)} (${row.feePct}%)` : null],
          ["Referencia", row.reference],
          ["ID", row.id],
        ]}
      />
    </DetailCard>
  );
}

/* ---------- Pestaña: cierre del día ---------- */

function DayTab({
  rows,
  day,
  setDay,
  today,
  selection,
  pick,
}: {
  rows: LedgerRow[];
  day: string;
  setDay: (d: string) => void;
  today: string;
  selection: Selection;
  pick: (s: Selection) => void;
}) {
  const c = useMemo(() => dailyClose(rows, day), [rows, day]);
  const sel = selection?.type === "movement" ? selection.row : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setDay(shiftDay(day, -1))} aria-label="Día anterior" className="grid size-10 place-items-center rounded-full border border-line text-mist hover:border-brand hover:text-ink">
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="date"
          value={day}
          max={today}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="rounded-xl border border-line bg-card px-3 py-2 text-[0.875rem] text-ink"
          aria-label="Día del cierre"
        />
        <button type="button" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= today} aria-label="Día siguiente" className="grid size-10 place-items-center rounded-full border border-line text-mist hover:border-brand hover:text-ink disabled:opacity-40">
          <ChevronRight className="size-4" />
        </button>
        {day !== today ? (
          <button type="button" onClick={() => setDay(today)} className="text-[0.8125rem] text-brand underline-offset-4 hover:underline">
            Hoy
          </button>
        ) : null}
        <div className="ml-auto">
          <MasterExportButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ingresos del día" value={nio(c.incomeNio)} />
        <Kpi label="Egresos del día" value={nio(c.expenseNio)} />
        <Kpi label="Neto del día" value={nio(c.netNio)} tone={c.netNio < 0 ? "neg" : "pos"} />
        <Kpi label="Movimientos" value={String(c.count)} />
        <Kpi label="Efectivo recibido (NIO eq.)" value={nio(c.cashReceivedNio)} />
        <Kpi label="Vuelto entregado" value={nio(c.changeGivenNio)} />
        <Kpi label="Comisión estimada" value={nio(c.commissionNio)} />
        <Kpi label="Pendientes / anulados" value={`${c.pending.length} / ${c.cancelled.length}`} />
      </div>

      {sel ? <MovementDetail row={sel} onClose={() => pick(null)} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-card p-5">
          <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">Ingresos por método</h3>
          <BarList items={c.byMethod.map((m) => ({ label: m.methodName, value: m.incomeNio, sub: `${m.count} movimiento(s)` }))} format={nio} />
        </section>
        <section className="rounded-2xl border border-line bg-card p-5">
          <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">Egresos por categoría</h3>
          <BarList items={c.byCategory.map((m) => ({ label: m.categoryName, value: m.expenseNio, sub: `${m.count} movimiento(s)` }))} format={nio} />
        </section>
      </div>

      <section>
        <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">Movimientos del día</h3>
        {c.movements.length === 0 && c.pending.length === 0 && c.cancelled.length === 0 ? (
          <p className="text-[0.8125rem] text-fog">No hay movimientos registrados este día.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {[...c.movements, ...c.pending, ...c.cancelled].map((r) => (
              <li key={r.id}>
                <Card onClick={() => pick({ type: "movement", row: r })} active={sel?.id === r.id} label={`Ver detalle: ${r.concept}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.6875rem] text-fog">
                        {time(r.occurredAt)} · {KIND_LABEL[r.kind]}
                        {r.status !== "completed" ? ` · ${r.status === "pending" ? "Pendiente" : "Anulado"}` : ""}
                      </p>
                      <p className="mt-1 truncate text-[0.9375rem] font-semibold text-ink">{r.concept || "Sin concepto"}</p>
                      <p className="mt-1 truncate text-[0.75rem] text-mist">
                        {[r.clientName, r.methodName, r.categoryName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-display text-[1.0625rem] ${r.type === "expense" ? "text-red-400" : "text-emerald-400"}`}>
                        {r.type === "expense" ? "−" : "+"}
                        {nio(r.amountNio)}
                      </p>
                      {r.currency === "USD" ? <p className="text-[0.6875rem] text-fog">{usd(r.amount)}</p> : null}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------- Pestaña: comparativo mensual ---------- */

function MonthTab({ rows, today, selection, pick }: { rows: LedgerRow[]; today: string; selection: Selection; pick: (s: Selection) => void }) {
  const months = useMemo(() => monthlyComparison(rows, today, 12), [rows, today]);
  const selMonth = selection?.type === "month" ? selection.month : null;
  const detail = months.find((m) => m.month === selMonth) ?? null;
  const totalIncome = months.reduce((a, m) => a + m.incomeNio, 0);
  const totalExpense = months.reduce((a, m) => a + m.expenseNio, 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <MasterExportButton />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ingresos 12 meses" value={nio(totalIncome)} />
        <Kpi label="Egresos 12 meses" value={nio(totalExpense)} />
        <Kpi label="Saldo 12 meses" value={nio(totalIncome - totalExpense)} tone={totalIncome - totalExpense < 0 ? "neg" : "pos"} />
        <Kpi label="Mes actual neto" value={nio(months[months.length - 1]?.netNio ?? 0)} />
      </div>

      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-3 flex items-center gap-4 text-[0.6875rem] text-fog">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-400/80" />Ingresos</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-red-400/80" />Egresos</span>
        </div>
        <ColumnChart data={months.map((m) => ({ label: m.month.slice(2), income: m.incomeNio, expense: m.expenseNio }))} />
      </section>

      {detail ? (
        <DetailCard title={`Detalle de ${detail.month}`} onClose={() => pick(null)}>
          <Fields
            items={[
              ["Ingresos (NIO)", nio(detail.incomeNio)],
              ["Egresos (NIO)", nio(detail.expenseNio)],
              ["Saldo (NIO)", nio(detail.netNio)],
              ["Comisión estimada", nio(detail.commissionNio)],
              ["Movimientos completados", detail.count],
            ]}
          />
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[0.6875rem] tracking-[0.12em] text-fog uppercase">Ingresos por origen</h4>
              <BarList items={detail.byKind.map((k) => ({ label: KIND_LABEL[k.kind], value: k.incomeNio }))} format={nio} />
            </div>
            <div>
              <h4 className="mb-2 text-[0.6875rem] tracking-[0.12em] text-fog uppercase">Egresos por categoría</h4>
              <BarList items={detail.byCategory.map((k) => ({ label: k.categoryName, value: k.expenseNio }))} format={nio} />
            </div>
          </div>
        </DetailCard>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...months].reverse().map((m) => (
          <li key={m.month}>
            <Card onClick={() => pick({ type: "month", month: m.month })} active={selMonth === m.month} label={`Ver detalle de ${m.month}`}>
              <div className="flex items-baseline justify-between">
                <p className="font-display text-[1.0625rem] text-ink">{m.month}</p>
                <p className={`text-[0.8125rem] font-semibold ${m.netNio < 0 ? "text-red-400" : "text-emerald-400"}`}>{nio(m.netNio)}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[0.75rem]">
                <span className="text-fog">Ingresos<br /><b className="text-ink">{nio(m.incomeNio)}</b></span>
                <span className="text-fog">Egresos<br /><b className="text-ink">{nio(m.expenseNio)}</b></span>
              </div>
              <p className="mt-2 text-[0.6875rem] text-fog">{m.count} movimiento(s)</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Pestaña: pagos pendientes ---------- */

function PendingTab({ pending, selection, pick }: { pending: PendingClient[]; selection: Selection; pick: (s: Selection) => void }) {
  const selId = selection?.type === "client" ? selection.clientId : null;
  const detail = pending.find((p) => p.clientId === selId) ?? null;
  const totalNio = pending.reduce((a, p) => a + p.balance.debtNio, 0);
  const totalUsd = pending.reduce((a, p) => a + p.balance.debtUsd, 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <MasterExportButton />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Deuda pendiente (NIO)" value={nio(totalNio)} />
        <Kpi label="Deuda pendiente (USD)" value={usd(totalUsd)} />
        <Kpi label="Clientes con saldo" value={String(pending.length)} />
      </div>
      <p className="text-[0.75rem] text-fog">Cada cliente muestra su último saldo registrado. Deudas y créditos no se compensan ni se convierten entre monedas.</p>

      {detail ? (
        <DetailCard title={`Historial de ${detail.clientName}`} onClose={() => pick(null)}>
          <Fields
            items={[
              ["Deuda (NIO)", nio(detail.balance.debtNio)],
              ["Deuda (USD)", usd(detail.balance.debtUsd)],
              ["Crédito (NIO)", nio(detail.balance.creditNio)],
              ["Crédito (USD)", usd(detail.balance.creditUsd)],
              ["Último movimiento", dateTime(detail.lastEntryAt)],
            ]}
          />
          <ul className="mt-5 flex flex-col gap-2">
            {detail.entries.map((e) => (
              <li key={e.id}>
                <DebtEntryCard entry={e} />
              </li>
            ))}
          </ul>
        </DetailCard>
      ) : null}

      {pending.length === 0 ? (
        <p className="text-[0.8125rem] text-fog">No hay clientes con deuda ni crédito registrado.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pending.map((p) => (
            <li key={p.clientId}>
              <Card onClick={() => pick({ type: "client", clientId: p.clientId })} active={selId === p.clientId} label={`Ver historial de ${p.clientName}`}>
                <p className="truncate font-display text-[1.0625rem] text-ink">{p.clientName}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[0.75rem] text-fog">
                  <span>Deuda NIO<br /><b className="text-red-400">{nio(p.balance.debtNio)}</b></span>
                  <span>Deuda USD<br /><b className="text-red-400">{usd(p.balance.debtUsd)}</b></span>
                  {p.balance.creditNio > 0 || p.balance.creditUsd > 0 ? (
                    <span className="col-span-2">Crédito: {nio(p.balance.creditNio)} · {usd(p.balance.creditUsd)}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-[0.6875rem] text-fog">Último movimiento: {dateTime(p.lastEntryAt)}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DebtEntryCard({ entry: e }: { entry: DebtEntryRow }) {
  const label = e.kind === "opening" ? "Saldo inicial" : e.kind === "charge" ? "Cargo" : "Abono";
  return (
    <div className="rounded-xl border border-line p-3 text-[0.75rem]">
      <div className="flex justify-between gap-3">
        <span className="font-semibold text-ink">{label}{e.amount != null && e.currency ? ` · ${e.currency === "USD" ? usd(e.amount) : nio(e.amount)}` : ""}</span>
        <span className="text-fog">{dateTime(e.occurredAt)}</span>
      </div>
      <p className="mt-1 text-mist">{e.concept || "Sin concepto"}</p>
      <p className="mt-1 text-fog">
        Deuda NIO {e.before ? `${nio(e.before.debtNio)} → ` : ""}{nio(e.after.debtNio)} · Deuda USD {e.before ? `${usd(e.before.debtUsd)} → ` : ""}{usd(e.after.debtUsd)}
        {e.cashReceived != null ? ` · Recibido ${nio(e.cashReceived)}` : ""}
        {e.changeGiven != null ? ` · Vuelto ${nio(e.changeGiven)}` : ""}
        {e.actorName ? ` · Registró ${e.actorName}` : ""}
      </p>
    </div>
  );
}

/* ---------- Pestaña: comisiones ---------- */

function CommissionTab({ rows, selection, pick }: { rows: LedgerRow[]; selection: Selection; pick: (s: Selection) => void }) {
  const all = useMemo(() => commissionsByMethod(rows, "0000-01-01", "9999-12-31"), [rows]);
  const selMethod = selection?.type === "method" ? selection.methodName : null;
  const methodRows = useMemo(
    () =>
      selMethod
        ? rows.filter((r) => r.type === "income" && r.status === "completed" && r.methodName === selMethod).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
        : [],
    [rows, selMethod],
  );
  const totalGross = all.reduce((a, c) => a + c.grossNio, 0);
  const totalFee = all.reduce((a, c) => a + c.commissionNio, 0);
  const detail = all.find((c) => c.methodName === selMethod) ?? null;
  const selRow = selection?.type === "movement" ? selection.row : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <MasterExportButton />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ingresos brutos (NIO)" value={nio(totalGross)} />
        <Kpi label="Comisión estimada" value={nio(totalFee)} />
        <Kpi label="Neto estimado" value={nio(totalGross - totalFee)} />
        <Kpi label="Métodos con cobros" value={String(all.length)} />
      </div>
      <p className="text-[0.75rem] text-fog">
        La comisión es el porcentaje configurado para cada método, aplicado al monto cobrado. Es sólo una estimación: no cambia la caja ni los saldos.
      </p>

      <section className="rounded-2xl border border-line bg-card p-5">
        <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">Ingresos brutos por método</h3>
        <BarList
          items={all.map((c) => ({
            label: `${c.methodName} (${c.feePct}%)`,
            value: c.grossNio,
            sub: `Comisión estimada ${nio(c.commissionNio)} · ${c.count} cobro(s)`,
            onClick: () => pick({ type: "method", methodName: c.methodName }),
            active: selMethod === c.methodName,
          }))}
          format={nio}
        />
      </section>

      {detail ? (
        <DetailCard title={`Cobros con ${detail.methodName}`} onClose={() => pick(null)}>
          <Fields
            items={[
              ["Porcentaje del método", `${detail.feePct}%`],
              ["Ingresos brutos (NIO)", nio(detail.grossNio)],
              ["Comisión estimada (NIO)", nio(detail.commissionNio)],
              ["Neto estimado (NIO)", nio(detail.grossNio - detail.commissionNio)],
            ]}
          />
          <ul className="mt-5 grid gap-2 md:grid-cols-2">
            {methodRows.map((r) => (
              <li key={r.id}>
                <Card onClick={() => pick({ type: "movement", row: r })} label={`Ver detalle: ${r.concept}`}>
                  <div className="flex justify-between gap-3 text-[0.8125rem]">
                    <span className="min-w-0 truncate text-ink">{r.concept || "Sin concepto"}</span>
                    <span className="shrink-0 font-semibold text-ink">{nio(r.amountNio)}</span>
                  </div>
                  <p className="mt-1 text-[0.6875rem] text-fog">{dateTime(r.occurredAt)} · Comisión {nio(r.commissionNio)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </DetailCard>
      ) : null}
      {selRow ? <MovementDetail row={selRow} onClose={() => pick(null)} /> : null}
    </div>
  );
}

