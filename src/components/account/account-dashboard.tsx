"use client";

import { useEffect, useMemo, useState } from "react";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import {
  CalendarCheck,
  CalendarX,
  Check,
  Clock,
  Loader2,
  LogOut,
  MapPin,
  Pencil,
  Trophy,
  User as UserIcon,
  X,
} from "lucide-react";
import {
  useApp,
  type AppBooking,
  type BookingStatus,
} from "@/components/providers/app-provider";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  formatDateNumeric,
  formatLongDate,
  formatTime,
  getWeekRange,
  gymNow,
  shiftWeeks,
} from "@/lib/schedule";
import type { BookingDetail, Plan, SessionDetail } from "@/lib/types";
import { accentOnDark, cn, textOnAccent } from "@/lib/utils";

/**
 * Panel del cliente.
 *  - Con Supabase las reservas llegan resueltas desde el servidor.
 *  - En modo demo viven en el navegador (AppProvider) y acá las cruzamos
 *    con los horarios de ejemplo para poder mostrarlas.
 */
export function AccountDashboard({
  initialBookings,
  plans,
}: {
  initialBookings: BookingDetail[];
  plans: Plan[];
}) {
  const { dict, locale } = useDictionary();
  const {
    user,
    bookings,
    signOut,
    updateProfile,
    toast,
    isDemo,
    hydrated,
    bookingsError,
    bookingsLoading,
  } = useApp();

  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const now = useMemo(() => gymNow(), []);

  /* ---------- Datos de reservas ---------- */

  const demo = useDemoBookings(isDemo ? bookings : []);

  const resolvedUpcoming: BookingDetail[] = isDemo
    ? demo.upcoming
    : upcomingFrom(initialBookings, now);
  const resolvedHistory: BookingDetail[] = isDemo
    ? []
    : historyFrom(initialBookings, now);
  const totalBookings = isDemo ? bookings.length : initialBookings.length;
  const attendedCount = isDemo
    ? bookings.filter((b) => b.status === "attended").length
    : initialBookings.filter((b) => b.status === "attended").length;

  const currentPlan = plans.find((plan) => plan.id === user?.planId) ?? null;

  async function onSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setSavingProfile(true);
    const ok = await updateProfile({
      fullName: String(data.get("fullName") ?? "").trim(),
      phone: String(data.get("phone") ?? "").trim(),
    });
    setSavingProfile(false);

    toast(
      ok ? dict.account.saved : dict.errors.generic,
      ok ? "success" : "error",
    );
    if (ok) setEditing(false);
  }

  /* ---------- Cargando la sesión del navegador ---------- */

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-28 animate-pulse rounded-2xl border border-line bg-card/60" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-line bg-card/60"
            />
          ))}
        </div>
      </div>
    );
  }

  /* ---------- Sin sesión ---------- */

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-card px-6 py-20 text-center">
        <UserIcon className="size-8 text-fog" aria-hidden="true" />
        <p className="text-[0.9375rem] text-mist">
          {dict.schedule.loginToBook}
        </p>
        <div className="flex gap-2">
          <ButtonLink href={`/${locale}/ingresar`} size="md">
            {dict.nav.login}
          </ButtonLink>
          <ButtonLink href={`/${locale}/registro`} variant="outline" size="md">
            {dict.nav.register}
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (bookingsError)
    return <DataUnavailable locale={locale} code="DATA_BOOKINGS_UNAVAILABLE" />;
  if (bookingsLoading)
    return (
      <p role="status">
        {locale === "es" ? "Confirmando reservas…" : "Verifying bookings…"}
      </p>
    );

  const stats = [
    {
      label: dict.account.stats.total,
      value: totalBookings,
      Icon: CalendarCheck,
    },
    { label: dict.account.stats.attended, value: attendedCount, Icon: Trophy },
    {
      label: dict.account.stats.upcoming,
      value: resolvedUpcoming.length,
      Icon: Clock,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* --- Encabezado --- */}
      <div className="flex flex-col gap-5 rounded-2xl border border-line bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand text-[1.125rem] font-bold text-onbrand">
            {user.fullName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part.charAt(0).toUpperCase())
              .join("")}
          </span>

          <div className="min-w-0">
            <h1 className="display-xl text-[1.5rem] leading-none">
              {dict.account.greeting.replace(
                "{name}",
                user.fullName.split(" ")[0],
              )}
            </h1>
            <p className="mt-1.5 truncate text-[0.8125rem] text-fog">
              {user.email}
            </p>
            <p className="mt-0.5 text-[0.75rem] text-fog">
              {dict.account.memberSince}{" "}
              {formatDateNumeric(new Date(user.createdAt), locale)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="dark"
            size="sm"
            onClick={() => setEditing((v) => !v)}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {dict.account.settings}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="size-3.5" aria-hidden="true" />
            {dict.account.logoutCta}
          </Button>
        </div>
      </div>

      {/* --- Editar datos --- */}
      {editing ? (
        <form
          onSubmit={onSaveProfile}
          className="grid gap-4 rounded-2xl border border-line bg-card p-6 sm:grid-cols-2"
        >
          <Input
            name="fullName"
            label={dict.account.fullName}
            defaultValue={user.fullName}
            autoComplete="name"
          />

          <Input
            name="phone"
            type="tel"
            label={dict.account.phone}
            defaultValue={user.phone ?? ""}
            placeholder={dict.contact.phonePlaceholder}
            autoComplete="tel"
          />

          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="md" disabled={savingProfile}>
              {savingProfile ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-4" aria-hidden="true" />
              )}
              {dict.account.save}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setEditing(false)}
            >
              <X className="size-4" aria-hidden="true" />
              {dict.cta.back}
            </Button>
          </div>
        </form>
      ) : null}

      {/* --- Estadísticas --- */}
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ label, value, Icon }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-2xl border border-line bg-card p-5"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-paper text-brand">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="display-xl text-[1.75rem] leading-none text-brand">
                {value}
              </p>
              <p className="mt-1 text-[0.75rem] text-fog">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* --- Plan actual --- */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
            {dict.account.plan}
          </p>
          <p className="display-xl mt-1.5 text-[1.5rem] leading-none">
            {currentPlan
              ? locale === "es"
                ? currentPlan.name_es
                : currentPlan.name_en
              : dict.account.noPlan}
          </p>
        </div>

        <ButtonLink
          href={`/${locale}#planes`}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          {dict.cta.viewPlans}
        </ButtonLink>
      </div>

      {isDemo ? (
        <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.75rem] leading-relaxed text-mist">
          {dict.demo.text}
        </p>
      ) : null}

      {/* --- Próximas reservas --- */}
      <section>
        <h2 className="display-xl mb-4 text-[1.375rem] sm:text-[1.625rem]">
          {dict.account.upcoming}
        </h2>

        {demo.loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-card px-5 py-8 text-[0.875rem] text-fog">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {dict.auth.loading}
          </div>
        ) : resolvedUpcoming.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-card px-6 py-14 text-center">
            <CalendarX className="size-8 text-fog" aria-hidden="true" />
            <p className="max-w-sm text-[0.9375rem] text-mist">
              {dict.account.noUpcoming}
            </p>
            <ButtonLink href={`/${locale}/horarios`} size="md">
              {dict.account.browseClasses}
            </ButtonLink>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {resolvedUpcoming.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                locale={locale}
                dict={dict}
                canCancel
              />
            ))}
          </ul>
        )}
      </section>

      {/* --- Historial (sólo con Supabase) --- */}
      {!isDemo ? (
        <section>
          <h2 className="display-xl mb-4 text-[1.375rem] sm:text-[1.625rem]">
            {dict.account.history}
          </h2>

          {resolvedHistory.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card px-5 py-8 text-center text-[0.875rem] text-fog">
              {dict.account.noHistory}
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {resolvedHistory.slice(0, 20).map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  locale={locale}
                  dict={dict}
                  canCancel={false}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------
   Helpers de datos
   ------------------------------------------------------------ */

function upcomingFrom(bookings: BookingDetail[], now: Date): BookingDetail[] {
  return bookings
    .filter(
      (b) => b.status === "confirmed" && new Date(b.session.starts_at) >= now,
    )
    .sort(
      (a, b) =>
        new Date(a.session.starts_at).getTime() -
        new Date(b.session.starts_at).getTime(),
    );
}

function historyFrom(bookings: BookingDetail[], now: Date): BookingDetail[] {
  return bookings
    .filter(
      (b) => b.status !== "confirmed" || new Date(b.session.starts_at) < now,
    )
    .sort(
      (a, b) =>
        new Date(b.session.starts_at).getTime() -
        new Date(a.session.starts_at).getTime(),
    );
}

/**
 * Modo demo: busca en los horarios de esta semana y la próxima las clases
 * que el usuario reservó (las reservas de ejemplo viven en localStorage).
 */
function useDemoBookings(bookings: AppBooking[]): {
  upcoming: BookingDetail[];
  loading: boolean;
} {
  const [sessions, setSessions] = useState<Map<string, SessionDetail>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);

  const activeKey = bookings
    .filter((b) => b.status === "confirmed" || b.status === "attended")
    .map((b) => b.sessionId)
    .join(",");

  useEffect(() => {
    if (!activeKey) {
      setSessions(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const weekKeys = [getWeekRange().key, shiftWeeks(getWeekRange(), 1).key];

    async function run() {
      try {
        const responses = await Promise.all(
          weekKeys.map(async (key) => {
            const response = await fetch(
              `/api/sessions?week=${encodeURIComponent(key)}`,
              {
                cache: "no-store",
              },
            );
            if (!response.ok) return [] as SessionDetail[];
            const data = (await response.json()) as {
              sessions: SessionDetail[];
            };
            return data.sessions;
          }),
        );

        if (cancelled) return;

        const map = new Map<string, SessionDetail>();
        for (const session of responses.flat()) map.set(session.id, session);
        setSessions(map);
      } catch {
        if (!cancelled) setSessions(new Map());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeKey]);

  const upcoming = useMemo(() => {
    const now = gymNow();
    const ids = new Set(activeKey ? activeKey.split(",") : []);

    return bookings
      .filter((b) => ids.has(b.sessionId) && b.status === "confirmed")
      .map((booking) => {
        const session = sessions.get(booking.sessionId);
        if (!session) return null;
        return { booking, session };
      })
      .filter(
        (row): row is { booking: AppBooking; session: SessionDetail } =>
          row !== null,
      )
      .filter((row) => new Date(row.session.starts_at) >= now)
      .sort(
        (a, b) =>
          new Date(a.session.starts_at).getTime() -
          new Date(b.session.starts_at).getTime(),
      )
      .map(({ booking, session }) => toBookingDetail(booking, session));
  }, [bookings, sessions, activeKey]);

  return { upcoming, loading };
}

function toBookingDetail(
  booking: AppBooking,
  session: SessionDetail,
): BookingDetail {
  return {
    id: booking.id,
    session_id: session.id,
    user_id: "",
    status: booking.status as BookingStatus,
    created_at: booking.createdAt,
    cancelled_at: null,
    session,
  };
}

/* ------------------------------------------------------------
   Fila de reserva
   ------------------------------------------------------------ */

const statusStyles: Record<string, string> = {
  confirmed: "border-brand/40 text-brand-300 bg-brand/10",
  attended: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
  no_show: "border-alert/40 text-alert bg-alert/10",
  cancelled: "border-line text-fog bg-paper/40",
};

function BookingRow({
  booking,
  locale,
  dict,
  canCancel,
}: {
  booking: BookingDetail;
  locale: "es" | "en";
  dict: ReturnType<typeof useDictionary>["dict"];
  canCancel: boolean;
}) {
  const { cancelBySessionId, toast } = useApp();
  const [pending, setPending] = useState(false);

  const session = booking.session;
  const name =
    locale === "es" ? session.gymClass.name_es : session.gymClass.name_en;
  const startsAt = new Date(session.starts_at);

  const statusLabel = {
    confirmed: dict.account.confirmed,
    attended: dict.account.attended,
    no_show: dict.account.noShow,
    cancelled: dict.account.cancelled,
  }[booking.status];

  async function onCancel() {
    setPending(true);
    const result = await cancelBySessionId(session.id);
    setPending(false);
    toast(
      result.ok ? dict.schedule.cancelSuccess : dict.schedule.bookingError,
      result.ok ? "info" : "error",
    );
  }

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span
          className="display-xl grid size-12 shrink-0 place-items-center rounded-xl text-[0.875rem]"
          style={{
            backgroundColor: accentOnDark(session.gymClass.color),
            color: textOnAccent(session.gymClass.color),
          }}
          aria-hidden="true"
        >
          {formatTime(startsAt, locale).replace(/:\d+.*$/, "")}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.9375rem] font-semibold text-ink">{name}</h3>

            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[0.625rem] font-bold tracking-wide uppercase",
                statusStyles[booking.status],
              )}
            >
              {statusLabel}
            </span>
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.75rem] text-fog">
            <span className="capitalize">
              {formatLongDate(startsAt, locale)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {formatTime(startsAt, locale)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {session.room}
            </span>
            {session.coach ? (
              <span>
                {dict.schedule.with} {session.coach.name}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {canCancel ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onCancel()}
          disabled={pending}
          className="shrink-0 border-brand/40 text-brand-300 hover:border-alert/60 hover:bg-alert/10 hover:text-alert"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <X className="size-3.5" aria-hidden="true" />
          )}
          {dict.schedule.cancel}
        </Button>
      ) : null}
    </li>
  );
}
