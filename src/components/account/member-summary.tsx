"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Clock, Trophy, UserRound } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { ButtonLink } from "@/components/ui/button";
import { formatLongDate, formatTime, getWeekRange, gymNow, shiftWeeks } from "@/lib/schedule";
import type { BookingDetail, SessionDetail } from "@/lib/types";

/**
 * Resumen del socio arriba de todo en el inicio: clases reservadas,
 * clases asistidas y próxima clase. Es el mismo resumen de Mi Cuenta.
 * Sin sesión iniciada muestra la invitación a entrar o registrarse.
 *
 * Con Supabase las reservas llegan desde el servidor
 * (`initialBookings`); en modo demo viven en el navegador y se cruzan
 * con los horarios de ejemplo, igual que en Mi Cuenta.
 */
export function MemberSummary({ initialBookings }: { initialBookings: BookingDetail[] }) {
  const { dict, locale } = useDictionary();
  const { user, bookings, isDemo, hydrated } = useApp();

  const demoUpcoming = useDemoUpcoming(isDemo ? bookings : []);

  if (!hydrated) {
    return (
      <section className="border-b border-line bg-cloud">
        <div className="container-x py-6 sm:py-8">
          <div className="h-28 animate-pulse rounded-2xl border border-line bg-card/60" aria-hidden="true" />
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="border-b border-line bg-cloud">
        <div className="container-x py-6 sm:py-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-paper text-brand">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-[1.0625rem] font-semibold text-ink">{dict.memberSummary.guestTitle}</h2>
                <p className="mt-1 max-w-xl text-[0.875rem] leading-relaxed text-fog">
                  {dict.memberSummary.guestText}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <ButtonLink href={`/${locale}/ingresar`} size="md">
                {dict.nav.login}
              </ButtonLink>
              <ButtonLink href={`/${locale}/registro`} variant="outline" size="md">
                {dict.nav.register}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const now = gymNow();
  const serverUpcoming = initialBookings
    .filter((b) => b.status === "confirmed" && new Date(b.session.starts_at) >= now)
    .sort((a, b) => new Date(a.session.starts_at).getTime() - new Date(b.session.starts_at).getTime());

  const upcoming = isDemo ? demoUpcoming : serverUpcoming;
  const next = upcoming[0] ?? null;
  const totalBookings = isDemo ? bookings.length : initialBookings.length;
  const attendedCount = isDemo
    ? bookings.filter((b) => b.status === "attended").length
    : initialBookings.filter((b) => b.status === "attended").length;

  const stats = [
    { label: dict.account.stats.total, value: totalBookings, Icon: CalendarCheck },
    { label: dict.account.stats.attended, value: attendedCount, Icon: Trophy },
  ];

  return (
    <section className="border-b border-line bg-cloud" aria-label={dict.memberSummary.title}>
      <div className="container-x py-6 sm:py-8">
        <div className="rounded-2xl border border-line bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="display-xl text-[1.375rem] leading-none">
              {dict.account.greeting.replace("{name}", user.fullName.split(" ")[0])}
            </h2>
            <ButtonLink href={`/${locale}/mi-cuenta`} variant="outline" size="sm">
              {dict.memberSummary.viewAccount}
            </ButtonLink>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {stats.map(({ label, value, Icon }) => (
              <div key={label} className="flex items-center gap-4 rounded-xl border border-line bg-paper p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-brand">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="display-xl text-[1.625rem] leading-none text-ink">{value}</p>
                  <p className="mt-1 text-[0.75rem] text-fog">{label}</p>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-4 rounded-xl border border-line bg-paper p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-brand">
                <Clock className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
                  {dict.memberSummary.nextClass}
                </p>
                {next ? (
                  <>
                    <p className="mt-1 truncate text-[0.9375rem] font-semibold text-ink">
                      {locale === "es" ? next.session.gymClass.name_es : next.session.gymClass.name_en}
                    </p>
                    <p className="truncate text-[0.75rem] text-fog capitalize">
                      {formatLongDate(new Date(next.session.starts_at), locale)} ·{" "}
                      {formatTime(new Date(next.session.starts_at), locale)}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[0.8125rem] text-fog">{dict.memberSummary.noNextClass}</p>
                )}
              </div>
            </div>
          </div>

          {!next ? (
            <div className="mt-4">
              <ButtonLink href={`/${locale}/horarios`} size="sm">
                {dict.account.browseClasses}
              </ButtonLink>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Modo demo: cruza las reservas del navegador con los horarios de ejemplo. */
function useDemoUpcoming(bookings: ReturnType<typeof useApp>["bookings"]): BookingDetail[] {
  const [sessions, setSessions] = useState<Map<string, SessionDetail>>(new Map());

  const activeKey = bookings
    .filter((b) => b.status === "confirmed")
    .map((b) => b.sessionId)
    .join(",");

  useEffect(() => {
    if (!activeKey) {
      setSessions(new Map());
      return;
    }
    let cancelled = false;
    const weekKeys = [getWeekRange().key, shiftWeeks(getWeekRange(), 1).key];

    async function run() {
      try {
        const responses = await Promise.all(
          weekKeys.map(async (key) => {
            const response = await fetch(`/api/sessions?week=${encodeURIComponent(key)}`, {
              cache: "no-store",
            });
            if (!response.ok) return [] as SessionDetail[];
            const data = (await response.json()) as { sessions: SessionDetail[] };
            return data.sessions;
          }),
        );
        if (cancelled) return;
        const map = new Map<string, SessionDetail>();
        for (const session of responses.flat()) map.set(session.id, session);
        setSessions(map);
      } catch {
        if (!cancelled) setSessions(new Map());
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeKey]);

  return useMemo(() => {
    const now = gymNow();
    return bookings
      .filter((b) => b.status === "confirmed")
      .map((booking): BookingDetail | null => {
        const session = sessions.get(booking.sessionId);
        if (!session) return null;
        return {
          id: booking.id,
          session_id: session.id,
          user_id: "",
          status: booking.status,
          created_at: booking.createdAt,
          cancelled_at: null,
          session,
        };
      })
      .filter((row): row is BookingDetail => row !== null)
      .filter((row) => new Date(row.session.starts_at) >= now)
      .sort((a, b) => new Date(a.session.starts_at).getTime() - new Date(b.session.starts_at).getTime());
  }, [bookings, sessions]);
}
