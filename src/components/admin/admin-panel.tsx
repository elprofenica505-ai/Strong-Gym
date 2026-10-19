"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  CalendarX,
  Check,
  LayoutDashboard,
  Mail,
  MessageSquare,
  ShieldAlert,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { accentOnDark, cn } from "@/lib/utils";
import {
  formatDateNumeric,
  formatLongDate,
  formatTime,
  gymNow,
} from "@/lib/schedule";
import type { ContactMessage, GymClass } from "@/lib/types";

/* ============================================================
   Tipos que recibe el panel
   ============================================================ */

export interface AdminBookingRow {
  id: string;
  memberName: string;
  memberEmail: string;
  status: "confirmed" | "cancelled" | "attended" | "no_show";
  createdAt: string;
  className: string;
  classColor: string;
  room: string;
  coachName: string | null;
  startsAt: string;
  sessionId: string;
}

export interface AdminClassRow {
  id: string;
  name: string;
  slug: string;
  color: string;
  capacity: number;
  duration: number;
  intensity: string;
  isActive: boolean;
  sessionsThisWeek: number;
}

interface Props {
  bookings: AdminBookingRow[];
  messages: ContactMessage[];
  classes: AdminClassRow[];
  memberCount: number;
  isDemo: boolean;
}

type Tab = "overview" | "bookings" | "messages" | "classes";

export function AdminPanel({
  bookings,
  messages,
  classes,
  memberCount,
  isDemo,
}: Props) {
  const { dict, locale } = useDictionary();
  const [tab, setTab] = useState<Tab>("overview");

  const [bookingStatuses, setBookingStatuses] = useState<
    Record<string, string>
  >(() => Object.fromEntries(bookings.map((b) => [b.id, b.status])));
  const [readMessages, setReadMessages] = useState<Record<string, boolean>>(
    () => Object.fromEntries(messages.map((m) => [m.id, m.is_read])),
  );
  const [classActive, setClassActive] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(classes.map((c) => [c.id, c.isActive])),
  );

  const now = useMemo(() => gymNow(), []);
  const todayISO = formatDateNumeric(now, "es");

  /* ---------- Métricas ---------- */

  const bookingsToday = bookings.filter(
    (b) => formatDateNumeric(new Date(b.startsAt), "es") === todayISO,
  ).length;

  const startOfWeek = useMemo(() => {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    return new Date(now.getTime() - diff * 86_400_000);
  }, [now]);

  const bookingsThisWeek = bookings.filter(
    (b) => new Date(b.startsAt) >= startOfWeek,
  ).length;
  const unreadCount = Object.values(readMessages).filter(
    (value) => !value,
  ).length;

  const stats = [
    {
      label: dict.admin.stats.bookingsToday,
      value: bookingsToday,
      Icon: CalendarDays,
    },
    {
      label: dict.admin.stats.bookingsWeek,
      value: bookingsThisWeek,
      Icon: TrendingUp,
    },
    {
      label: dict.admin.stats.members,
      value: memberCount || (isDemo ? 942 : 0),
      Icon: Users,
    },
    {
      label: dict.admin.stats.messages,
      value: unreadCount,
      Icon: Mail,
    },
  ];

  const tabs: {
    id: Tab;
    label: string;
    Icon: typeof LayoutDashboard;
    badge?: number;
  }[] = [
    { id: "overview", label: dict.admin.tabs.overview, Icon: LayoutDashboard },
    { id: "bookings", label: dict.admin.tabs.bookings, Icon: CalendarDays },
    {
      id: "messages",
      label: dict.admin.tabs.messages,
      Icon: MessageSquare,
      badge: unreadCount,
    },
    { id: "classes", label: dict.admin.tabs.classes, Icon: BadgeCheck },
  ];

  return (
    <div className="flex flex-col gap-6">
      {isDemo ? (
        <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.75rem] leading-relaxed text-mist">
          {dict.admin.demoNotice}
        </p>
      ) : null}

      {/* --- Pestañas --- */}
      <div
        className="flex gap-1.5 overflow-x-auto rounded-2xl border border-line bg-card p-1.5 no-scrollbar"
        role="tablist"
      >
        {tabs.map(({ id, label, Icon, badge }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[0.8125rem] font-medium transition-colors",
              tab === id
                ? "bg-brand text-onbrand"
                : "text-mist hover:bg-cloud hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
            {badge && badge > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold",
                  tab === id
                    ? "bg-onbrand/15 text-onbrand"
                    : "bg-alert/20 text-alert",
                )}
              >
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* --- Resumen --- */}
      {tab === "overview" ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <p className="mt-1 text-[0.75rem] leading-snug text-fog">
                    {label}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Próximas clases de hoy */}
            <div className="rounded-2xl border border-line bg-card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                <CalendarDays
                  className="size-4 text-brand"
                  aria-hidden="true"
                />
                {dict.nav.schedule} · {formatLongDate(now, locale)}
              </h2>

              <ul className="flex flex-col divide-y divide-line">
                {bookings
                  .filter(
                    (b) =>
                      formatDateNumeric(new Date(b.startsAt), "es") ===
                      todayISO,
                  )
                  .slice(0, 8)
                  .map((booking) => (
                    <li
                      key={booking.id}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: booking.classColor }}
                        aria-hidden="true"
                      />
                      <span className="w-12 shrink-0 text-[0.75rem] tabular-nums text-fog">
                        {formatTime(new Date(booking.startsAt), locale)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-mist">
                        {booking.className}
                      </span>
                      <span className="min-w-0 shrink-0 truncate text-[0.75rem] text-fog">
                        {booking.memberName}
                      </span>
                    </li>
                  ))}

                {bookingsToday === 0 ? (
                  <li className="py-8 text-center text-[0.8125rem] text-fog">
                    {dict.admin.empty.bookings}
                  </li>
                ) : null}
              </ul>
            </div>

            {/* Ocupación por clase */}
            <div className="rounded-2xl border border-line bg-card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                <TrendingUp className="size-4 text-brand" aria-hidden="true" />
                {dict.admin.stats.occupancy}
              </h2>

              <ul className="flex flex-col gap-3">
                {classes.slice(0, 6).map((gymClass) => {
                  const total = Math.max(1, gymClass.sessionsThisWeek);
                  const load = Math.min(100, Math.round((total / 8) * 100));

                  return (
                    <li key={gymClass.id} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-[0.75rem] text-mist">
                        {gymClass.name}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${load}%`,
                            backgroundColor: accentOnDark(gymClass.color),
                          }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right text-[0.6875rem] tabular-nums text-fog">
                        {gymClass.sessionsThisWeek}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Reservas --- */}
      {tab === "bookings" ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          {bookings.length === 0 ? (
            <p className="px-5 py-14 text-center text-[0.875rem] text-fog">
              {dict.admin.empty.bookings}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-paper/40">
                    {[
                      dict.admin.table.member,
                      dict.admin.table.class,
                      dict.admin.table.date,
                      dict.admin.table.time,
                      dict.admin.table.status,
                      dict.admin.table.actions,
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-5 py-3 text-[0.6875rem] font-semibold tracking-[0.12em] text-fog uppercase"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-line">
                  {bookings.slice(0, 100).map((booking) => {
                    const status =
                      bookingStatuses[booking.id] ?? booking.status;

                    return (
                      <tr
                        key={booking.id}
                        className="transition-colors hover:bg-cloud"
                      >
                        <td className="px-5 py-3.5">
                          <span className="block text-[0.8125rem] font-medium text-ink">
                            {booking.memberName}
                          </span>
                          <span className="block text-[0.6875rem] text-fog">
                            {booking.memberEmail}
                          </span>
                        </td>

                        <td className="px-5 py-3.5">
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: booking.classColor }}
                              aria-hidden="true"
                            />
                            <span className="text-[0.8125rem] text-mist">
                              {booking.className}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[0.6875rem] text-fog">
                            {booking.room}
                            {booking.coachName ? ` · ${booking.coachName}` : ""}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 text-[0.8125rem] text-mist">
                          {formatDateNumeric(
                            new Date(booking.startsAt),
                            locale,
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-[0.8125rem] tabular-nums text-mist">
                          {formatTime(new Date(booking.startsAt), locale)}
                        </td>

                        <td className="px-5 py-3.5">
                          <StatusPill status={status} dict={dict} />
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={isDemo}
                              onClick={() =>
                                setBookingStatuses((prev) => ({
                                  ...prev,
                                  [booking.id]: "attended",
                                }))
                              }
                              title={dict.admin.actions.markAttended}
                              aria-label={dict.admin.actions.markAttended}
                              className="grid size-8 place-items-center rounded-lg border border-line text-fog transition-colors hover:border-brand/60 hover:text-brand"
                            >
                              <Check className="size-3.5" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              disabled={isDemo}
                              onClick={() =>
                                setBookingStatuses((prev) => ({
                                  ...prev,
                                  [booking.id]: "no_show",
                                }))
                              }
                              title={dict.admin.actions.markNoShow}
                              aria-label={dict.admin.actions.markNoShow}
                              className="grid size-8 place-items-center rounded-lg border border-line text-fog transition-colors hover:border-alert/60 hover:text-alert"
                            >
                              <ShieldAlert
                                className="size-3.5"
                                aria-hidden="true"
                              />
                            </button>

                            <button
                              type="button"
                              disabled={isDemo}
                              onClick={() =>
                                setBookingStatuses((prev) => ({
                                  ...prev,
                                  [booking.id]: "cancelled",
                                }))
                              }
                              title={dict.admin.actions.cancelBooking}
                              aria-label={dict.admin.actions.cancelBooking}
                              className="grid size-8 place-items-center rounded-lg border border-line text-fog transition-colors hover:border-alert/60 hover:text-alert"
                            >
                              <X className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* --- Consultas --- */}
      {tab === "messages" ? (
        <div className="flex flex-col gap-3">
          {messages.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card px-5 py-14 text-center text-[0.875rem] text-fog">
              {dict.admin.empty.messages}
            </p>
          ) : (
            messages.map((message) => {
              const isRead = readMessages[message.id] ?? message.is_read;

              return (
                <article
                  key={message.id}
                  className={cn(
                    "rounded-2xl border bg-card p-5 transition-colors",
                    isRead ? "border-line" : "border-brand/35",
                  )}
                >
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.875rem] font-semibold text-ink">
                        {message.name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.75rem] text-fog">
                        <a
                          href={`mailto:${message.email}`}
                          className="hover:text-brand"
                        >
                          {message.email}
                        </a>
                        {message.phone ? <span>{message.phone}</span> : null}
                        <span>
                          {formatDateNumeric(
                            new Date(message.created_at),
                            locale,
                          )}
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Badge className="border-line text-fog">
                        {message.subject}
                      </Badge>

                      <button
                        type="button"
                        disabled={isDemo}
                        onClick={() =>
                          setReadMessages((prev) => ({
                            ...prev,
                            [message.id]: !isRead,
                          }))
                        }
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[0.6875rem] font-semibold transition-colors",
                          isRead
                            ? "border-line text-fog hover:text-ink"
                            : "border-brand/50 text-brand-300 hover:bg-brand/10",
                        )}
                      >
                        {dict.admin.actions.markRead}
                      </button>
                    </div>
                  </header>

                  <p className="mt-3 border-t border-line pt-3 text-[0.8125rem] leading-relaxed text-mist">
                    {message.message}
                  </p>
                </article>
              );
            })
          )}
        </div>
      ) : null}

      {/* --- Clases --- */}
      {tab === "classes" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((gymClass) => {
            const active = classActive[gymClass.id] ?? gymClass.isActive;

            return (
              <div
                key={gymClass.id}
                className={cn(
                  "rounded-2xl border bg-card p-5 transition-colors",
                  active ? "border-line" : "border-alert/30 opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2
                    className="display-xl text-[1.25rem] leading-none"
                    style={{ color: accentOnDark(gymClass.color) }}
                  >
                    {gymClass.name}
                  </h2>

                  <button
                    type="button"
                    disabled={isDemo}
                    onClick={() =>
                      setClassActive((prev) => ({
                        ...prev,
                        [gymClass.id]: !active,
                      }))
                    }
                    aria-pressed={active}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                      active
                        ? "border-brand/60 bg-brand/25"
                        : "border-line bg-paper",
                    )}
                    aria-label={dict.admin.actions.toggleClass}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-4.5 rounded-full transition-all",
                        active ? "left-5.5 bg-brand" : "left-0.5 bg-fog",
                      )}
                    />
                  </button>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                  <div>
                    <dt className="text-[0.625rem] tracking-wide text-fog uppercase">
                      {dict.admin.table.spots}
                    </dt>
                    <dd className="mt-0.5 text-[0.875rem] font-semibold text-ink">
                      {gymClass.capacity}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.625rem] tracking-wide text-fog uppercase">
                      {dict.classes.duration}
                    </dt>
                    <dd className="mt-0.5 text-[0.875rem] font-semibold text-ink">
                      {gymClass.duration}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.625rem] tracking-wide text-fog uppercase">
                      {dict.schedule.week}
                    </dt>
                    <dd className="mt-0.5 text-[0.875rem] font-semibold text-ink">
                      {gymClass.sessionsThisWeek}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}

          {classes.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card px-5 py-14 text-center text-[0.875rem] text-fog sm:col-span-2 lg:col-span-3">
              {dict.admin.empty.classes}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------
   Piezas auxiliares
   ------------------------------------------------------------ */

function StatusPill({
  status,
  dict,
}: {
  status: string;
  dict: ReturnType<typeof useDictionary>["dict"];
}) {
  const map: Record<string, { label: string; className: string }> = {
    confirmed: {
      label: dict.account.confirmed,
      className: "border-brand/40 text-brand-300 bg-brand/10",
    },
    attended: {
      label: dict.account.attended,
      className: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
    },
    no_show: {
      label: dict.account.noShow,
      className: "border-alert/40 text-alert bg-alert/10",
    },
    cancelled: {
      label: dict.account.cancelled,
      className: "border-line text-fog bg-paper/40",
    },
  };

  const entry = map[status] ?? map.confirmed;

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[0.625rem] font-bold tracking-wide uppercase",
        entry.className,
      )}
    >
      {entry.label}
    </span>
  );
}

/** Estado vacío reutilizable del panel. */
export function AdminEmpty({
  text,
  cta,
}: {
  text: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-card px-6 py-14 text-center">
      <CalendarX className="size-8 text-fog" aria-hidden="true" />
      <p className="max-w-sm text-[0.9375rem] text-mist">{text}</p>
      {cta ? (
        <ButtonLink href={cta.href} size="md">
          {cta.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}
