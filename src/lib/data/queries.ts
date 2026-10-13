import "server-only";

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
  Profile,
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

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: "member" | "staff" | "admin";
  phone: string | null;
  planId: string | null;
  createdAt: string;
  isDemo: false;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    return {
      id: user.id,
      email: user.email ?? profile?.email ?? "",
      fullName:
        profile?.full_name ??
        (user.user_metadata?.full_name as string | undefined) ??
        user.email?.split("@")[0] ??
        "Socio",
      role: profile?.role ?? "member",
      phone: profile?.phone ?? null,
      planId: profile?.plan_id ?? null,
      createdAt: profile?.created_at ?? user.created_at,
      isDemo: false,
    };
  } catch {
    return null;
  }
}

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
        memberName: row.profile?.full_name ?? "Socio",
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

  try {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}

export { isSupabaseConfigured };

/** Semana actual, para los componentes de servidor. */
export function currentWeek(): WeekRange {
  return getWeekRange();
}
