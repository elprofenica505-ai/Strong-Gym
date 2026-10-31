"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  Calendar,
  ChevronRight,
  CreditCard,
  DollarSign,
  Plus,
  Receipt,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { VoidMovementButton } from "@/components/admin/void-movement";
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
import {
  CASHIER_PERMISSIONS_ALL,
  type CashierPermissions,
} from "@/lib/finance/cashier-permissions";

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

const MOVEMENT_PAGE_SIZE = 25;

type CashModule = "movimientos" | "cuentas" | "metodos" | "graficos" | "ayuda";
type MovementView = "movimientos" | "filtros";
type AccountView = "cuentas" | "filtros";

const CASH_MODULE_INFO: Record<CashModule, { title: string; hint: string }> = {
  movimientos: {
    title: "Movimientos",
    hint: "Últimos 30 movimientos cargados, en su moneda original.",
  },
  cuentas: {
    title: "Cuentas y saldos",
    hint: "Cuentas activas; el saldo se muestra en la moneda de cada cuenta.",
  },
  metodos: {
    title: "Métodos de pago",
    hint: "Movimientos completados por método, en todo el historial informado.",
  },
  graficos: {
    title: "Gráficos",
    hint: "Equivalentes NIO guardados en cada movimiento.",
  },
  ayuda: {
    title: "Cómo leer Caja",
    hint: "Qué significa cada número y desde dónde se registra cada cosa.",
  },
};

function transactionStatusLabel(status: Transaction["status"]): string {
  return status === "completed"
    ? "Completado"
    : status === "pending"
      ? "Pendiente"
      : status === "cancelled"
        ? "Cancelado"
        : "Revertido";
}

function accountKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    cash: "Caja",
    caja_fuerte: "Caja",
    bank: "Banco",
    wallet: "Billetera",
  };
  return labels[kind] ?? kind.replaceAll("_", " ");
}

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
  permissions?: CashierPermissions;
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
  permissions = CASHIER_PERMISSIONS_ALL,
}: Props) {
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [openModule, setOpenModule] = useState<CashModule | null>(null);
  const [movementView, setMovementView] =
    useState<MovementView>("movimientos");
  const [movementSearch, setMovementSearch] = useState("");
  const [movementMethod, setMovementMethod] = useState("all");
  const [movementCurrency, setMovementCurrency] = useState<"all" | Currency>(
    "all",
  );
  const [movementStatus, setMovementStatus] = useState("all");
  const [movementPage, setMovementPage] = useState(0);
  const [accountView, setAccountView] = useState<AccountView>("cuentas");
  const [accountKind, setAccountKind] = useState("all");
  const [accountCurrency, setAccountCurrency] = useState<"all" | Currency>(
    "all",
  );
  const moduleScreenRef = useRef<HTMLElement>(null);
  const locale = readLocale();

  // Al abrir una tarjeta, su tema funciona como pantalla aparte: empieza
  // arriba, recibe el foco y la página de Caja detrás no se mueve.
  useEffect(() => {
    if (!openModule) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const screen = moduleScreenRef.current;
    if (screen) {
      screen.scrollTop = 0;
      screen.focus({ preventScroll: true });
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [openModule]);

  const methodNameFor = useCallback(
    (t: Transaction) =>
      paymentMethodNames[t.paymentMethodId ?? ""] ??
      t.paymentMethodId ??
      "Sin método informado",
    [paymentMethodNames],
  );
  const movementMethodOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const t of recent) {
      const value = t.paymentMethodId ?? "none";
      if (!options.has(value)) options.set(value, methodNameFor(t));
    }
    return Array.from(options, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label, "es-NI"),
    );
  }, [methodNameFor, recent]);

  const filtered = useMemo(() => {
    const query = movementSearch.trim().toLocaleLowerCase("es-NI");
    return recent.filter((t) => {
      if (filter !== "all" && t.direction !== filter) return false;
      if (
        movementMethod !== "all" &&
        (t.paymentMethodId ?? "none") !== movementMethod
      )
        return false;
      if (movementCurrency !== "all" && t.currency !== movementCurrency)
        return false;
      if (movementStatus !== "all" && t.status !== movementStatus)
        return false;
      if (!query) return true;
      return [t.concept, t.memberName ?? "", methodNameFor(t)]
        .join(" ")
        .toLocaleLowerCase("es-NI")
        .includes(query);
    });
  }, [
    filter,
    methodNameFor,
    movementCurrency,
    movementMethod,
    movementSearch,
    movementStatus,
    recent,
  ]);
  const movementPageCount = Math.max(
    1,
    Math.ceil(filtered.length / MOVEMENT_PAGE_SIZE),
  );
  const safeMovementPage = Math.min(movementPage, movementPageCount - 1);
  const visibleMovements = filtered.slice(
    safeMovementPage * MOVEMENT_PAGE_SIZE,
    safeMovementPage * MOVEMENT_PAGE_SIZE + MOVEMENT_PAGE_SIZE,
  );
  const resetMovementPage = () => setMovementPage(0);

  const accountKindOptions = useMemo(
    () =>
      Array.from(new Set(accounts.map((account) => account.kind))).sort(
        (a, b) =>
          accountKindLabel(a).localeCompare(accountKindLabel(b), "es-NI"),
      ),
    [accounts],
  );
  const visibleAccounts = accounts.filter(
    (account) =>
      (accountKind === "all" || account.kind === accountKind) &&
      (accountCurrency === "all" || account.currency === accountCurrency),
  );

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
    <>
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
        <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm text-fog">
          Equivalentes NIO guardados en cada movimiento · cortes en
          America/Managua · saldos en la moneda de cada cuenta.
        </p>
      )}

      <a
        href={`/${locale}/panel/clientes`}
        className="group flex items-center gap-4 rounded-2xl bg-brand p-5 text-onbrand shadow-[0_16px_38px_-16px_rgba(216,26,34,0.85)] transition hover:bg-brand-600 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
          <Banknote className="size-6" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] font-bold leading-snug">
            Cobrar o registrar entrada · buscar cliente
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-white/85">
            Buscás o creás la ficha, cobrás el pase del día u otro servicio,
            agregás productos con stock si los lleva y, si corresponde,
            registrás la entrada. Sin celular obligatorio.
          </span>
        </span>
        <ChevronRight
          className="size-7 shrink-0 transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        />
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
        {permissions.monthlyResult ? (
          <Kpi
            label="Resultado del mes · NIO"
            value={formatMoney(summary.netMonth)}
            Icon={TrendingUp}
            trend={summary.netMonth >= 0 ? "up" : "down"}
          />
        ) : null}
        {permissions.receivables ? (
          <Kpi
            label="Deuda informada · NIO"
            value={formatMoney(summary.totalOwed)}
            Icon={Wallet}
            tone="default"
          />
        ) : null}
      </div>

      {permissions.receivables && summary.totalOwedUsd !== undefined && (
        <Kpi
          label="Deuda informada · USD (sin convertir)"
          value={formatMoney(summary.totalOwedUsd, "USD")}
          Icon={Wallet}
        />
      )}

      {/* ---------- Módulos de Caja ---------- */}
      <section aria-labelledby="caja-acciones" className="space-y-3">
        <div>
          <h2
            id="caja-acciones"
            className="text-[1.0625rem] font-semibold text-ink"
          >
            ¿Qué querés hacer?
          </h2>
          <p className="mt-1 text-[0.8125rem] text-fog">
            Cada tarjeta abre su tema en su propia pantalla.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {permissions.expenses ? (
            <ModuleAction
              href={`/${locale}/panel/gastos`}
              title="Registrar gasto"
              hint="Gasto y comprobantes · requiere actualización financiera"
              Icon={Receipt}
            />
          ) : null}
          <ModuleAction
            title="Movimientos"
            hint={`${recent.length} cargados · buscar y filtrar`}
            Icon={Wallet}
            onClick={() => setOpenModule("movimientos")}
          />
          <ModuleAction
            title="Cuentas y saldos"
            hint={`${accounts.length} cuentas activas`}
            Icon={CreditCard}
            onClick={() => setOpenModule("cuentas")}
          />
          {permissions.charts ? (
            <>
              <ModuleAction
                title="Métodos de pago"
                hint="Volumen e ingresos por método"
                Icon={DollarSign}
                onClick={() => setOpenModule("metodos")}
              />
              <ModuleAction
                title="Gráficos"
                hint="Últimos días y resultado mensual"
                Icon={TrendingUp}
                onClick={() => setOpenModule("graficos")}
              />
            </>
          ) : null}
          {permissions.receivables ? (
            <ModuleAction
              href={`/${locale}/panel/cuentas`}
              title="Cuentas por cobrar"
              hint="Deudas informadas por moneda"
              Icon={Wallet}
            />
          ) : null}
          <ModuleAction
            href={`/${locale}/panel/productos`}
            title="Productos y stock"
            hint="Crear, comprar y revisar existencias"
            Icon={Plus}
          />
          {permissions.dailyClose || permissions.monthlyResult ? (
            <ModuleAction
              href={`/${locale}/panel/reportes`}
              title={permissions.monthlyResult ? "Reporte mensual" : "Cierre del día"}
              hint={
                permissions.monthlyResult
                  ? "Ingresos, egresos y resultado NIO"
                  : "Movimientos y cierre del día"
              }
              Icon={Calendar}
            />
          ) : null}
          <ModuleAction
            title="Cómo leer Caja"
            hint="Qué significa cada número"
            Icon={Search}
            onClick={() => setOpenModule("ayuda")}
          />
        </div>
      </section>

      {/* ---------- Últimos movimientos (resumen) ---------- */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[1.0625rem] font-semibold text-ink">
              Movimientos recientes
            </h2>
            <p className="mt-1 text-[0.75rem] text-fog">
              Los últimos cargados, en su moneda original.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpenModule("movimientos")}
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
          >
            Ver movimientos
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="py-4 text-center text-[0.875rem] text-fog">
            {isDemo
              ? "Conectá Supabase para ver los movimientos reales del gimnasio."
              : "Sin movimientos cargados todavía."}
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.slice(0, 3).map((t) => (
              <MovementItem
                key={t.id}
                t={t}
                methodName={methodNameFor(t)}
                canVoid={permissions.void}
              />
            ))}
          </ul>
        )}
      </section>

      {isDemo && (
        <p className="rounded-2xl border border-dashed border-brand/35 bg-brand-soft p-4 text-center text-[0.75rem] text-brand-300">
          El panel muestra datos reales cuando Supabase está conectado. En modo
          demo, los números están en cero.
        </p>
      )}
    </div>

    {openModule && (
      <section
        ref={moduleScreenRef}
        tabIndex={-1}
        aria-label={CASH_MODULE_INFO[openModule].title}
        data-cash-module={openModule}
        className="fixed inset-0 z-[80] space-y-6 overflow-y-auto overscroll-contain bg-paper px-4 pt-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-ink shadow-2xl outline-none print:static print:overflow-visible sm:px-6 lg:px-[max(2rem,calc((100vw_-_72rem)/2))]"
      >
        <div className="sticky top-0 z-20 flex items-center gap-2 rounded-2xl border border-line bg-card/95 p-3 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => setOpenModule(null)}
            className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver a Caja
          </button>
        </div>

        <div>
          <p className="text-[0.65rem] font-bold tracking-[0.18em] text-brand-300 uppercase">
            Módulo · Caja
          </p>
          <h2 className="display-xl mt-2 text-[1.75rem] sm:text-[2.25rem]">
            {CASH_MODULE_INFO[openModule].title}
          </h2>
          <p className="mt-1 text-sm text-fog">
            {CASH_MODULE_INFO[openModule].hint}
          </p>
        </div>

        {openModule === "movimientos" && (
          <div className="space-y-4">
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-label="Vista de movimientos"
            >
              {(
                [
                  ["movimientos", "Ver movimientos"],
                  ["filtros", "Filtros"],
                ] as const
              ).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={movementView === view}
                  onClick={() => setMovementView(view)}
                  className={cn(
                    "rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                    movementView === view
                      ? "bg-brand text-onbrand"
                      : "border border-line bg-paper text-ink hover:border-brand",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {movementView === "filtros" ? (
              <div className="space-y-5 rounded-2xl border border-line bg-card p-4 sm:p-5">
                <FilterGroup
                  title="Tipo"
                  value={filter}
                  options={[
                    { value: "all", label: "Todos" },
                    { value: "income", label: "Ingresos" },
                    ...(permissions.expenses
                      ? [{ value: "expense", label: "Egresos" }]
                      : []),
                  ]}
                  onChange={(value) => {
                    setFilter(value as typeof filter);
                    resetMovementPage();
                  }}
                />
                <FilterGroup
                  title="Método de pago"
                  value={movementMethod}
                  options={[
                    { value: "all", label: "Todos los métodos" },
                    ...movementMethodOptions,
                  ]}
                  onChange={(value) => {
                    setMovementMethod(value);
                    resetMovementPage();
                  }}
                />
                <FilterGroup
                  title="Moneda"
                  value={movementCurrency}
                  options={[
                    { value: "all", label: "Todas" },
                    { value: "NIO", label: "NIO" },
                    { value: "USD", label: "USD" },
                  ]}
                  onChange={(value) => {
                    setMovementCurrency(value as "all" | Currency);
                    resetMovementPage();
                  }}
                />
                <FilterGroup
                  title="Estado"
                  value={movementStatus}
                  options={[
                    { value: "all", label: "Todos" },
                    { value: "completed", label: "Completado" },
                    { value: "pending", label: "Pendiente" },
                    { value: "cancelled", label: "Cancelado" },
                    { value: "reversed", label: "Revertido" },
                  ]}
                  onChange={(value) => {
                    setMovementStatus(value);
                    resetMovementPage();
                  }}
                />
                <button
                  type="button"
                  className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
                  onClick={() => {
                    setFilter("all");
                    setMovementSearch("");
                    setMovementMethod("all");
                    setMovementCurrency("all");
                    setMovementStatus("all");
                    resetMovementPage();
                    setMovementView("movimientos");
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <>
                <label className="block text-sm text-fog">
                  Buscar movimiento
                  <span className="relative mt-1 block">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fog"
                      aria-hidden="true"
                    />
                    <input
                      className="w-full min-w-0 rounded-lg border border-line bg-card py-2.5 pr-3 pl-9 text-ink"
                      type="search"
                      value={movementSearch}
                      onChange={(event) => {
                        setMovementSearch(event.target.value);
                        resetMovementPage();
                      }}
                      placeholder="Ej.: pase del día, nombre del cliente, efectivo"
                    />
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(permissions.expenses
                    ? (["all", "income", "expense"] as const)
                    : (["all", "income"] as const)
                  ).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => {
                        setFilter(f);
                        resetMovementPage();
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[0.75rem] font-semibold transition-colors",
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

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-fog">
                  <p>
                    {filtered.length}{" "}
                    {filtered.length === 1 ? "movimiento" : "movimientos"} de{" "}
                    {recent.length} cargados
                  </p>
                  {filtered.length > 0 && (
                    <p>
                      Mostrando {safeMovementPage * MOVEMENT_PAGE_SIZE + 1}–
                      {safeMovementPage * MOVEMENT_PAGE_SIZE +
                        visibleMovements.length}{" "}
                      de {filtered.length}
                    </p>
                  )}
                </div>

                {filtered.length === 0 ? (
                  <p className="rounded-2xl border border-line bg-card py-8 text-center text-[0.875rem] text-fog">
                    {isDemo
                      ? "Conectá Supabase para ver los movimientos reales del gimnasio."
                      : "Sin movimientos con esa búsqueda o esos filtros."}
                  </p>
                ) : (
                  <>
                    <ul className="grid gap-2 xl:grid-cols-2">
                      {visibleMovements.map((t) => (
                        <MovementItem
                          key={t.id}
                          t={t}
                          methodName={methodNameFor(t)}
                          canVoid={permissions.void}
                        />
                      ))}
                    </ul>
                    {movementPageCount > 1 && (
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                          disabled={safeMovementPage === 0}
                          onClick={() =>
                            setMovementPage(safeMovementPage - 1)
                          }
                        >
                          Anterior
                        </button>
                        <p className="text-center text-sm text-fog">
                          Página {safeMovementPage + 1} de {movementPageCount}
                        </p>
                        <button
                          type="button"
                          className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                          disabled={
                            safeMovementPage >= movementPageCount - 1
                          }
                          onClick={() =>
                            setMovementPage(safeMovementPage + 1)
                          }
                        >
                          Siguiente
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {openModule === "cuentas" && (
          <div className="space-y-4">
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-label="Vista de cuentas"
            >
              {(
                [
                  ["cuentas", "Ver cuentas"],
                  ["filtros", "Filtros"],
                ] as const
              ).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={accountView === view}
                  onClick={() => setAccountView(view)}
                  className={cn(
                    "rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                    accountView === view
                      ? "bg-brand text-onbrand"
                      : "border border-line bg-paper text-ink hover:border-brand",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {accountView === "filtros" ? (
              <div className="space-y-5 rounded-2xl border border-line bg-card p-4 sm:p-5">
                <FilterGroup
                  title="Tipo de cuenta"
                  value={accountKind}
                  options={[
                    { value: "all", label: "Todos los tipos" },
                    ...accountKindOptions.map((kind) => ({
                      value: kind,
                      label: accountKindLabel(kind),
                    })),
                  ]}
                  onChange={setAccountKind}
                />
                <FilterGroup
                  title="Moneda"
                  value={accountCurrency}
                  options={[
                    { value: "all", label: "Todas" },
                    { value: "NIO", label: "NIO" },
                    { value: "USD", label: "USD" },
                  ]}
                  onChange={(value) =>
                    setAccountCurrency(value as "all" | Currency)
                  }
                />
                <button
                  type="button"
                  className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
                  onClick={() => {
                    setAccountKind("all");
                    setAccountCurrency("all");
                    setAccountView("cuentas");
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            ) : visibleAccounts.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line bg-card py-8 text-center text-sm text-fog">
                {accounts.length === 0
                  ? isDemo
                    ? "Cargá Supabase para ver las cuentas del gimnasio."
                    : "Sin cuentas activas."
                  : "Sin cuentas con esos filtros."}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {visibleAccounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-300">
                        <CreditCard className="size-5" aria-hidden="true" />
                      </span>
                      <Badge className="border-line bg-night-3 text-mist">
                        {account.currency}
                      </Badge>
                    </div>
                    <p
                      title={account.name}
                      className="line-clamp-3 min-h-[3.75rem] break-words text-sm leading-snug font-semibold text-ink sm:line-clamp-2 sm:min-h-10"
                    >
                      {account.name}
                    </p>
                    <p className="text-[0.68rem] font-semibold tracking-wide text-fog uppercase">
                      {accountKindLabel(account.kind)}
                    </p>
                    <div className="mt-auto">
                      {permissions.accountBalances &&
                      account.balance !== undefined ? (
                        <>
                          <p className="text-[0.68rem] font-semibold tracking-wide text-fog uppercase">
                            Saldo informado
                          </p>
                          <p className="mt-1 font-mono text-base font-bold break-words text-ink tabular-nums">
                            {formatMoney(account.balance, account.currency)}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-fog">
                          Cuenta en {account.currency}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {openModule === "metodos" && permissions.charts && (
          methods.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card py-8 text-center text-sm text-fog">
              Sin movimientos registrados todavía.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {methods.slice(0, 8).map((method) => {
                const total = method.incomeNio + method.expenseNio;
                return (
                  <li
                    key={`${method.paymentMethodId ?? "none"}-${method.nameEs}`}
                    className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-card p-4"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-300">
                      {iconFor(method.icon)}
                    </span>
                    <p
                      title={method.nameEs ?? "Sin método informado"}
                      className="line-clamp-3 min-h-[3.75rem] break-words text-sm leading-snug font-semibold text-ink sm:line-clamp-2 sm:min-h-10"
                    >
                      {method.nameEs ?? "Sin método informado"}
                    </p>
                    <p className="text-xs text-fog">
                      {method.txCount}{" "}
                      {method.txCount === 1 ? "movimiento" : "movimientos"}
                    </p>
                    <div className="mt-auto space-y-1 text-xs">
                      <p className="flex flex-wrap justify-between gap-x-2">
                        <span className="text-fog">Ingresos</span>
                        <span className="font-mono font-semibold text-brand-300 tabular-nums">
                          {method.incomeNio > 0
                            ? `+${formatMoney(method.incomeNio)}`
                            : "—"}
                        </span>
                      </p>
                      <p className="flex flex-wrap justify-between gap-x-2">
                        <span className="text-fog">Egresos</span>
                        <span className="font-mono font-semibold text-ink tabular-nums">
                          {method.expenseNio > 0
                            ? `−${formatMoney(method.expenseNio)}`
                            : "—"}
                        </span>
                      </p>
                      <p className="border-t border-line pt-2">
                        <span className="block text-[0.68rem] font-semibold tracking-wide text-fog uppercase">
                          Volumen NIO
                        </span>
                        <span className="mt-0.5 block font-mono text-base font-bold break-words text-ink tabular-nums">
                          {formatMoney(total)}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {openModule === "graficos" && permissions.charts && (
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-line bg-card p-5">
              <MiniBar
                data={dailyChart}
                label="Ingresos NIO · 14 días con registros"
              />
            </div>
            {permissions.monthlyResult ? (
              <div className="min-w-0 rounded-2xl border border-line bg-card p-5">
                <MiniBar
                  data={monthlyChart}
                  label="Resultado NIO · 6 meses con registros"
                />
              </div>
            ) : null}
          </div>
        )}

        {openModule === "ayuda" && (
          <div className="space-y-4 rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed text-fog">
            {summary.sourceModel === "bank_accounts_split" ? (
              <>
                <p>
                  <strong className="text-ink">Cobros por servicio:</strong>{" "}
                  desde la ficha del cliente.{" "}
                  <strong className="text-ink">Gastos:</strong> desde
                  Registrar gasto. Cada formulario verifica la actualización y
                  los permisos antes de habilitarse. No aplica deudas,
                  créditos ni renovaciones automáticamente.
                </p>
                <p>
                  Ingresos, egresos y resultados usan los equivalentes NIO
                  guardados en cada movimiento; no se convierten con una tasa
                  nueva. Los cortes son en America/Managua. Los saldos de
                  cuentas se muestran en su propia moneda y no se recalculan
                  ni certifican.
                </p>
                {summary.openRegister && (
                  <p>
                    Última sesión abierta informada: apertura NIO{" "}
                    {formatMoney(summary.openRegister.openingAmount)} · USD{" "}
                    {formatMoney(
                      summary.openRegister.openingAmountUsd ?? 0,
                      "USD",
                    )}
                    . No es un arqueo confirmado.
                  </p>
                )}
              </>
            ) : (
              <p>
                Las conversiones deben usar la tasa guardada en cada
                movimiento, no una tasa fija. Los saldos se leen en la moneda
                de cada cuenta.
              </p>
            )}
          </div>
        )}
      </section>
    )}
    </>
  );
}

function ModuleAction({
  title,
  hint,
  Icon,
  href,
  onClick,
}: {
  title: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
}) {
  const className =
    "group flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-line bg-card p-4 text-left shadow-[0_10px_26px_-18px_rgba(0,0,0,0.9)] transition hover:border-brand/70 hover:bg-brand/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  const content = (
    <>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-300">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 block min-h-10 break-words text-sm leading-snug font-semibold text-ink">
          {title}
        </span>
        <span className="line-clamp-3 mt-1 block text-xs leading-snug break-words text-fog">
          {hint}
        </span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-brand-300">
        Abrir
        <ChevronRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </>
  );
  return href ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function FilterGroup({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{title}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "max-w-full rounded-full border px-3 py-2 text-xs font-semibold break-words transition-colors",
              value === option.value
                ? "border-brand bg-brand text-onbrand"
                : "border-line bg-paper text-mist hover:border-brand/70 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MovementItem({
  t,
  methodName,
  canVoid,
}: {
  t: Transaction;
  methodName: string;
  /** El servidor ya decidió el interruptor; acá solo se muestra el botón. */
  canVoid?: boolean;
}) {
  return (
    <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border border-line bg-card p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
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
        <p className="break-words text-[0.6875rem] text-fog">
          {new Date(t.occurredAt).toLocaleDateString("es-NI", {
            day: "2-digit",
            month: "short",
            timeZone: "America/Managua",
          })}
          {" · "}
          {methodName}
          {" · "}
          {t.direction === "transfer" ? "Transferencia · " : ""}
          {transactionStatusLabel(t.status)}
        </p>
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:gap-1">
        <p
          className={cn(
            "min-w-0 text-right font-mono text-[0.9375rem] font-semibold tabular-nums",
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
        {canVoid && t.status === "completed" && t.direction !== "transfer" && (
          <VoidMovementButton
            transactionId={t.id}
            concept={t.concept}
            amount={t.amount}
            currency={t.currency}
          />
        )}
      </div>
    </li>
  );
}

/* ---- Helper: lee la locale desde window ---- */
function readLocale(): string {
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
