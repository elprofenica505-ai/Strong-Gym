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
import { formatMoney } from "@/lib/finance/format-money";
import {
  type CashSummary,
  type Currency,
  type DailyCashRow,
  type MonthlyPnlRow,
  type PaymentMethodBreakdown,
  type Transaction,
} from "@/lib/data/queries";

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
    tone === "income"
      ? "bg-brand-soft text-brand-300"
      : tone === "expense"
        ? "bg-night-3 text-alert"
        : "bg-card-2 text-mist";
  const TrendIcon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <span
          className={cn("grid size-10 place-items-center rounded-xl", IconBg)}
        >
          <Icon className="size-4.5" />
        </span>
        {TrendIcon && (
          <TrendIcon
            className={cn(
              "size-4",
              trend === "up" ? "text-brand-300" : "text-alert",
            )}
          />
        )}
      </div>
      <p className="display-xl mt-4 text-[1.625rem] leading-none text-brand">
        {value}
      </p>
      <p className="mt-1.5 text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
        {label}
      </p>
    </div>
  );
}

/* ============================================================
   Mini gráfico de barras (sin libs externas)
   ============================================================ */
export function MiniBar({
  data,
  label,
}: {
  data: { label: string; value: number }[];
  label: string;
}) {
  // Alturas explícitas: un porcentaje en una columna sin altura definida colapsaba.
  // Eje central compartido para que los resultados negativos no sean alturas inválidas.
  const max = Math.max(
    1,
    ...data
      .filter((d) => Number.isFinite(d.value))
      .map((d) => Math.abs(d.value)),
  );
  const allZero = data.length > 0 && data.every((d) => d.value === 0);
  return (
    <section className="min-w-0 max-w-full" aria-label={label}>
      <p className="mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
        {label}
      </p>
      {data.length === 0 ? (
        <p className="py-8 text-sm text-fog">
          Sin registros informados para este gráfico.
        </p>
      ) : (
        <>
          {allZero && (
            <p className="mb-2 text-xs text-fog">
              Los importes de los {data.length} registros mostrados son 0 NIO;
              no hay barras de importe distinto de cero.
            </p>
          )}
          <p className="mb-2 text-xs text-fog">
            Eje 0 al centro · positivos arriba, negativos abajo.
          </p>
          <div
            className="w-full min-w-0 max-w-full overflow-x-auto pb-2"
            role="region"
            aria-label={`Desplazar gráfico: ${label}`}
            tabIndex={0}
          >
            <div
              className="flex gap-1.5"
              style={{
                minWidth: data.length > 8 ? data.length * 34 : undefined,
              }}
            >
              {data.map((d) => {
                const valid = Number.isFinite(d.value);
                const negative = d.value < 0;
                const height = valid ? (Math.abs(d.value) / max) * 56 : 0;
                return (
                  <div key={d.label} className="min-w-0 flex-1 text-center">
                    <div
                      className="relative"
                      style={{ height: 128 }}
                      role="img"
                      aria-label={`${d.label}: ${formatMoney(d.value)}`}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-1/2 border-t border-line"
                      />
                      {valid && (
                        <div
                          aria-hidden="true"
                          className={cn(
                            "absolute inset-x-0 rounded-sm",
                            negative
                              ? "bg-alert"
                              : d.value === 0
                                ? "bg-fog"
                                : "bg-brand",
                          )}
                          style={{
                            height: d.value === 0 ? 2 : Math.max(2, height),
                            ...(negative
                              ? { top: 64 }
                              : { bottom: d.value === 0 ? 63 : 64 }),
                          }}
                          title={`${d.label}: ${formatMoney(d.value)}`}
                        />
                      )}
                    </div>
                    <p className="whitespace-nowrap text-[0.625rem] text-fog">
                      {d.label}
                    </p>
                    {data.length <= 6 && (
                      <p className="mt-1 text-[0.625rem] text-mist">
                        {formatMoney(d.value, "NIO", { compact: true })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <details className="mt-2 text-xs text-fog">
            <summary className="cursor-pointer text-mist">
              Ver importes del gráfico
            </summary>
            <table className="mt-2 w-full text-left">
              <caption className="sr-only">
                {label} · importes NIO informados
              </caption>
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col" className="text-right">
                    Importe NIO
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.label}>
                    <th scope="row" className="py-1 font-normal">
                      {d.label}
                    </th>
                    <td className="py-1 text-right font-mono">
                      {formatMoney(d.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
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
  accounts: {
    id: string;
    name: string;
    currency: Currency;
    kind: string;
    balance?: number;
  }[];
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
    () =>
      daily
        .slice(0, 14)
        .reverse()
        .map((d) => ({
          label: d.day.slice(5), // MM-DD
          value: d.incomeNio,
        })),
    [daily],
  );

  const monthlyChart = useMemo(
    () =>
      monthly
        .slice(0, 6)
        .reverse()
        .map((m) => ({
          label: m.month.slice(0, 7), // YYYY-MM
          value: m.netNio,
        })),
    [monthly],
  );

  return (
    <div className="container-x min-w-0 space-y-8 py-6">
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
            Ingresos, egresos, cuentas por cobrar y métodos de pago del
            gimnasio. Las conversiones deben usar la tasa guardada en cada
            movimiento, no una tasa fija.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.sourceModel === "bank_accounts_split" ? (
            <Badge className="border-line bg-card text-fog">
              {summary.openRegisterCount ?? 0} sesiones abiertas informadas
            </Badge>
          ) : summary.openRegister ? (
            <Badge className="border-brand/40 bg-brand-soft text-brand-300">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-brand" />
              Caja abierta · {formatMoney(summary.openRegister.openingAmount)}{" "}
              inicial
            </Badge>
          ) : (
            <Badge className="border-alert/40 bg-card text-alert">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-alert" />
              Caja cerrada
            </Badge>
          )}
        </div>
      </div>

      {summary.sourceModel === "bank_accounts_split" && (
        <div className="rounded-xl border border-line bg-card p-4 text-sm text-fog space-y-2">
          <p>
            Cobros por servicio: desde la ficha del cliente. Gastos: desde
            Registrar gasto. Cada formulario verifica la actualización y los
            permisos antes de habilitarse. No aplica deudas, créditos ni
            renovaciones automáticamente.
          </p>
          <p>
            Ingresos, egresos y resultados: equivalentes NIO guardados en cada
            movimiento; sin convertir con una tasa nueva. Cortes:
            America/Managua. Los saldos de cuentas se muestran en su propia
            moneda y no se recalculan ni certifican.
          </p>
          {summary.openRegister && (
            <p>
              Última sesión abierta informada: apertura NIO{" "}
              {formatMoney(summary.openRegister.openingAmount)} · USD{" "}
              {formatMoney(summary.openRegister.openingAmountUsd ?? 0, "USD")}.
              No es un arqueo confirmado.
            </p>
          )}
        </div>
      )}

      <a
        href={`/${useLocale()}/panel/clientes`}
        className="flex flex-col gap-1 rounded-2xl border border-brand/40 bg-brand/10 p-5 hover:border-brand"
      >
        <span className="font-bold text-ink">
          Identificar cliente · escáner o búsqueda manual →
        </span>
        <span className="text-sm text-fog">
          Crear ficha, consultar historial o registrar entrada. Búsqueda por
          nombre, sin celular obligatorio.
        </span>
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
          label="Resultado del mes · NIO"
          value={formatMoney(summary.netMonth)}
          Icon={TrendingUp}
          trend={summary.netMonth >= 0 ? "up" : "down"}
        />
        <Kpi
          label="Deuda informada · NIO"
          value={formatMoney(summary.totalOwed)}
          Icon={Wallet}
          tone="default"
        />
      </div>

      {summary.totalOwedUsd !== undefined && (
        <Kpi
          label="Deuda informada · USD (sin convertir)"
          value={formatMoney(summary.totalOwedUsd, "USD")}
          Icon={Wallet}
        />
      )}

      {/* ---------- Gráficos ---------- */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-line bg-card p-5">
          <MiniBar
            data={dailyChart}
            label="Ingresos NIO · 14 días con registros"
          />
        </div>
        <div className="min-w-0 rounded-2xl border border-line bg-card p-5">
          <MiniBar
            data={monthlyChart}
            label="Resultado NIO · 6 meses con registros"
          />
        </div>
      </div>

      {/* ---------- Desglose por método de pago ---------- */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[1.0625rem] font-semibold text-ink">
              Métodos de pago
            </h2>
            <p className="mt-1 text-[0.75rem] text-fog">
              Movimientos completados por método · todo el historial
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
                  className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border border-line bg-card-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-300">
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[0.875rem] font-semibold text-ink">
                      {m.nameEs ?? "Sin método informado"}
                    </p>
                    <p className="text-[0.6875rem] text-fog">
                      {m.txCount} mov ·{" "}
                      {m.incomeNio > 0 ? `+${formatMoney(m.incomeNio)}` : "—"}{" "}
                      ingresos
                    </p>
                  </div>
                  <div className="col-span-2 min-w-0 text-right sm:col-span-1">
                    <p className="font-mono text-[0.875rem] font-semibold text-ink tabular-nums">
                      <span className="text-xs text-fog">Volumen NIO: </span>
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
            <h2 className="text-[1.0625rem] font-semibold text-ink">
              Movimientos recientes
            </h2>
            <p className="mt-1 text-[0.75rem] text-fog">
              Últimos 30 movimientos · estado y moneda original
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
                {f === "all"
                  ? "Todos"
                  : f === "income"
                    ? "Ingresos"
                    : "Egresos"}
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
              <li
                key={t.id}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg",
                    t.status !== "completed" || t.direction === "transfer"
                      ? "bg-night-3 text-fog"
                      : t.direction === "income"
                        ? "bg-brand-soft text-brand-300"
                        : "bg-night-3 text-alert",
                  )}
                >
                  {t.direction === "income" ? (
                    <TrendingUp className="size-4" />
                  ) : t.direction === "transfer" ? (
                    <ChevronRight className="size-4" />
                  ) : (
                    <TrendingDown className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[0.875rem] font-medium text-ink">
                    {t.concept}
                    {t.memberName && (
                      <span className="ml-2 text-[0.75rem] text-fog">
                        · {t.memberName}
                      </span>
                    )}
                  </p>
                  <p className="text-[0.6875rem] text-fog">
                    {new Date(t.occurredAt).toLocaleDateString("es-NI", {
                      day: "2-digit",
                      month: "short",
                      timeZone: "America/Managua",
                    })}
                    {" · "}
                    {paymentMethodNames[t.paymentMethodId ?? ""] ??
                      t.paymentMethodId ??
                      "—"}
                    {" · "}
                    {t.direction === "transfer" ? "Transferencia · " : ""}
                    {t.status === "completed"
                      ? "Completado"
                      : t.status === "pending"
                        ? "Pendiente"
                        : t.status === "cancelled"
                          ? "Cancelado"
                          : "Revertido"}
                  </p>
                </div>
                <p
                  className={cn(
                    "col-span-2 min-w-0 text-right font-mono text-[0.9375rem] font-semibold tabular-nums sm:col-span-1",
                    t.status !== "completed"
                      ? "text-fog"
                      : t.direction === "income"
                        ? "text-brand-300"
                        : "text-ink",
                  )}
                >
                  {t.direction === "income"
                    ? "+"
                    : t.direction === "expense"
                      ? "−"
                      : "⇄"}
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
            <h3 className="text-[0.9375rem] font-semibold text-ink">
              Cuentas activas
            </h3>
          </div>
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex min-w-0 flex-col items-stretch gap-2 rounded-lg border border-line bg-card-2 px-3 py-2"
              >
                <div>
                  <p className="break-words text-[0.8125rem] font-semibold text-ink">
                    {a.name}
                  </p>
                  <p className="text-[0.6875rem] text-fog uppercase tracking-wider">
                    {{ cash: "Caja", bank: "Banco", wallet: "Billetera" }[
                      a.kind
                    ] ?? a.kind}
                  </p>
                </div>
                <div className="text-right">
                  <Badge className="border-line bg-night-3 text-mist">
                    {a.currency}
                  </Badge>
                  {a.balance !== undefined && (
                    <p className="text-xs text-fog">
                      Saldo informado: {formatMoney(a.balance, a.currency)}
                    </p>
                  )}
                </div>
              </li>
            ))}
            {accounts.length === 0 && (
              <li className="rounded-lg border border-dashed border-line py-4 text-center text-[0.75rem] text-fog">
                {isDemo
                  ? "Cargá Supabase para ver las cuentas del gimnasio."
                  : "Sin cuentas activas."}
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <DollarSign className="size-4 text-brand-300" />
            <h3 className="text-[0.9375rem] font-semibold text-ink">
              Accesos rápidos
            </h3>
          </div>
          <ul className="space-y-2">
            <QuickLink
              href={`/${useLocale()}/panel/cuentas`}
              label="Ver cuentas por cobrar"
              hint="Deudas informadas por moneda"
            />
            <QuickLink
              href={`/${useLocale()}/panel/gastos`}
              label="Registrar gasto y ver comprobantes"
              hint="Gastos por cuenta y moneda · requiere actualización financiera"
            />
            <QuickLink
              href={`/${useLocale()}/panel/reportes`}
              label="Reporte mensual"
              hint="Ingresos, egresos y resultado NIO"
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
          El panel muestra datos reales cuando Supabase está conectado. En modo
          demo, los números están en cero.
        </p>
      )}
    </div>
  );
}

function QuickLink({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
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
