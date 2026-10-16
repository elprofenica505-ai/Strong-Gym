"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calendar,
  ChevronRight,
  CreditCard,
  DollarSign,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type CashSummary,
  type Currency,
  type DailyCashRow,
  type MonthlyPnlRow,
  type PaymentMethodBreakdown,
  type Transaction,
} from "@/lib/data/queries";

/* ============================================================
   Formateo de moneda
   ============================================================ */
const FX_NIO_PER_USD = 36.5;

export function formatMoney(
  amount: number,
  currency: Currency = "NIO",
  opts: { compact?: boolean } = {},
): string {
  const { compact = false } = opts;
  if (!Number.isFinite(amount)) return "—";
  if (currency === "USD") {
    if (compact && Math.abs(amount) >= 1000) {
      return `US$ ${(amount / 1000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat("es-NI", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  }
  if (compact && Math.abs(amount) >= 1000) {
    return `C$ ${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/* ============================================================
   Tarjeta de KPI
   ============================================================ */
function Kpi({
  label,
  value,
  Icon,
  trend,
  tone = "default",
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
  tone?: "default" | "income" | "expense";
}) {
  const IconBg =
    tone === "income" ? "bg-brand-soft text-brand-300" :
    tone === "expense" ? "bg-night-3 text-alert" :
    "bg-card-2 text-mist";
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <span className={cn("grid size-10 place-items-center rounded-xl", IconBg)}>
          <Icon className="size-4.5" />
        </span>
        {TrendIcon && <TrendIcon className={cn("size-4", trend === "up" ? "text-brand-300" : "text-alert")} />}
      </div>
      <p className="display-xl mt-4 text-[1.625rem] leading-none text-brand">{value}</p>
      <p className="mt-1.5 text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">{label}</p>
    </div>
  );
}

/* ============================================================
   Mini gráfico de barras (sin libs externas)
   ============================================================ */
function MiniBar({ data, valueKey, label }: {
  data: { label: string; value: number }[];
  valueKey: string;
  label: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <p className="mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">{label}</p>
      <div className="flex h-32 items-end gap-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-brand/60 transition-all duration-500 hover:bg-brand"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? "4px" : "0" }}
              title={`${d.label}: ${formatMoney(d.value)}`}
            />
            <span className="text-[0.625rem] text-fog">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Componente principal
   ============================================================ */

interface Props {
  summary: CashSummary;
  recent: Transaction[];
  daily: DailyCashRow[];
  monthly: MonthlyPnlRow[];
  methods: PaymentMethodBreakdown[];
  paymentMethodNames: Record<string, string>;
  paymentMethodIcons: Record<string, string>;
  accounts: { id: string; name: string; currency: Currency; kind: string }[];
  isDemo: boolean;
}

export function CashPanel({
  summary,
  recent,
  daily,
  monthly,
  methods,
  paymentMethodNames,
  paymentMethodIcons,
  accounts,
  isDemo,
}: Props) {
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [newPayment, setNewPayment] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "all") return recent;
    return recent.filter((t) => t.direction === filter);
  }, [recent, filter]);

  const dailyChart = useMemo(
    () => daily.slice(0, 14).reverse().map((d) => ({
      label: d.day.slice(5), // MM-DD
      value: d.incomeNio,
    })),
    [daily],
  );

  const monthlyChart = useMemo(
    () => monthly.slice(0, 6).reverse().map((m) => ({
      label: m.month.slice(0, 7), // YYYY-MM
      value: m.netNio,
    })),
    [monthly],
  );

  return (
    <div className="space-y-8">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="eyebrow">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            Fase 1 · Contabilidad
          </span>
          <h1 className="display-xl mt-3 text-[1.75rem] sm:text-[2.5rem]">
            Caja y cuentas
          </h1>
          <p className="mt-2 max-w-xl text-[0.875rem] leading-relaxed text-fog">
            Ingresos, egresos, cuentas por cobrar y los 10 métodos de pago del gimnasio. Tipo de cambio: 1 USD = {FX_NIO_PER_USD} NIO.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.openRegister ? (
            <Badge className="border-brand/40 bg-brand-soft text-brand-300">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-brand" />
              Caja abierta · {formatMoney(summary.openRegister.openingAmount)} inicial
            </Badge>
          ) : (
            <Badge className="border-alert/40 bg-card text-alert">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-alert" />
              Caja cerrada
            </Badge>
          )}
        </div>
      </div>

      <a href={`/${useLocale()}/panel/clientes`} className="flex flex-col gap-1 rounded-2xl border border-brand/40 bg-brand/10 p-5 hover:border-brand">
        <span className="font-bold text-ink">Identificar cliente · escáner o búsqueda manual →</span>
        <span className="text-sm text-fog">Crear ficha, consultar historial, registrar entrada o confirmar un cobro. Sin celular también te atendemos.</span>
      </a>

      {/* ---------- KPIs principales ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Ingresos hoy"
          value={formatMoney(summary.incomeToday)}
          Icon={Banknote}
          trend="up"
          tone="income"
        />
        <Kpi
          label="Egresos hoy"
          value={formatMoney(summary.expenseToday)}
          Icon={Receipt}
          trend="down"
          tone="expense"
        />
        <Kpi
          label="Balance del mes"
          value={formatMoney(summary.netMonth)}
          Icon={TrendingUp}
          trend={summary.netMonth >= 0 ? "up" : "down"}
        />
        <Kpi
          label="Cuentas por cobrar"
          value={formatMoney(summary.totalOwed)}
          Icon={Wallet}
          tone="default"
        />
      </div>

      {/* ---------- Gráficos ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-5">
          <MiniBar data={dailyChart} valueKey="income" label="Ingresos · últimos 14 días" />
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <MiniBar data={monthlyChart} valueKey="net" label="Resultado neto · últimos 6 meses" />
        </div>
      </div>

      {/* ---------- Desglose por método de pago ---------- */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[1.0625rem] font-semibold text-ink">Métodos de pago</h2>
            <p className="mt-1 text-[0.75rem] text-fog">
              Cuánto entró por cada método este mes
            </p>
          </div>
        </div>
        {methods.length === 0 ? (
          <p className="py-6 text-center text-[0.875rem] text-fog">
            Sin movimientos registrados todavía.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {methods.slice(0, 8).map((m) => {
              const icon = iconFor(m.icon);
              const total = m.incomeNio + m.expenseNio;
              return (
                <li
                  key={`${m.paymentMethodId ?? "none"}-${m.nameEs}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-card-2 p-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-300">
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] font-semibold text-ink">
                      {m.nameEs ?? "Otros"}
                    </p>
                    <p className="text-[0.6875rem] text-fog">
                      {m.txCount} mov · {m.incomeNio > 0 ? `+${formatMoney(m.incomeNio)}` : "—"} ingresos
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[0.875rem] font-semibold text-ink tabular-nums">
                      {formatMoney(total)}
                    </p>
                    {m.expenseNio > 0 && (
                      <p className="text-[0.6875rem] text-fog">
                        −{formatMoney(m.expenseNio)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ---------- Movimientos recientes ---------- */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[1.0625rem] font-semibold text-ink">Movimientos recientes</h2>
            <p className="mt-1 text-[0.75rem] text-fog">
              Los últimos 30 ingresos y egresos del gimnasio
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "income", "expense"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[0.75rem] font-semibold transition-colors",
                  filter === f
                    ? "border-brand bg-brand text-onbrand"
                    : "border-line text-mist hover:border-brand/60 hover:text-ink",
                )}
              >
                {f === "all" ? "Todos" : f === "income" ? "Ingresos" : "Egresos"}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-[0.875rem] text-fog">
            {isDemo
              ? "Conectá Supabase para ver los movimientos reales del gimnasio."
              : "Sin movimientos en este filtro."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg",
                    t.direction === "income" ? "bg-brand-soft text-brand-300" : "bg-night-3 text-alert",
                  )}
                >
                  {t.direction === "income" ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-medium text-ink">
                    {t.concept}
                    {t.memberName && (
                      <span className="ml-2 text-[0.75rem] text-fog">· {t.memberName}</span>
                    )}
                  </p>
                  <p className="text-[0.6875rem] text-fog">
                    {new Date(t.occurredAt).toLocaleDateString("es-NI", { day: "2-digit", month: "short" })}
                    {" · "}
                    {paymentMethodNames[t.paymentMethodId ?? ""] ?? t.paymentMethodId ?? "—"}
                  </p>
                </div>
                <p
                  className={cn(
                    "font-mono text-[0.9375rem] font-semibold tabular-nums",
                    t.direction === "income" ? "text-brand-300" : "text-ink",
                  )}
                >
                  {t.direction === "income" ? "+" : "−"}
                  {formatMoney(t.amount, t.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- Cuentas y métodos habilitados ---------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <CreditCard className="size-4 text-brand-300" />
            <h3 className="text-[0.9375rem] font-semibold text-ink">Cuentas activas</h3>
          </div>
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-line bg-card-2 px-3 py-2"
              >
                <div>
                  <p className="text-[0.8125rem] font-semibold text-ink">{a.name}</p>
                  <p className="text-[0.6875rem] text-fog uppercase tracking-wider">{a.kind}</p>
                </div>
                <Badge className="border-line bg-night-3 text-mist">{a.currency}</Badge>
              </li>
            ))}
            {accounts.length === 0 && (
              <li className="rounded-lg border border-dashed border-line py-4 text-center text-[0.75rem] text-fog">
                {isDemo ? "Cargá Supabase para ver las cuentas del gimnasio." : "Sin cuentas activas."}
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <DollarSign className="size-4 text-brand-300" />
            <h3 className="text-[0.9375rem] font-semibold text-ink">Accesos rápidos</h3>
          </div>
          <ul className="space-y-2">
            <QuickLink
              href={`/${useLocale()}/panel/cuentas`}
              label="Ver cuentas por cobrar"
              hint="Clientes con cuotas pendientes"
            />
            <QuickLink
              href={`/${useLocale()}/panel/gastos`}
              label="Registrar un gasto"
              hint="Alquiler, sueldos, mantenimiento"
            />
            <QuickLink
              href={`/${useLocale()}/panel/reportes`}
              label="Reporte mensual"
              hint="P&L y desglose por método"
            />
            <QuickLink
              href={`/${useLocale()}/panel`}
              label="Volver al panel"
              hint="Resumen, reservas, mensajes"
            />
          </ul>
        </div>
      </div>

      {isDemo && (
        <p className="rounded-2xl border border-dashed border-brand/35 bg-brand-soft p-4 text-center text-[0.75rem] text-brand-300">
          El panel muestra datos reales cuando Supabase está conectado. En modo demo, los números están en cero.
        </p>
      )}
    </div>
  );
}

function QuickLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <li>
      <a
        href={href}
        className="group flex items-center justify-between rounded-lg border border-line bg-card-2 px-3 py-2 transition-colors hover:border-brand/60"
      >
        <div>
          <p className="text-[0.8125rem] font-semibold text-ink">{label}</p>
          <p className="text-[0.6875rem] text-fog">{hint}</p>
        </div>
        <ChevronRight className="size-4 text-fog transition-transform group-hover:translate-x-0.5 group-hover:text-brand-300" />
      </a>
    </li>
  );
}

/* ---- Helper: lee la locale desde window ---- */
function useLocale(): string {
  if (typeof window === "undefined") return "es";
  const seg = window.location.pathname.split("/").filter(Boolean);
  return seg[0] === "en" || seg[0] === "es" ? seg[0] : "es";
}

/* ---- Mapeo de nombres de íconos ---- */
function iconFor(name: string): React.ReactNode {
  const map: Record<string, React.ReactNode> = {
    Banknote: <Banknote className="size-4" />,
    DollarSign: <DollarSign className="size-4" />,
    CreditCard: <CreditCard className="size-4" />,
    Wallet: <Wallet className="size-4" />,
    Smartphone: <Calendar className="size-4" />,
    Building2: <Plus className="size-4" />,
    Bitcoin: <Plus className="size-4" />,
  };
  return map[name] ?? map.Wallet;
}
