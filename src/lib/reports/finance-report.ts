/**
 * Reportes financieros: cálculo puro (sin base de datos ni red).
 * Lo usan la pantalla de reportes, el Excel maestro y las pruebas.
 *
 * Reglas:
 * - Día y mes en America/Managua (UTC-6, sin horario de verano).
 * - Sólo movimientos "completed" cuentan como ingreso o gasto. Pendientes y anulados se listan aparte.
 * - Todo se consolida en NIO con el equivalente guardado en cada movimiento (tasa manual, nunca fija).
 * - Las comisiones por método son estimadas y van en columna aparte: no se descuentan de la caja.
 * - Los saldos de deuda y crédito se muestran por moneda; no se convierten entre monedas.
 */

export type Currency = "NIO" | "USD";
export type LedgerKind = "service_income" | "debt_payment" | "expense" | "legacy";

export interface LedgerInput {
  id: string;
  occurredAt: string;
  type: "income" | "expense" | "transfer";
  status: "pending" | "completed" | "cancelled";
  amount: number;
  currency: Currency;
  amountNio: number;
  amountUsd: number;
  fxUsed: number | null;
  methodId: string | null;
  categoryId: string | null;
  accountId: string | null;
  clientId: string | null;
  concept: string;
  reference: string | null;
  /** Desde finance_entries.receipt, si existe. */
  cashReceived?: number | null;
  changeGiven?: number | null;
  /** Desde client_debt_entries.receipt (abonos). */
  debtBefore?: number | null;
  debtAfter?: number | null;
  /** Origen del movimiento según el registro de cobros/gastos. */
  kind: LedgerKind;
}

export interface NameMaps {
  methods: Record<string, { name: string; feePct: number }>;
  categories: Record<string, string>;
  accounts: Record<string, string>;
  clients: Record<string, string>;
}

export interface LedgerRow extends LedgerInput {
  methodName: string;
  feePct: number;
  categoryName: string;
  accountName: string;
  clientName: string;
  /** Equivalente NIO firmado sólo para ordenar/sumar: ingresos positivos, gastos positivos en su columna. */
  commissionNio: number;
}

export interface DebtBalance {
  debtNio: number;
  debtUsd: number;
  creditNio: number;
  creditUsd: number;
}

export interface DebtEntryInput {
  id: string;
  clientId: string;
  occurredAt: string;
  kind: "opening" | "charge" | "payment";
  amount: number | null;
  currency: Currency | null;
  before: DebtBalance | null;
  after: DebtBalance;
  concept: string;
  actorName: string | null;
  transactionId: string | null;
  cashReceived?: number | null;
  changeGiven?: number | null;
}

export interface DebtEntryRow extends DebtEntryInput {
  clientName: string;
}

export interface PendingClient {
  clientId: string;
  clientName: string;
  balance: DebtBalance;
  lastEntryAt: string;
  entries: DebtEntryRow[];
}

const MANAGUA = "America/Managua";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: MANAGUA, year: "numeric", month: "2-digit", day: "2-digit" });

/** Día civil en Managua, formato AAAA-MM-DD. */
export function managuaDay(iso: string | Date): string {
  return dayFmt.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Mes civil en Managua, formato AAAA-MM. */
export function managuaMonth(iso: string | Date): string {
  return managuaDay(iso).slice(0, 7);
}

/** Round to centavos, avoiding float drift. */
export function cents(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function buildRows(inputs: LedgerInput[], maps: NameMaps): LedgerRow[] {
  return inputs.map((r) => {
    const method = r.methodId ? maps.methods[r.methodId] : undefined;
    const feePct = method?.feePct ?? 0;
    const isIncome = r.type === "income";
    return {
      ...r,
      methodName: method?.name ?? (r.methodId ?? "Sin método"),
      feePct,
      categoryName: r.categoryId ? maps.categories[r.categoryId] ?? r.categoryId : "",
      accountName: r.accountId ? maps.accounts[r.accountId] ?? r.accountId : "",
      clientName: r.clientId ? maps.clients[r.clientId] ?? "Cliente" : "",
      commissionNio: isIncome && r.status === "completed" ? cents(r.amountNio * feePct / 100) : 0,
    };
  });
}

const completed = (rows: LedgerRow[]) => rows.filter((r) => r.status === "completed" && r.type !== "transfer");

export interface DailyClose {
  day: string;
  incomeNio: number;
  expenseNio: number;
  netNio: number;
  cashReceivedNio: number;
  changeGivenNio: number;
  commissionNio: number;
  count: number;
  byMethod: { methodName: string; incomeNio: number; count: number }[];
  byCategory: { categoryName: string; expenseNio: number; count: number }[];
  movements: LedgerRow[];
  pending: LedgerRow[];
  cancelled: LedgerRow[];
}

export function dailyClose(rows: LedgerRow[], day: string): DailyClose {
  const dayRows = rows.filter((r) => managuaDay(r.occurredAt) === day);
  const done = completed(dayRows);
  const income = done.filter((r) => r.type === "income");
  const expense = done.filter((r) => r.type === "expense");
  const sum = (xs: LedgerRow[]) => cents(xs.reduce((a, r) => a + r.amountNio, 0));
  const incomeNio = sum(income);
  const expenseNio = sum(expense);
  return {
    day,
    incomeNio,
    expenseNio,
    netNio: cents(incomeNio - expenseNio),
    cashReceivedNio: cents(income.reduce((a, r) => a + (r.cashReceived ? r.cashReceived * (r.fxUsed && r.currency === "USD" ? r.fxUsed : 1) : 0), 0)),
    changeGivenNio: cents(income.reduce((a, r) => a + (r.changeGiven ?? 0), 0)),
    commissionNio: cents(done.reduce((a, r) => a + r.commissionNio, 0)),
    count: done.length,
    byMethod: groupBy(income, (r) => r.methodName).map(([methodName, xs]) => ({
      methodName,
      incomeNio: sum(xs),
      count: xs.length,
    })),
    byCategory: groupBy(expense, (r) => r.categoryName || "Sin categoría").map(([categoryName, xs]) => ({
      categoryName,
      expenseNio: sum(xs),
      count: xs.length,
    })),
    movements: dayRows.filter((r) => r.status === "completed").sort(byTime),
    pending: dayRows.filter((r) => r.status === "pending").sort(byTime),
    cancelled: dayRows.filter((r) => r.status === "cancelled").sort(byTime),
  };
}

export interface MonthRow {
  month: string;
  incomeNio: number;
  expenseNio: number;
  netNio: number;
  commissionNio: number;
  count: number;
  byCategory: { categoryName: string; expenseNio: number }[];
  byKind: { kind: LedgerKind; incomeNio: number }[];
}

/** Últimos `months` meses hasta el mes de `endDay` (incluido), en orden cronológico. */
export function monthlyComparison(rows: LedgerRow[], endDay: string, months = 12): MonthRow[] {
  const [y, m] = endDay.slice(0, 7).split("-").map(Number);
  const list: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    list.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const done = completed(rows);
  return list.map((month) => {
    const xs = done.filter((r) => managuaMonth(r.occurredAt) === month);
    const inc = xs.filter((r) => r.type === "income");
    const exp = xs.filter((r) => r.type === "expense");
    const incomeNio = cents(inc.reduce((a, r) => a + r.amountNio, 0));
    const expenseNio = cents(exp.reduce((a, r) => a + r.amountNio, 0));
    return {
      month,
      incomeNio,
      expenseNio,
      netNio: cents(incomeNio - expenseNio),
      commissionNio: cents(xs.reduce((a, r) => a + r.commissionNio, 0)),
      count: xs.length,
      byCategory: groupBy(exp, (r) => r.categoryName || "Sin categoría").map(([categoryName, ys]) => ({
        categoryName,
        expenseNio: cents(ys.reduce((a, r) => a + r.amountNio, 0)),
      })),
      byKind: groupBy(inc, (r) => r.kind).map(([kind, ys]) => ({
        kind: kind as LedgerKind,
        incomeNio: cents(ys.reduce((a, r) => a + r.amountNio, 0)),
      })),
    };
  });
}

export interface CommissionRow {
  methodName: string;
  feePct: number;
  grossNio: number;
  commissionNio: number;
  count: number;
}

/** Comisión estimada por método sobre ingresos completados. Informativa: no altera la caja. */
export function commissionsByMethod(rows: LedgerRow[], fromDay: string, toDay: string): CommissionRow[] {
  const inc = completed(rows).filter((r) => r.type === "income" && managuaDay(r.occurredAt) >= fromDay && managuaDay(r.occurredAt) <= toDay);
  return groupBy(inc, (r) => r.methodName)
    .map(([methodName, xs]) => ({
      methodName,
      feePct: xs[0]?.feePct ?? 0,
      grossNio: cents(xs.reduce((a, r) => a + r.amountNio, 0)),
      commissionNio: cents(xs.reduce((a, r) => a + r.commissionNio, 0)),
      count: xs.length,
    }))
    .sort((a, b) => b.grossNio - a.grossNio);
}

/** Clientes con saldo de deuda o crédito, usando el último saldo registrado de cada cliente. */
export function pendingPayments(entries: DebtEntryRow[]): PendingClient[] {
  const byClient = new Map<string, DebtEntryRow[]>();
  for (const e of entries) {
    const list = byClient.get(e.clientId) ?? [];
    list.push(e);
    byClient.set(e.clientId, list);
  }
  const out: PendingClient[] = [];
  for (const [clientId, list] of byClient) {
    const sorted = [...list].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
    const last = sorted[0];
    const b = last.after;
    if (b.debtNio > 0 || b.debtUsd > 0 || b.creditNio > 0 || b.creditUsd > 0) {
      out.push({
        clientId,
        clientName: last.clientName,
        balance: { debtNio: b.debtNio, debtUsd: b.debtUsd, creditNio: b.creditNio, creditUsd: b.creditUsd },
        lastEntryAt: last.occurredAt,
        entries: sorted,
      });
    }
  }
  return out.sort((a, b) => b.balance.debtNio - a.balance.debtNio || b.balance.debtUsd - a.balance.debtUsd);
}

export interface ExportTotals {
  incomeNio: number;
  expenseNio: number;
  netNio: number;
  commissionNio: number;
  pendingDebtNio: number;
  pendingDebtUsd: number;
}

export function totalsFor(rows: LedgerRow[], pending: PendingClient[], fromDay: string, toDay: string): ExportTotals {
  const done = completed(rows).filter((r) => {
    const d = managuaDay(r.occurredAt);
    return d >= fromDay && d <= toDay;
  });
  const incomeNio = cents(done.filter((r) => r.type === "income").reduce((a, r) => a + r.amountNio, 0));
  const expenseNio = cents(done.filter((r) => r.type === "expense").reduce((a, r) => a + r.amountNio, 0));
  return {
    incomeNio,
    expenseNio,
    netNio: cents(incomeNio - expenseNio),
    commissionNio: cents(done.reduce((a, r) => a + r.commissionNio, 0)),
    pendingDebtNio: cents(pending.reduce((a, p) => a + p.balance.debtNio, 0)),
    pendingDebtUsd: cents(pending.reduce((a, p) => a + p.balance.debtUsd, 0)),
  };
}

export const KIND_LABEL: Record<LedgerKind, string> = {
  service_income: "Cobro por servicio",
  debt_payment: "Abono a deuda",
  expense: "Gasto",
  legacy: "Registro anterior",
};

function byTime(a: LedgerRow, b: LedgerRow) {
  return a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0;
}

export function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k) ?? [];
    list.push(x);
    m.set(k, list);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}
