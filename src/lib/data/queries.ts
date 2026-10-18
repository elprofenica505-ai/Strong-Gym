import { accountPlanSchema, type AccountPlan } from "@/lib/crm/account-plan";
import "server-only";
import {
  BOOKING_COLUMNS,
  SESSION_COLUMNS,
  rowsByIds,
  resolveSessions,
} from "@/lib/data/relations";
import {
  DataReadError,
  checkedRead,
  requireRows,
} from "@/lib/data/read-result";
import { FinanceReadError } from "@/lib/finance/read-result";
import {
  isFinanceSchemaError,
  readBankFinance,
  readDebtReport,
} from "@/lib/finance/legacy-reader";

import { cache } from "react";
import { resolveCurrentUser } from "@/lib/auth/current-user";
export type { AuthUser } from "@/lib/auth/current-user";

import { getWeekRange, weekRangeFromKey } from "@/lib/schedule";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_MODE, isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  Booking,
  BookingDetail,
  Coach,
  ContactMessage,
  GymClass,
  Plan,
  SessionDetail,
  Session,
  WeekRange,
} from "@/lib/types";
import { demoClasses, demoCoaches, demoPlans } from "./demo-content";
import { generateWeekSessions } from "./demo-sessions";

/** Demo sólo sin configuración; conectado: vacío real o error explícito. */
async function operationalClient() {
  return checkedRead("CONNECTION", async () => {
    const db = await getSupabaseServerClient();
    if (!db && !DEMO_MODE)
      throw new DataReadError("CONNECTION", "UNAVAILABLE");
    return db;
  });
}

async function activeRows<T>(
  table: string,
  operation: string,
  demo: T[],
): Promise<T[]> {
  return checkedRead(operation, async () => {
    const db = await operationalClient();
    if (!db) return demo;
    const result = await db
      .from(table)
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .abortSignal(AbortSignal.timeout(15000));
    return requireRows(operation, result) as T[];
  });
}

export async function getClasses(): Promise<GymClass[]> {
  return activeRows(
    "classes",
    "CLASSES",
    demoClasses.filter((c) => c.is_active),
  );
}
export async function getCoaches(): Promise<Coach[]> {
  return activeRows(
    "coaches",
    "COACHES",
    demoCoaches.filter((c) => c.is_active),
  );
}
export async function getPlans(): Promise<Plan[]> {
  return activeRows(
    "plans",
    "PLANS",
    demoPlans.filter((p) => p.is_active),
  );
}

/** Fuente canónica: ficha vinculada a auth.uid(), no profiles.plan_id legado. */
export async function getMyAssignedPlan(): Promise<AccountPlan> {
  return checkedRead("ACCOUNT_PLAN", async () => {
    const db = await operationalClient();
    if (!db) throw new DataReadError("ACCOUNT_PLAN", "UNAVAILABLE");
    const { data, error } = await db.rpc("crm_my_assigned_plan")
      .abortSignal(AbortSignal.timeout(15000));
    if (error) throw new DataReadError("ACCOUNT_PLAN", error.code);
    const parsed = accountPlanSchema.safeParse(data);
    if (!parsed.success) throw new DataReadError("ACCOUNT_PLAN", "INVALID");
    return parsed.data;
  });
}

/* ------------------------------------------------------------
   Clases de la semana
   ------------------------------------------------------------ */

export async function getSessionsForWeek(weekKey?: string | null): Promise<{
  week: WeekRange;
  sessions: SessionDetail[];
}> {
  const week = weekRangeFromKey(weekKey);
  const supabase = await operationalClient();

  if (!supabase) {
    return { week, sessions: generateWeekSessions(week) };
  }

  try {
    const { data, error } = await supabase
      .from("sessions")
      .select(SESSION_COLUMNS)
      .gte("starts_at", week.start.toISOString())
      .lte("starts_at", week.end.toISOString())
      .order("starts_at", { ascending: true })
      .abortSignal(AbortSignal.timeout(15000));

    const rows = requireRows("SESSIONS", {
      data,
      error,
    }) as unknown as Session[];

    // La ocupación la da una vista pública que sólo expone conteos
    // (las reservas están protegidas por RLS).
    const occupancy = new Map<string, number>();

    if (rows.length > 0) {
      const occupancyResult = await supabase
        .from("session_occupancy")
        .select("session_id, booked_count")
        .in(
          "session_id",
          rows.map((row) => row.id),
        )
        .abortSignal(AbortSignal.timeout(15000));

      const occupancyData = requireRows("OCCUPANCY", occupancyResult);
      for (const item of occupancyData as {
        session_id: string;
        booked_count: number;
      }[]) {
        const count = Number(item.booked_count);
        if (
          item.booked_count === null ||
          !Number.isSafeInteger(count) ||
          count < 0
        )
          throw new DataReadError("OCCUPANCY", "INVALID");
        occupancy.set(item.session_id, count);
      }
    }

    const resolved = await resolveSessions(supabase, rows);
    const sessions = rows.map((row) => {
      const session = resolved.get(row.id)!;
      const bookedCount = occupancy.get(row.id) ?? 0;
      return {
        ...session,
        bookedCount,
        spotsLeft: Math.max(0, session.capacity - bookedCount),
      };
    });

    return { week, sessions };
  } catch (error) {
    if (error instanceof DataReadError) throw error;
    throw new DataReadError("SESSIONS");
  }
}

/* ------------------------------------------------------------
   Usuario, reservas y consultas
   ------------------------------------------------------------ */

// React cache deduplica dentro del mismo render, no entre usuarios/peticiones.
export const getCurrentUser = cache(async () => {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  try {
    return await resolveCurrentUser(supabase);
  } catch {
    console.error("[auth/session] No se pudo verificar la sesión");
    return null;
  }
});

/** Carga de reservas y relaciones por IDs bajo la misma sesión/RLS. */
async function bookingSessions(
  db: NonNullable<Awaited<ReturnType<typeof operationalClient>>>,
  bookings: Booking[],
) {
  const rows = await rowsByIds<Session>(
    db,
    "sessions",
    SESSION_COLUMNS,
    bookings.map((row) => row.session_id),
    "BOOKING_SESSIONS",
  );
  return resolveSessions(db, [...rows.values()]);
}

export async function getMyBookings(userId: string): Promise<BookingDetail[]> {
  return checkedRead("BOOKINGS", async () => {
    const db = await operationalClient();
    if (!db) return [];
    const result = await db
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .abortSignal(AbortSignal.timeout(15000));
    const rows = requireRows("BOOKINGS", result) as unknown as Booking[];
    const sessions = await bookingSessions(db, rows);
    return rows.map((row) => ({
      ...row,
      session: sessions.get(row.session_id)!,
    }));
  });
}

/** IDs de las clases en las que el usuario ya tiene reserva. */
export async function getBookedSessionIds(userId: string): Promise<string[]> {
  const supabase = await operationalClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("session_id")
      .eq("user_id", userId)
      .in("status", ["confirmed", "attended"])
      .abortSignal(AbortSignal.timeout(15000));

    return requireRows("BOOKED_IDS", { data, error }).map(
      (row: { session_id: string }) => row.session_id,
    );
  } catch (error) {
    if (error instanceof DataReadError) throw error;
    throw new DataReadError("BOOKED_IDS");
  }
}

export async function getAllBookings(): Promise<
  (Booking & {
    memberName: string;
    memberEmail: string;
    session: SessionDetail;
  })[]
> {
  return checkedRead("BOOKINGS", async () => {
    const db = await operationalClient();
    if (!db) return [];
    const result = await db
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500)
      .abortSignal(AbortSignal.timeout(15000));
    const rows = requireRows("BOOKINGS", result) as unknown as Booking[];
    const [sessions, profiles] = await Promise.all([
      bookingSessions(db, rows),
      rowsByIds<{ id: string; full_name: string | null; email: string | null }>(
        db,
        "profiles",
        "id,full_name,email",
        rows.map((row) => row.user_id),
        "BOOKING_PROFILES",
      ),
    ]);
    return rows.map((row) => ({
      ...row,
      memberName: profiles.get(row.user_id)?.full_name ?? "Cliente",
      memberEmail: profiles.get(row.user_id)?.email ?? "",
      session: sessions.get(row.session_id)!,
    }));
  });
}

export async function getContactMessages(): Promise<ContactMessage[]> {
  const supabase = await operationalClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .abortSignal(AbortSignal.timeout(15000));

    return requireRows("MESSAGES", { data, error }) as ContactMessage[];
  } catch (error) {
    if (error instanceof DataReadError) throw error;
    throw new DataReadError("MESSAGES");
  }
}

export async function countMembers(): Promise<number> {
  return checkedRead("CLIENT_COUNT", async () => {
    const db = await operationalClient();
    if (!db) return 0;
    const result = await db
      .from("gym_clients")
      .select("id", { count: "exact", head: true })
      .abortSignal(AbortSignal.timeout(15000));
    // Compatibilidad sólo si falta la tabla CRM, no por RLS/red u otro error.
    let count = result.count;
    if (result.error) {
      if (!["42P01", "PGRST205"].includes(result.error.code))
        throw new DataReadError("CLIENT_COUNT", result.error.code);
      const legacy = await db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "member")
        .abortSignal(AbortSignal.timeout(15000));
      if (legacy.error)
        throw new DataReadError("CLIENT_COUNT", legacy.error.code);
      count = legacy.count;
    }
    if (count === null || !Number.isSafeInteger(count) || count < 0)
      throw new DataReadError("CLIENT_COUNT", "INVALID");
    return count;
  });
}

/* ============================================================
   FASE 1: Finanzas, caja y contabilidad
   ============================================================ */

export type Currency = "NIO" | "USD";

export interface PaymentMethod {
  id: string;
  slug: string;
  kind: string | null;
  nameEs: string;
  nameEn: string;
  detailsEs: string;
  detailsEn: string;
  acceptsNio: boolean;
  acceptsUsd: boolean;
  icon: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ExpenseCategory {
  id: string;
  slug: string;
  nameEs: string;
  nameEn: string;
  icon: string;
  isActive: boolean | null;
  sortOrder: number;
}

export interface Account {
  id: string;
  slug: string;
  name: string;
  kind: "cash" | "bank" | "wallet";
  currency: Currency;
  bankName: string | null;
  accountNumber: string | null;
  holderName: string | null;
  balance?: number;
  isActive: boolean;
}

export interface Transaction {
  id: string;
  occurredAt: string;
  direction: "income" | "expense" | "transfer";
  status: "pending" | "completed" | "reversed" | "cancelled";
  amount: number;
  currency: Currency;
  fxRate: number;
  baseAmount: number;
  paymentMethodId: string | null;
  accountId: string | null;
  memberId: string | null;
  memberName: string | null;
  invoiceId: string | null;
  expenseCategoryId: string | null;
  concept: string;
  notes: string | null;
  createdBy: string | null;
}

export interface DailyCashRow {
  day: string;
  incomeNio: number;
  expenseNio: number;
  netNio: number;
  txCount: number;
}

export interface MonthlyPnlRow {
  month: string;
  incomeNio: number;
  expenseNio: number;
  netNio: number;
}

export interface PaymentMethodBreakdown {
  paymentMethodId: string | null;
  nameEs: string | null;
  icon: string;
  txCount: number;
  totalNio: number;
  incomeNio: number;
  expenseNio: number;
}

export interface AccountsReceivableRow {
  memberId: string | null;
  clientId?: string;
  fullName: string;
  email: string;
  phone: string | null;
  invoicesOpen: number | null;
  totalOwedNio: number;
  totalOwedUsd?: number;
  oldestDue: string | null;
  daysOverdue: number | null;
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (!DEMO_MODE)
      throw new FinanceReadError("METHODS", "UNAVAILABLE");
    return [];
  }
  let { data, error } = await supabase
    .from("payment_methods")
    .select(
      "id,slug,kind,name_es,name_en,details_es,details_en,accepts_nio,accepts_usd,icon,is_active,sort_order",
    )
    .eq("is_active", true)
    .order("sort_order");
  if (error) {
    if (!isFinanceSchemaError(error.code))
      throw new FinanceReadError("METHODS", error.code);
    data = await readBankFinance<NonNullable<typeof data>>(supabase, "methods");
  }
  return (data ?? []).map(mapPaymentMethod);
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (!DEMO_MODE)
      throw new FinanceReadError("CATEGORIES", "UNAVAILABLE");
    return [];
  }
  let { data, error } = await supabase
    .from("expense_categories")
    .select("id,slug,name_es,name_en,icon,is_active,sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) {
    if (!isFinanceSchemaError(error.code))
      throw new FinanceReadError("CATEGORIES", error.code);
    data = await readBankFinance<NonNullable<typeof data>>(
      supabase,
      "categories",
    );
  }
  return (data ?? []).map(mapExpenseCategory);
}

export async function getAccounts(): Promise<Account[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (!DEMO_MODE)
      throw new FinanceReadError("ACCOUNTS", "UNAVAILABLE");
    return [];
  }
  let { data, error } = await supabase
    .from("accounts")
    .select(
      "id,slug,name,kind,currency,bank_name,account_number,holder_name,is_active",
    )
    .eq("is_active", true)
    .order("name");
  if (error) {
    if (!isFinanceSchemaError(error.code))
      throw new FinanceReadError("ACCOUNTS", error.code);
    data = await readBankFinance<NonNullable<typeof data>>(
      supabase,
      "accounts",
    );
  }
  return (data ?? []).map(mapAccount);
}

export async function getRecentTransactions(
  limit = 30,
): Promise<Transaction[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (!DEMO_MODE)
      throw new FinanceReadError("TRANSACTIONS", "UNAVAILABLE");
    return [];
  }
  let { data, error } = await supabase
    .from("transactions")
    .select(
      "id,occurred_at,direction,status,amount,currency,fx_rate,base_amount,payment_method_id,account_id,member_id,invoice_id,expense_category_id,concept,notes,created_by, member:profiles!transactions_member_id_fkey(full_name), client:gym_clients!transactions_client_id_fkey(full_name)",
    )
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (
    error &&
    ["PGRST200", "PGRST205", "42P01", "42703"].includes(error.code)
  ) {
    const legacy = await supabase
      .from("transactions")
      .select(
        "id,occurred_at,direction,status,amount,currency,fx_rate,base_amount,payment_method_id,account_id,member_id,invoice_id,expense_category_id,concept,notes,created_by, member:profiles!transactions_member_id_fkey(full_name)",
      )
      .order("occurred_at", { ascending: false })
      .limit(limit);
    data = legacy.data as typeof data;
    error = legacy.error;
  }
  if (error) {
    if (!isFinanceSchemaError(error.code))
      throw new FinanceReadError("TRANSACTIONS", error.code);
    data = await readBankFinance<NonNullable<typeof data>>(
      supabase,
      "transactions",
      limit,
    );
  }
  return (data ?? []).map((row) => mapTransaction(row));
}

export async function getDailyCash(days = 14): Promise<DailyCashRow[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (!DEMO_MODE)
      throw new FinanceReadError("DAILY", "UNAVAILABLE");
    return [];
  }
  let { data, error } = await supabase
    .from("v_daily_cash")
    .select("day,income_nio,expense_nio,net_nio,tx_count")
    .limit(days);
  if (error) {
    if (!isFinanceSchemaError(error.code))
      throw new FinanceReadError("DAILY", error.code);
    data = await readBankFinance<NonNullable<typeof data>>(
      supabase,
      "daily",
      days,
    );
  }
  return (data ?? []).map((r) => ({
    day: String(r.day),
    incomeNio: Number(r.income_nio ?? 0),
    expenseNio: Number(r.expense_nio ?? 0),
    netNio: Number(r.net_nio ?? 0),
    txCount: Number(r.tx_count ?? 0),
  }));
}

export async function getMonthlyPnl(months = 6): Promise<MonthlyPnlRow[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (!DEMO_MODE)
      throw new FinanceReadError("MONTHLY", "UNAVAILABLE");
    return [];
  }
  let { data, error } = await supabase
    .from("v_monthly_pnl")
    .select("month,income_nio,expense_nio,net_nio")
    .limit(months);
  if (error) {
    if (!isFinanceSchemaError(error.code))
      throw new FinanceReadError("MONTHLY", error.code);
    data = await readBankFinance<NonNullable<typeof data>>(
      supabase,
      "monthly",
      months,
    );
  }
  return (data ?? []).map((r) => ({
    month: String(r.month),
    incomeNio: Number(r.income_nio ?? 0),
    expenseNio: Number(r.expense_nio ?? 0),
    netNio: Number(r.net_nio ?? 0),
  }));
}

export async function getPaymentMethodsBreakdown(): Promise<
  PaymentMethodBreakdown[]
> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (!DEMO_MODE)
      throw new FinanceReadError("METHOD_TOTALS", "UNAVAILABLE");
    return [];
  }
  let { data, error } = await supabase
    .from("v_payment_methods_breakdown")
    .select(
      "payment_method_id,name_es,icon,tx_count,total_nio,income_nio,expense_nio",
    );
  if (error) {
    if (!isFinanceSchemaError(error.code))
      throw new FinanceReadError("METHOD_TOTALS", error.code);
    data = await readBankFinance<NonNullable<typeof data>>(
      supabase,
      "method_totals",
    );
  }
  return (data ?? []).map((r) => ({
    paymentMethodId: r.payment_method_id,
    nameEs: r.name_es,
    icon: r.icon ?? "Wallet",
    txCount: Number(r.tx_count ?? 0),
    totalNio: Number(r.total_nio ?? 0),
    incomeNio: Number(r.income_nio ?? 0),
    expenseNio: Number(r.expense_nio ?? 0),
  }));
}

export async function getAccountsReceivable(): Promise<
  AccountsReceivableRow[]
> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (!DEMO_MODE)
      throw new FinanceReadError("RECEIVABLES", "UNAVAILABLE");
    return [];
  }
  const consolidated = await readDebtReport<{
    member_id: string | null; client_id?: string; full_name: string | null; email: string | null;
    phone: string | null; invoices_open: null; total_owed_nio: number; total_owed_usd: number;
    oldest_due: null; days_overdue: null;
  }[]>(supabase, "receivables");
  if (consolidated !== null) return consolidated.map(r => ({
    memberId:r.member_id, ...(r.client_id ? {clientId:r.client_id} : {}), fullName:r.full_name ?? "—",
    email:r.email ?? "",phone:r.phone,invoicesOpen:null,totalOwedNio:Number(r.total_owed_nio),
    totalOwedUsd:Number(r.total_owed_usd),oldestDue:null,daysOverdue:null,
  }));
  let { data, error } = await supabase
    .from("v_accounts_receivable")
    .select(
      "member_id,full_name,email,phone,invoices_open,total_owed_nio,oldest_due,days_overdue",
    );
  if (error) {
    if (!isFinanceSchemaError(error.code))
      throw new FinanceReadError("RECEIVABLES", error.code);
    data = await readBankFinance<NonNullable<typeof data>>(
      supabase,
      "receivables",
    );
  }
  return (data ?? []).map((r) => ({
    memberId: r.member_id,
    ...("client_id" in r && typeof r.client_id === "string" ? {clientId:r.client_id} : {}),
    fullName: r.full_name ?? "—",
    email: r.email ?? "",
    phone: r.phone,
    invoicesOpen:
      r.invoices_open === null ? null : Number(r.invoices_open ?? 0),
    totalOwedNio: Number(r.total_owed_nio ?? 0),
    ...("total_owed_usd" in r
      ? { totalOwedUsd: Number(r.total_owed_usd) }
      : {}),
    oldestDue: r.oldest_due,
    daysOverdue: r.days_overdue === null ? null : Number(r.days_overdue ?? 0),
  }));
}

export interface CashSummary {
  incomeToday: number;
  expenseToday: number;
  netToday: number;
  txToday: number;
  incomeMonth: number;
  expenseMonth: number;
  netMonth: number;
  txMonth: number;
  pendingInvoices: number | null;
  totalOwed: number;
  totalOwedUsd?: number;
  sourceModel?: string;
  openRegisterCount?: number;
  openRegister: {
    id: string;
    openedAt: string;
    openingAmount: number;
    openingAmountUsd?: number;
  } | null;
}

export async function getCashSummary(): Promise<CashSummary> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (!DEMO_MODE)
      throw new FinanceReadError("SUMMARY", "UNAVAILABLE");
    return {
      incomeToday: 0,
      expenseToday: 0,
      netToday: 0,
      txToday: 0,
      incomeMonth: 0,
      expenseMonth: 0,
      netMonth: 0,
      txMonth: 0,
      pendingInvoices: 0,
      totalOwed: 0,
      openRegister: null,
    };
  }
  const consolidated = await readDebtReport<CashSummary>(supabase, "summary");
  if (consolidated !== null) return consolidated;
  // Hoy
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayRows, error: todayError } = await supabase
    .from("v_daily_cash")
    .select("day,income_nio,expense_nio,net_nio,tx_count")
    .eq("day", today)
    .maybeSingle();
  // Mes
  const monthStart = new Date();
  monthStart.setDate(1);
  const { data: monthRows, error: monthError } = await supabase
    .from("v_monthly_pnl")
    .select("month,income_nio,expense_nio,net_nio")
    .gte("month", monthStart.toISOString())
    .maybeSingle();
  // Cuentas por cobrar
  const { data: ar, error: arError } = await supabase
    .from("v_accounts_receivable")
    .select("total_owed_nio");
  // Caja abierta
  const { data: open, error: openError } = await supabase
    .from("cash_registers")
    .select("id, opened_at, opening_amount")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const failures = [
    ["SUMMARY_DAY", todayError],
    ["SUMMARY_MONTH", monthError],
    ["SUMMARY_DEBT", arError],
    ["SUMMARY_REGISTER", openError],
  ] as const;
  for (const [operation, error] of failures) {
    if (error && !isFinanceSchemaError(error.code))
      throw new FinanceReadError(operation, error.code);
  }
  if (failures.some(([, error]) => !!error))
    return readBankFinance<CashSummary>(supabase, "summary");

  return {
    incomeToday: Number(todayRows?.income_nio ?? 0),
    expenseToday: Number(todayRows?.expense_nio ?? 0),
    netToday: Number(todayRows?.net_nio ?? 0),
    txToday: Number(todayRows?.tx_count ?? 0),
    incomeMonth: Number(monthRows?.income_nio ?? 0),
    expenseMonth: Number(monthRows?.expense_nio ?? 0),
    netMonth: Number(monthRows?.net_nio ?? 0),
    txMonth: Number(monthRows ? 1 : 0),
    pendingInvoices: (ar ?? []).length,
    totalOwed: (ar ?? []).reduce(
      (a, b) => a + Number(b.total_owed_nio ?? 0),
      0,
    ),
    openRegister: open
      ? {
          id: open.id,
          openedAt: open.opened_at,
          openingAmount: Number(open.opening_amount ?? 0),
        }
      : null,
  };
}

/* ---- mappers snake_case → camelCase ---- */

function mapPaymentMethod(r: Record<string, unknown>): PaymentMethod {
  return {
    id: r.id as string,
    slug: r.slug as string,
    kind: (r.kind as string) ?? null,
    nameEs: r.name_es as string,
    nameEn: r.name_en as string,
    detailsEs: (r.details_es as string) ?? "",
    detailsEn: (r.details_en as string) ?? "",
    acceptsNio: r.accepts_nio as boolean,
    acceptsUsd: r.accepts_usd as boolean,
    icon: (r.icon as string) ?? "Wallet",
    isActive: r.is_active as boolean,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapExpenseCategory(r: Record<string, unknown>): ExpenseCategory {
  return {
    id: r.id as string,
    slug: r.slug as string,
    nameEs: r.name_es as string,
    nameEn: r.name_en as string,
    icon: (r.icon as string) ?? "Receipt",
    isActive: r.is_active === null ? null : (r.is_active as boolean),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapAccount(r: Record<string, unknown>): Account {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    kind: r.kind as Account["kind"],
    currency: r.currency as Currency,
    bankName: (r.bank_name as string) ?? null,
    accountNumber: (r.account_number as string) ?? null,
    holderName: (r.holder_name as string) ?? null,
    ...(r.balance !== undefined ? { balance: Number(r.balance) } : {}),
    isActive: r.is_active as boolean,
  };
}

function mapTransaction(r: Record<string, unknown>): Transaction {
  const member = r.member as { full_name?: string } | null;
  return {
    id: r.id as string,
    occurredAt: r.occurred_at as string,
    direction: r.direction as Transaction["direction"],
    status: r.status as Transaction["status"],
    amount: Number(r.amount ?? 0),
    currency: r.currency as Currency,
    fxRate: Number(r.fx_rate ?? 1),
    baseAmount: Number(r.base_amount ?? 0),
    paymentMethodId: (r.payment_method_id as string) ?? null,
    accountId: (r.account_id as string) ?? null,
    memberId: (r.member_id as string) ?? null,
    memberName:
      (r.client as { full_name?: string } | null)?.full_name ??
      member?.full_name ??
      null,
    invoiceId: (r.invoice_id as string) ?? null,
    expenseCategoryId: (r.expense_category_id as string) ?? null,
    concept: r.concept as string,
    notes: (r.notes as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
  };
}

export { isSupabaseConfigured };

/** Semana actual, para los componentes de servidor. */
export function currentWeek(): WeekRange {
  return getWeekRange();
}

/** Personas con perfil para asignar roles (sólo administrador; la base lo exige). */
export async function getProfilesForRoles(): Promise<
  { id: string; fullName: string; role: string }[]
> {
  return checkedRead("PROFILES_ROLES", async () => {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .order("full_name", { nullsFirst: false })
      .limit(500)
      .abortSignal(AbortSignal.timeout(15000));
    if (error) throw new DataReadError("PROFILES_ROLES", error.code);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      fullName: (row.full_name as string | null) ?? "",
      role: row.role as string,
    }));
  });
}
