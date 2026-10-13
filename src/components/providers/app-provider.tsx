"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/* ============================================================
   Tipos
   ============================================================ */

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: "member" | "staff" | "admin";
  phone: string | null;
  planId: string | null;
  createdAt: string;
  /** true cuando la sesión es simulada (sin Supabase conectado). */
  isDemo: boolean;
}

export type BookingStatus = "confirmed" | "cancelled" | "attended" | "no_show";

export interface AppBooking {
  id: string;
  sessionId: string;
  status: BookingStatus;
  createdAt: string;
}

export type BookingErrorCode =
  | "AUTH"
  | "FULL"
  | "ALREADY_BOOKED"
  | "PAST"
  | "CANCELLED"
  | "TOO_LATE"
  | "NOT_FOUND"
  | "UNKNOWN";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface AppContextValue {
  user: AppUser | null;
  isDemo: boolean;
  authLoading: boolean;
  /** true cuando ya leímos la sesión del navegador (evita parpadeos). */
  hydrated: boolean;
  bookings: AppBooking[];
  bookedSessionIds: Set<string>;
  book: (sessionId: string) => Promise<{ ok: boolean; error?: BookingErrorCode }>;
  cancelBooking: (bookingId: string, sessionId: string) => Promise<{ ok: boolean; error?: BookingErrorCode }>;
  cancelBySessionId: (sessionId: string) => Promise<{ ok: boolean; error?: BookingErrorCode }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (data: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (data: { fullName?: string; phone?: string }) => Promise<boolean>;
  toast: (message: string, type?: ToastType) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/* ============================================================
   Almacenamiento local (modo demo)
   ============================================================ */

const DEMO_USERS_KEY = "strong-gym:demo-users";
const DEMO_SESSION_KEY = "strong-gym:demo-session";
const demoBookingsKey = (userId: string) => `strong-gym:demo-bookings:${userId}`;

/** Cuenta de ejemplo para que puedas ver el panel de administración. */
const SEED_ADMIN = {
  id: "demo-admin",
  email: "admin@stronggym.com",
  password: "admin123",
  fullName: "Administrador Strong",
  role: "admin" as const,
  phone: "+505 8888 1234",
  planId: "pln_full",
  createdAt: "2024-01-15T12:00:00.000Z",
};

interface DemoStoredUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: "member" | "staff" | "admin";
  phone: string | null;
  planId: string | null;
  createdAt: string;
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // almacenamiento lleno o bloqueado: seguimos sin persistir
  }
}

function demoUsers(): DemoStoredUser[] {
  const stored = readJSON<DemoStoredUser[]>(DEMO_USERS_KEY, []);
  if (!stored.some((u) => u.email === SEED_ADMIN.email)) {
    return [SEED_ADMIN, ...stored];
  }
  return stored;
}

function toAppUser(stored: DemoStoredUser): AppUser {
  return {
    id: stored.id,
    email: stored.email,
    fullName: stored.fullName,
    role: stored.role,
    phone: stored.phone,
    planId: stored.planId,
    createdAt: stored.createdAt,
    isDemo: true,
  };
}

/* ============================================================
   Provider
   ============================================================ */

export function AppProvider({
  children,
  initialUser,
  isDemo,
}: {
  children: ReactNode;
  initialUser: AppUser | null;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(initialUser);
  const [hydrated, setHydrated] = useState(!isDemo);
  const [authLoading, setAuthLoading] = useState(false);
  const [bookings, setBookings] = useState<AppBooking[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  /* ---------- feedback ---------- */

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info") => {
      toastId.current += 1;
      const id = toastId.current;
      setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
      window.setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  /* ---------- carga inicial ---------- */

  useEffect(() => {
    if (!isDemo) return;

    const sessionId = readJSON<string | null>(DEMO_SESSION_KEY, null);
    const users = demoUsers();
    const stored = sessionId ? users.find((u) => u.id === sessionId) : undefined;
    setUser(stored ? toAppUser(stored) : null);
    setHydrated(true);
  }, [isDemo]);

  // Con Supabase conectado, el usuario llega desde el servidor (layout)
  // y se actualiza cada vez que hacemos router.refresh() después del login.
  useEffect(() => {
    if (isDemo) return;
    setUser(initialUser);
  }, [initialUser, isDemo]);

  const loadBookings = useCallback(async () => {
    if (isDemo) {
      if (!user) {
        setBookings([]);
        return;
      }
      setBookings(readJSON<AppBooking[]>(demoBookingsKey(user.id), []));
      return;
    }

    if (!user) {
      setBookings([]);
      return;
    }

    try {
      const response = await fetch("/api/bookings", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as {
        bookings: { id: string; session_id: string; status: BookingStatus; created_at: string }[];
      };
      setBookings(
        (data.bookings ?? []).map((b) => ({
          id: b.id,
          sessionId: b.session_id,
          status: b.status,
          createdAt: b.created_at,
        })),
      );
    } catch {
      // sin conexión: dejamos lo que había
    }
  }, [isDemo, user]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const persistDemoBookings = useCallback(
    (next: AppBooking[]) => {
      setBookings(next);
      if (user) writeJSON(demoBookingsKey(user.id), next);
    },
    [user],
  );

  /* ---------- reservas ---------- */

  const book = useCallback<AppContextValue["book"]>(
    async (sessionId) => {
      if (!user) return { ok: false, error: "AUTH" };

      if (isDemo) {
        const existing = bookings.find(
          (b) => b.sessionId === sessionId && (b.status === "confirmed" || b.status === "attended"),
        );
        if (existing) return { ok: false, error: "ALREADY_BOOKED" };

        const cancelled = bookings.find((b) => b.sessionId === sessionId);
        const booking: AppBooking = {
          id: cancelled?.id ?? `demo-bk-${sessionId}-${Date.now()}`,
          sessionId,
          status: "confirmed",
          createdAt: new Date().toISOString(),
        };
        persistDemoBookings([booking, ...bookings.filter((b) => b.sessionId !== sessionId)]);
        return { ok: true };
      }

      try {
        const response = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (response.ok) {
          await loadBookings();
          return { ok: true };
        }
        const data = (await response.json().catch(() => ({}))) as { error?: BookingErrorCode };
        return { ok: false, error: data.error ?? "UNKNOWN" };
      } catch {
        return { ok: false, error: "UNKNOWN" };
      }
    },
    [isDemo, user, bookings, persistDemoBookings, loadBookings],
  );

  const cancelBooking = useCallback<AppContextValue["cancelBooking"]>(
    async (bookingId, sessionId) => {
      if (!user) return { ok: false, error: "AUTH" };

      if (isDemo) {
        persistDemoBookings(
          bookings.map((b) =>
            b.id === bookingId
              ? { ...b, status: "cancelled" as BookingStatus }
              : b,
          ),
        );
        return { ok: true };
      }

      try {
        const response = await fetch(`/api/bookings?id=${encodeURIComponent(bookingId)}`, {
          method: "DELETE",
        });
        if (response.ok) {
          await loadBookings();
          return { ok: true };
        }
        const data = (await response.json().catch(() => ({}))) as { error?: BookingErrorCode };
        return { ok: false, error: data.error ?? "UNKNOWN" };
      } catch {
        return { ok: false, error: "UNKNOWN" };
      }
    },
    [isDemo, user, bookings, persistDemoBookings, loadBookings],
  );

  const cancelBySessionId = useCallback<AppContextValue["cancelBySessionId"]>(
    async (sessionId) => {
      const booking = bookings.find(
        (b) => b.sessionId === sessionId && (b.status === "confirmed" || b.status === "attended"),
      );
      if (!booking) return { ok: false, error: "NOT_FOUND" };
      return cancelBooking(booking.id, sessionId);
    },
    [bookings, cancelBooking],
  );

  /* ---------- autenticación ---------- */

  const signIn = useCallback<AppContextValue["signIn"]>(
    async (email, password) => {
      setAuthLoading(true);
      try {
        if (isDemo) {
          const found = demoUsers().find(
            (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
          );
          if (!found || found.password !== password) {
            return { ok: false, error: "invalidCredentials" };
          }
          writeJSON(DEMO_SESSION_KEY, found.id);
          setUser(toAppUser(found));
          return { ok: true };
        }

        const supabase = getSupabaseBrowserClient();
        if (!supabase) return { ok: false, error: "genericError" };

        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          const message = error.message.toLowerCase();
          if (message.includes("invalid") || message.includes("credentials")) {
            return { ok: false, error: "invalidCredentials" };
          }
          return { ok: false, error: "genericError" };
        }

        router.refresh();
        return { ok: true };
      } finally {
        setAuthLoading(false);
      }
    },
    [isDemo, router],
  );

  const signUp = useCallback<AppContextValue["signUp"]>(
    async ({ fullName, email, password, phone }) => {
      setAuthLoading(true);
      try {
        if (isDemo) {
          const users = demoUsers();
          if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
            return { ok: false, error: "emailInUse" };
          }
          const created: DemoStoredUser = {
            id: `demo-${Math.random().toString(36).slice(2, 10)}`,
            email: email.trim(),
            password,
            fullName: fullName.trim(),
            role: "member",
            phone: phone ?? null,
            planId: null,
            createdAt: new Date().toISOString(),
          };
          writeJSON(DEMO_USERS_KEY, [...users, created]);
          writeJSON(DEMO_SESSION_KEY, created.id);
          setUser(toAppUser(created));
          return { ok: true };
        }

        const supabase = getSupabaseBrowserClient();
        if (!supabase) return { ok: false, error: "genericError" };

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim(), phone: phone ?? null },
            emailRedirectTo:
              typeof window !== "undefined" ? `${window.location.origin}/es/mi-cuenta` : undefined,
          },
        });

        if (error) {
          const message = error.message.toLowerCase();
          if (message.includes("already") || message.includes("registered")) {
            return { ok: false, error: "emailInUse" };
          }
          if (message.includes("password")) return { ok: false, error: "weakPassword" };
          return { ok: false, error: "genericError" };
        }

        // Si el proyecto exige confirmar el email, no hay sesión todavía.
        if (!data.session) return { ok: true, needsConfirmation: true };

        router.refresh();
        return { ok: true };
      } finally {
        setAuthLoading(false);
      }
    },
    [isDemo, router],
  );

  const signOut = useCallback(async () => {
    if (isDemo) {
      if (typeof window !== "undefined") window.localStorage.removeItem(DEMO_SESSION_KEY);
      setUser(null);
      setBookings([]);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setUser(null);
    setBookings([]);
    router.refresh();
  }, [isDemo, router]);

  const updateProfile = useCallback<AppContextValue["updateProfile"]>(
    async (data) => {
      if (!user) return false;

      if (isDemo) {
        const users = demoUsers().map((u) =>
          u.id === user.id
            ? {
                ...u,
                fullName: data.fullName ?? u.fullName,
                phone: data.phone !== undefined ? data.phone : u.phone,
              }
            : u,
        );
        writeJSON(DEMO_USERS_KEY, users);
        const updated = users.find((u) => u.id === user.id);
        if (updated) setUser(toAppUser(updated));
        return true;
      }

      try {
        const response = await fetch("/api/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (response.ok) {
          router.refresh();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [isDemo, user, router],
  );

  /* ---------- valor del contexto ---------- */

  const bookedSessionIds = useMemo(
    () =>
      new Set(
        bookings
          .filter((b) => b.status === "confirmed" || b.status === "attended")
          .map((b) => b.sessionId),
      ),
    [bookings],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      isDemo,
      authLoading,
      hydrated,
      bookings,
      bookedSessionIds,
      book,
      cancelBooking,
      cancelBySessionId,
      signIn,
      signUp,
      signOut,
      updateProfile,
      toast,
      toasts,
      dismissToast,
    }),
    [
      user,
      isDemo,
      authLoading,
      hydrated,
      bookings,
      bookedSessionIds,
      book,
      cancelBooking,
      cancelBySessionId,
      signIn,
      signUp,
      signOut,
      updateProfile,
      toast,
      toasts,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp() tiene que usarse dentro de <AppProvider>");
  return context;
}
