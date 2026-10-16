import "server-only";

import { cache } from "react";
import { resolveCurrentUser } from "@/lib/auth/current-user";
export type { AuthUser } from "@/lib/auth/current-user";

import { getWeekRange, weekRangeFromKey } from "@/lib/schedule";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  Booking,
  BookingDetail,
  Coach,
  ContactMessage,
  GymClass,
  Plan,
  SessionDetail,
  WeekRange,
} from "@/lib/types";
import { demoClasses, demoCoaches, demoPlans } from "./demo-content";
import { generateWeekSessions } from "./demo-sessions";

/**
 * ============================================================
 *  Consultas de datos
 * ============================================================
 *  Cada función intenta leer de Supabase y, si no está configurado
 *  (o si algo falla), devuelve el contenido de ejemplo. Así la web
 *  nunca se rompe ni queda en blanco.
 */

/* ------------------------------------------------------------
   Contenido estático
   ------------------------------------------------------------ */

export async function getClasses(): Promise<GymClass[]> {
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!error && data && data.length > 0) return data as GymClass[];
    } catch {
      // cae al modo demo
    }
  }

  return demoClasses.filter((c) => c.is_active);
}

export async function getCoaches(): Promise<Coach[]> {
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("coaches")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!error && data && data.length > 0) return data as Coach[];
    } catch {
      // cae al modo demo
    }
  }

  return demoCoaches.filter((c) => c.is_active);
}

export async function getPlans(): Promise<Plan[]> {
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!error && data && data.length > 0) return data as Plan[];
    } catch {
      // cae al modo demo
    }
  }

  return demoPlans.filter((p) => p.is_active);
}

/* ------------------------------------------------------------
   Clases de la semana
   ------------------------------------------------------------ */

interface RawSessionRow {
  id: string;
  class_id: string;
  coach_id: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  room: string;
  status: "scheduled" | "cancelled";
  gymClass?: GymClass | null;
  coach?: Coach | null;
}

export async function getSessionsForWeek(weekKey?: string | null): Promise<{
  week: WeekRange;
  sessions: SessionDetail[];
}> {
  const week = weekRangeFromKey(weekKey);
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return { week, sessions: generateWeekSessions(week) };
  }

  try {
    const { data, error } = await supabase
      .from("sessions")
      .select(
        `id, class_id, coach_id, starts_at, ends_at, capacity, room, status,
         gymClass:classes (*),
         coach:coaches (*)`,
      )
      .gte("starts_at", week.start.toISOString())
      .lte("starts_at", week.end.toISOString())
      .order("starts_at", { ascending: true });

    if (error || !data) throw error ?? new Error("sin datos");

    // La ocupación la da una vista pública que sólo expone conteos
    // (las reservas están protegidas por RLS).
    const rows = data as unknown as RawSessionRow[];
    const occupancy = new Map<string, number>();

    if (rows.length > 0) {
      const { data: occupancyData } = await supabase
        .from("session_occupancy")
        .select("session_id, booked_count")
        .in(
          "session_id",
          rows.map((row) => row.id),
        );

      for (const item of (occupancyData ?? []) as {
        session_id: string;
        booked_count: number;
      }[]) {
        occupancy.set(item.session_id, Number(item.booked_count ?? 0));
      }
    }

    const sessions: SessionDetail[] = rows
      .filter((row) => row.gymClass)
      .map((row) => {
        const bookedCount = occupancy.get(row.id) ?? 0;
        const capacity = row.capacity ?? row.gymClass?.capacity ?? 0;
        return {
          id: row.id,
          class_id: row.class_id,
          coach_id: row.coach_id,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          capacity,
          room: row.room,
          status: row.status,
          gymClass: row.gymClass as GymClass,
          coach: row.coach ?? null,
          bookedCount,
          spotsLeft: Math.max(0, capacity - bookedCount),
        };
      });

    return { week, sessions };
  } catch {
    return { week, sessions: generateWeekSessions(week) };
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

export async function getMyBookings(userId: string): Promise<BookingDetail[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        `id, session_id, user_id, status, created_at, cancelled_at,
         session:sessions (
           id, class_id, coach_id, starts_at, ends_at, capacity, room, status,
           gymClass:classes (*),
           coach:coaches (*)
         )`,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    type Row = Booking & {
      session: Omit<SessionDetail, "bookedCount" | "spotsLeft" | "gymClass" | "coach"> & {
        gymClass: GymClass;
        coach: Coach | null;
      };
    };

    return (data as unknown as Row[])
      .filter((row) => row.session && row.session.gymClass)
      .map((row) => ({
        id: row.id,
        session_id: row.session_id,
        user_id: row.user_id,
        status: row.status,
        created_at: row.created_at,
        cancelled_at: row.cancelled_at,
        session: {
          ...row.session,
          capacity: row.session.capacity ?? row.session.gymClass.capacity,
          gymClass: row.session.gymClass,
          coach: row.session.coach ?? null,
          bookedCount: 0,
          spotsLeft: 0,
        },
      }));
  } catch {
    return [];
  }
}

/** IDs de las clases en las que el usuario ya tiene reserva. */
export async function getBookedSessionIds(userId: string): Promise<string[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];

  try {
    const { data } = await supabase
      .from("bookings")
      .select("session_id")
      .eq("user_id", userId)
      .in("status", ["confirmed", "attended"]);

    return (data ?? []).map((row: { session_id: string }) => row.session_id);
  } catch {
    return [];
  }
}

export async function getAllBookings(): Promise<
  (Booking & { memberName: string; memberEmail: string; session: SessionDetail })[]
> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        `id, session_id, user_id, status, created_at, cancelled_at,
         profile:profiles (full_name, email),
         session:sessions (
           id, class_id, coach_id, starts_at, ends_at, capacity, room, status,
           gymClass:classes (*), coach:coaches (*)
         )`,
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (error || !data) return [];

    type Row = Booking & {
      profile: { full_name: string | null; email: string | null } | null;
      session: (Omit<SessionDetail, "bookedCount" | "spotsLeft"> & { gymClass: GymClass }) | null;
    };

    return (data as unknown as Row[])
      .filter((row) => row.session?.gymClass)
      .map((row) => ({
        id: row.id,
        session_id: row.session_id,
        user_id: row.user_id,
        status: row.status,
        created_at: row.created_at,
        cancelled_at: row.cancelled_at,
        memberName: row.profile?.full_name ?? "Cliente",
        memberEmail: row.profile?.email ?? "",
        session: {
          ...(row.session as SessionDetail),
          capacity: row.session!.capacity ?? row.session!.gymClass.capacity,
          bookedCount: 0,
          spotsLeft: 0,
        },
      }));
  } catch {
    return [];
  }
}

export async function getContactMessages(): Promise<ContactMessage[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error || !data) return [];
    return data as ContactMessage[];
  } catch {
    return [];
  }
}

export async function countMembers(): Promise<number> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return 0;
  const { count, error } = await supabase.from("gym_clients").select("id", { count: "exact", head: true });
  if (!error) return count ?? 0;
  // Compatibilidad antes de instalar FASE2: no cuenta staff/admin como clientes.
  const legacy = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "member");
  return legacy.count ?? 0;
}


/* ============================================================
   FASE 1: Finanzas, caja y contabilidad
   ============================================================ */

export type Currency = "NIO" | "USD";

export interface PaymentMethod {
  id: string;
  slug: string;
  kind: string;
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
  isActive: boolean;
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
  isActive: boolean;
}

export interface Transaction {
  id: string;
  occurredAt: string;
  direction: "income" | "expense";
  status: "pending" | "completed" | "reversed";
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
  memberId: string;
  fullName: string;
  email: string;
  phone: string | null;
  invoicesOpen: number;
  totalOwedNio: number;
  oldestDue: string | null;
  daysOverdue: number;
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map(mapPaymentMethod);
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map(mapExpenseCategory);
}

export async function getAccounts(): Promise<Account[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map(mapAccount);
}

export async function getRecentTransactions(limit = 30): Promise<Transaction[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];
  let { data, error } = await supabase
    .from("transactions")
    .select("*, member:profiles!transactions_member_id_fkey(full_name), client:gym_clients!transactions_client_id_fkey(full_name)")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) {
    const legacy = await supabase.from("transactions").select("*, member:profiles!transactions_member_id_fkey(full_name)").order("occurred_at", { ascending: false }).limit(limit);
    data = legacy.data as typeof data;
    error = legacy.error;
  }
  if (error) return [];
  return (data ?? []).map((row) => mapTransaction(row));
}

export async function getDailyCash(days = 14): Promise<DailyCashRow[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("v_daily_cash")
    .select("*")
    .limit(days);
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
  if (!supabase) return [];
  const { data } = await supabase
    .from("v_monthly_pnl")
    .select("*")
    .limit(months);
  return (data ?? []).map((r) => ({
    month: String(r.month),
    incomeNio: Number(r.income_nio ?? 0),
    expenseNio: Number(r.expense_nio ?? 0),
    netNio: Number(r.net_nio ?? 0),
  }));
}

export async function getPaymentMethodsBreakdown(): Promise<PaymentMethodBreakdown[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("v_payment_methods_breakdown")
    .select("*");
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

export async function getAccountsReceivable(): Promise<AccountsReceivableRow[]> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase.from("v_accounts_receivable").select("*");
  return (data ?? []).map((r) => ({
    memberId: r.member_id,
    fullName: r.full_name ?? "—",
    email: r.email ?? "",
    phone: r.phone,
    invoicesOpen: Number(r.invoices_open ?? 0),
    totalOwedNio: Number(r.total_owed_nio ?? 0),
    oldestDue: r.oldest_due,
    daysOverdue: Number(r.days_overdue ?? 0),
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
  pendingInvoices: number;
  totalOwed: number;
  openRegister: {
    id: string;
    openedAt: string;
    openingAmount: number;
  } | null;
}

export async function getCashSummary(): Promise<CashSummary> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return {
      incomeToday: 0, expenseToday: 0, netToday: 0, txToday: 0,
      incomeMonth: 0, expenseMonth: 0, netMonth: 0, txMonth: 0,
      pendingInvoices: 0, totalOwed: 0, openRegister: null,
    };
  }
  // Hoy
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayRows } = await supabase
    .from("v_daily_cash")
    .select("*")
    .eq("day", today)
    .maybeSingle();
  // Mes
  const monthStart = new Date();
  monthStart.setDate(1);
  const { data: monthRows } = await supabase
    .from("v_monthly_pnl")
    .select("*")
    .gte("month", monthStart.toISOString())
    .maybeSingle();
  // Cuentas por cobrar
  const { data: ar } = await supabase.from("v_accounts_receivable").select("total_owed_nio");
  // Caja abierta
  const { data: open } = await supabase
    .from("cash_registers")
    .select("id, opened_at, opening_amount")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
    totalOwed: (ar ?? []).reduce((a, b) => a + Number(b.total_owed_nio ?? 0), 0),
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
    kind: r.kind as string,
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
    isActive: r.is_active as boolean,
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
    isActive: r.is_active as boolean,
  };
}

function mapTransaction(r: Record<string, unknown>): Transaction {
  const member = r.member as { full_name?: string } | null;
  return {
    id: r.id as string,
    occurredAt: r.occurred_at as string,
    direction: r.direction as "income" | "expense",
    status: r.status as "pending" | "completed" | "reversed",
    amount: Number(r.amount ?? 0),
    currency: r.currency as Currency,
    fxRate: Number(r.fx_rate ?? 1),
    baseAmount: Number(r.base_amount ?? 0),
    paymentMethodId: (r.payment_method_id as string) ?? null,
    accountId: (r.account_id as string) ?? null,
    memberId: (r.member_id as string) ?? null,
    memberName: (r.client as {full_name?:string}|null)?.full_name ?? member?.full_name ?? null,
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
