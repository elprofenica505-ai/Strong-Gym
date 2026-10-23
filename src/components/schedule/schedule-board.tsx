"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  LogIn,
  MapPin,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  dayMonth,
  formatLongDate,
  formatTime,
  formatWeekRange,
  getWeekRange,
  gymNow,
  shiftWeeks,
  toISODate,
  weekDays,
  weekRangeFromKey,
  weekdayName,
} from "@/lib/schedule";
import type { SessionDetail, WeekRange } from "@/lib/types";
import { accentOnDark, cn, textOnAccent } from "@/lib/utils";

/** Mensajes que mostramos cuando el backend rechaza una reserva. */
const errorMessages = {
  FULL: "sessionFull",
  ALREADY_BOOKED: "alreadyBooked",
  LIMIT: "tooManyBookings",
  PAST: "pastSession",
  CANCELLED: "cancelledByGym",
  TOO_LATE: "bookingError",
  NOT_FOUND: "bookingError",
  AUTH: "loginToBook",
  UNCONFIRMED: "bookingUnconfirmed",
  UNKNOWN: "bookingError",
} as const;

export function ScheduleBoard({ initialWeekKey }: { initialWeekKey?: string }) {
  const { dict, locale } = useDictionary();
  const {
    user,
    bookedSessionIds,
    book,
    cancelBySessionId,
    toast,
    bookingsLoading,
    bookingsError,
    reloadBookings,
  } = useApp();
  // El personal (administración, caja y entrenadores) no reserva clases: solo los clientes.
  const canBook = !(user?.role === "admin" || user?.role === "cashier" || user?.role === "trainer");

  const [week, setWeek] = useState<WeekRange>(() =>
    weekRangeFromKey(initialWeekKey),
  );
  const [sessions, setSessions] = useState<SessionDetail[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const requestedWeek = useRef(initialWeekKey ?? "");
  const loadRequest = useRef(0);
  const invalidateRequests = useCallback(() => {
    loadRequest.current++;
  }, []);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [pendingSession, setPendingSession] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /* ---------- Carga de datos ---------- */

  /** Lectura pura: pide y valida la semana; no toca el estado. */
  const fetchWeek = useCallback(async (key: string) => {
    const url = key
      ? `/api/sessions?week=${encodeURIComponent(key)}`
      : "/api/sessions";
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("fetch failed");

    const data = (await response.json()) as {
      weekKey: string;
      sessions: SessionDetail[];
    };

    if (
      !Array.isArray(data.sessions) ||
      typeof data.weekKey !== "string" ||
      data.sessions.some(
        (session) =>
          !session ||
          typeof session.id !== "string" ||
          !session.gymClass ||
          typeof session.gymClass.slug !== "string" ||
          typeof session.gymClass.name_es !== "string" ||
          typeof session.gymClass.name_en !== "string" ||
          typeof session.gymClass.color !== "string" ||
          !Number.isFinite(Date.parse(session.starts_at)) ||
          !Number.isFinite(Date.parse(session.ends_at)) ||
          !Number.isSafeInteger(session.capacity) ||
          session.capacity < 0 ||
          !Number.isSafeInteger(session.bookedCount) ||
          session.bookedCount < 0 ||
          !Number.isSafeInteger(session.spotsLeft) ||
          session.spotsLeft < 0,
      )
    )
      throw new Error("INVALID_SESSIONS");

    return data;
  }, []);

  /** Aplica una semana ya validada y mantiene la URL compartible. */
  const applyWeek = useCallback((data: { weekKey: string; sessions: SessionDetail[] }) => {
    setSessions(data.sessions);
    setWeek(weekRangeFromKey(data.weekKey));
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("week", data.weekKey);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  /** Carga pedida por una acción del usuario (cambiar de semana, reservar, reintentar). */
  const load = useCallback(async (key: string) => {
    const request = ++loadRequest.current;
    requestedWeek.current = key;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchWeek(key);
      if (request !== loadRequest.current) return;
      applyWeek(data);
    } catch {
      if (request !== loadRequest.current) return;
      setSessions(null);
      setLoadError(true);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [fetchWeek, applyWeek]);

  /* Primera carga: arranca con loading=true y espera la respuesta antes de
     tocar el estado, para no encadenar renders desde el efecto. */
  useEffect(() => {
    let cancelled = false;
    const key = initialWeekKey ?? "";
    const request = ++loadRequest.current;
    requestedWeek.current = key;

    void (async () => {
      try {
        const data = await fetchWeek(key);
        if (cancelled || request !== loadRequest.current) return;
        applyWeek(data);
      } catch {
        if (cancelled || request !== loadRequest.current) return;
        setSessions(null);
        setLoadError(true);
      } finally {
        if (!cancelled && request === loadRequest.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      invalidateRequests();
    };
  }, [fetchWeek, applyWeek, initialWeekKey, invalidateRequests]);

  /* ---------- Derivados ---------- */

  const days = useMemo(() => weekDays(week), [week]);
  const todayISO = useMemo(() => toISODate(gymNow()), []);

  const disciplines = useMemo(() => {
    const map = new Map<
      string,
      { slug: string; name: string; color: string }
    >();
    for (const session of sessions ?? []) {
      if (map.has(session.gymClass.slug)) continue;
      map.set(session.gymClass.slug, {
        slug: session.gymClass.slug,
        name:
          locale === "es" ? session.gymClass.name_es : session.gymClass.name_en,
        color: session.gymClass.color,
      });
    }
    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, locale),
    );
  }, [sessions, locale]);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, SessionDetail[]>();
    for (const session of sessions ?? []) {
      if (classFilter !== "all" && session.gymClass.slug !== classFilter)
        continue;
      const key = toISODate(new Date(session.starts_at));
      const list = map.get(key);
      if (list) list.push(session);
      else map.set(key, [session]);
    }
    return map;
  }, [sessions, classFilter]);

  const visibleDays = activeDay
    ? days.filter((d) => toISODate(d) === activeDay)
    : days;
  const totalVisible = useMemo(
    () =>
      [...sessionsByDay.values()].reduce((acc, list) => acc + list.length, 0),
    [sessionsByDay],
  );

  const now = useMemo(() => gymNow(), []);

  /* ---------- Acciones ---------- */

  function goToWeek(offset: number) {
    const next = shiftWeeks(week, offset);
    setActiveDay(null);
    void load(next.key);
  }

  function goToCurrentWeek() {
    setActiveDay(null);
    setClassFilter("all");
    void load(getWeekRange().key);
  }

  async function onBook(session: SessionDetail) {
    if (!user) {
      setNeedLogin(true);
      dayRefs.current["login"]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    setPendingSession(session.id);
    const result = await book(session.id);
    setPendingSession(null);

    if (result.ok) {
      toast(dict.schedule.bookSuccess, "success");
      await load(week.key);
      return;
    }

    const key = result.error ? errorMessages[result.error] : "bookingError";
    const message = dict.schedule[key];
    toast(message, result.error === "ALREADY_BOOKED" ? "info" : "error");
  }

  async function onCancel(session: SessionDetail) {
    setPendingSession(session.id);
    const result = await cancelBySessionId(session.id);
    setPendingSession(null);

    if (result.ok) {
      toast(dict.schedule.cancelSuccess, "info");
      await load(week.key);
      return;
    }

    toast(result.error === "UNCONFIRMED" ? dict.schedule.bookingUnconfirmed : dict.schedule.bookingError, "error");
  }

  /* ---------- Render ---------- */

  return (
    <div className="flex flex-col gap-5">
      {/* --- Controles --- */}
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToWeek(-1)}
              aria-label={dict.schedule.prevWeek}
              className="grid size-10 place-items-center rounded-full border border-line text-mist transition-colors hover:border-brand/60 hover:text-brand"
            >
              <ChevronLeft className="size-4.5" aria-hidden="true" />
            </button>

            <div className="min-w-40 text-center sm:min-w-56">
              <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-fog uppercase">
                {dict.schedule.weekOf}
              </p>
              <p className="text-[0.875rem] font-semibold text-ink sm:text-[0.9375rem]">
                {formatWeekRange(week, locale)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => goToWeek(1)}
              aria-label={dict.schedule.nextWeek}
              className="grid size-10 place-items-center rounded-full border border-line text-mist transition-colors hover:border-brand/60 hover:text-brand"
            >
              <ChevronRight className="size-4.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goToCurrentWeek}
              className="rounded-full border border-line px-4 py-2 text-[0.75rem] font-semibold text-mist transition-colors hover:border-brand/60 hover:text-brand-300"
            >
              {dict.schedule.today}
            </button>

            {loading ? (
              <span className="flex items-center gap-2 text-[0.75rem] text-fog">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              </span>
            ) : (
              <span className="text-[0.75rem] text-fog">
                {totalVisible} {dict.schedule.weeklySummary}
              </span>
            )}
          </div>
        </div>

        {/* Filtros por disciplina */}
        {disciplines.length > 0 ? (
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar"
            role="group"
            aria-label={dict.schedule.filters}
          >
            <FilterChip
              active={classFilter === "all"}
              onClick={() => setClassFilter("all")}
              label={dict.schedule.all}
            />
            {disciplines.map((discipline) => (
              <FilterChip
                key={discipline.slug}
                active={classFilter === discipline.slug}
                onClick={() => setClassFilter(discipline.slug)}
                label={discipline.name}
                color={discipline.color}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* --- Selector de día --- */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
        <DayButton
          top={dict.schedule.all}
          bottom={`${days.length}`}
          active={activeDay === null}
          onClick={() => setActiveDay(null)}
        />

        {days.map((day) => {
          const iso = toISODate(day);
          const count = (sessionsByDay.get(iso) ?? []).length;

          return (
            <DayButton
              key={iso}
              top={weekdayName(day, locale)}
              bottom={dayMonth(day, locale)}
              count={count}
              active={activeDay === iso}
              isToday={iso === todayISO}
              onClick={() => {
                setActiveDay(iso);
                requestAnimationFrame(() => {
                  dayRefs.current[iso]?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                });
              }}
            />
          );
        })}
      </div>

      {/* --- Aviso de login --- */}
      {needLogin && !user ? (
        <div
          ref={(node) => {
            dayRefs.current["login"] = node;
          }}
          className="flex scroll-mt-28 flex-col gap-4 rounded-2xl border border-brand/35 bg-brand/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand-300">
              <LogIn className="size-4.5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[0.875rem] font-semibold text-ink">
                {dict.schedule.loginToBook}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-fog">
                {dict.schedule.loginHint}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <ButtonLink href={`/${locale}/ingresar`} size="sm">
              {dict.nav.login}
            </ButtonLink>
            <ButtonLink
              href={`/${locale}/registro`}
              variant="outline"
              size="sm"
            >
              {dict.nav.register}
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {/* --- Listado de clases --- */}
      {loadError || bookingsError ? (
        <div
          role="alert"
          className="rounded-2xl border border-alert/40 bg-card p-6 text-mist"
        >
          <p>
            {locale === "es"
              ? "No pudimos confirmar horarios, cupos o tus reservas. Esto no significa que no haya clases ni reservas."
              : "We could not verify the schedule, availability or your bookings. This does not mean there are no classes or bookings."}
          </p>
          <button
            type="button"
            className="mt-4 rounded-full border border-brand px-4 py-2"
            onClick={() => {
              if (loadError) void load(requestedWeek.current);
              if (bookingsError) void reloadBookings();
            }}
          >
            {locale === "es" ? "Reintentar consulta" : "Retry query"}
          </button>
        </div>
      ) : loading || bookingsLoading ? (
        <SkeletonList />
      ) : totalVisible === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card px-6 py-16 text-center">
          <CalendarX className="size-8 text-fog" aria-hidden="true" />
          <p className="text-[0.9375rem] text-mist">
            {classFilter === "all"
              ? dict.schedule.noSessions
              : dict.schedule.noResults}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {visibleDays.map((day) => {
            const iso = toISODate(day);
            const daySessions = sessionsByDay.get(iso) ?? [];
            if (daySessions.length === 0 && activeDay === null) return null;

            const isToday = iso === todayISO;

            return (
              <div
                key={iso}
                ref={(node) => {
                  dayRefs.current[iso] = node;
                }}
                className="scroll-mt-28"
              >
                <header className="mb-3 flex items-center gap-3">
                  <h3
                    className={cn(
                      "display-xl text-[1.25rem] capitalize sm:text-[1.5rem]",
                      isToday ? "text-brand" : "text-ink",
                    )}
                  >
                    {formatLongDate(day, locale)}
                  </h3>

                  {isToday ? (
                    <span className="shrink-0 rounded-full bg-brand px-2.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-onbrand uppercase">
                      {dict.schedule.today}
                    </span>
                  ) : null}

                  <span className="ml-auto shrink-0 text-[0.75rem] text-fog">
                    {daySessions.length === 1
                      ? dict.schedule.oneClassCount
                      : dict.schedule.classesCount.replace(
                          "{count}",
                          String(daySessions.length),
                        )}
                  </span>
                </header>

                {daySessions.length === 0 ? (
                  <p className="rounded-xl border border-line bg-card/50 px-4 py-6 text-center text-[0.875rem] text-fog">
                    {dict.schedule.noSessions}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {daySessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        locale={locale}
                        labels={dict.schedule}
                        durationLabel={dict.classes.duration}
                        isBooked={bookedSessionIds.has(session.id)}
                        isPast={new Date(session.starts_at) < now}
                        isPending={pendingSession === session.id}
                        canBook={canBook}
                        onBook={() => void onBook(session)}
                        onCancel={() => void onCancel(session)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------
   Subcomponentes
   ------------------------------------------------------------ */

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[0.75rem] font-medium transition-colors",
        active
          ? "border-brand/60 bg-brand/12 text-brand-300"
          : "border-line text-mist hover:border-brand/40 hover:text-ink",
      )}
    >
      {color ? (
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      ) : null}
      {label}
    </button>
  );
}

function DayButton({
  top,
  bottom,
  count,
  active,
  isToday,
  onClick,
}: {
  top: string;
  bottom: string;
  count?: number;
  active?: boolean;
  isToday?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-24 shrink-0 flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors sm:min-w-0",
        active
          ? "border-brand bg-brand text-onbrand"
          : "border-line bg-card hover:border-brand/40",
      )}
    >
      <span
        className={cn(
          "max-w-full truncate text-[0.8125rem] font-semibold capitalize",
          active ? "text-onbrand" : "text-ink",
        )}
      >
        {top}
      </span>

      <span
        className={cn(
          "flex items-center gap-2 text-[0.6875rem]",
          active ? "text-onbrand/80" : "text-fog",
        )}
      >
        {bottom}
        {isToday ? (
          <span
            className={cn(
              "size-1.5 rounded-full",
              active ? "bg-onbrand" : "bg-brand",
            )}
            aria-hidden="true"
          />
        ) : null}
        {typeof count === "number" && count > 0 ? <span>· {count}</span> : null}
      </span>
    </button>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-2xl border border-line bg-card/60"
        />
      ))}
    </div>
  );
}

interface ScheduleLabels {
  book: string;
  booked: string;
  full: string;
  finished: string;
  spotsLeft: string;
  spotLeft: string;
  with: string;
  cancel: string;
}

function SessionRow({
  session,
  locale,
  labels,
  durationLabel,
  isBooked,
  isPast,
  isPending,
  canBook,
  onBook,
  onCancel,
}: {
  session: SessionDetail;
  locale: "es" | "en";
  labels: ScheduleLabels;
  durationLabel: string;
  isBooked: boolean;
  isPast: boolean;
  isPending: boolean;
  canBook: boolean;
  onBook: () => void;
  onCancel: () => void;
}) {
  const name =
    locale === "es" ? session.gymClass.name_es : session.gymClass.name_en;
  const startsAt = new Date(session.starts_at);
  const endsAt = new Date(session.ends_at);
  const isFull = session.spotsLeft <= 0;
  const occupancy = Math.min(
    100,
    Math.round((session.bookedCount / Math.max(1, session.capacity)) * 100),
  );

  return (
    <li className="relative overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-brand/40">
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: accentOnDark(session.gymClass.color) }}
        aria-hidden="true"
      />

      <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-center sm:gap-5 sm:p-5 sm:pl-6">
        {/* Hora */}
        <div className="flex items-center gap-4 sm:w-24 sm:shrink-0 sm:flex-col sm:items-start sm:gap-1">
          <p className="display-xl text-[1.375rem] leading-none text-ink">
            {formatTime(startsAt, locale)}
          </p>
          <p className="flex items-center gap-1.5 text-[0.6875rem] text-fog">
            <Clock className="size-3" aria-hidden="true" />
            {formatTime(endsAt, locale)}
          </p>
        </div>

        {/* Detalle */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="display-xl text-[1.125rem] leading-none sm:text-[1.25rem]">
              {name}
            </h4>

            <span
              className="rounded-full px-2 py-0.5 text-[0.625rem] font-bold tracking-wide uppercase"
              style={{
                backgroundColor: accentOnDark(session.gymClass.color),
                color: textOnAccent(session.gymClass.color),
              }}
            >
              {session.gymClass.duration_min} {durationLabel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-fog">
            {session.coach ? (
              <span className="flex items-center gap-1.5">
                <UserIcon className="size-3.5" aria-hidden="true" />
                {labels.with} {session.coach.name}
              </span>
            ) : null}

            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              {session.room}
            </span>

            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden="true" />
              {isFull && !isBooked
                ? labels.full
                : `${session.spotsLeft} ${session.spotsLeft === 1 ? labels.spotLeft : labels.spotsLeft}`}
            </span>
          </div>

          {/* Ocupación */}
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-paper">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${occupancy}%`,
                  backgroundColor:
                    isFull && !isBooked
                      ? "#ff5b26"
                      : accentOnDark(session.gymClass.color),
                }}
              />
            </div>
            <span className="w-14 text-right text-[0.625rem] tabular-nums text-fog">
              {session.bookedCount}/{session.capacity}
            </span>
          </div>
        </div>

        {/* Acción */}
        <div className="shrink-0 sm:w-40">
          {isPast ? (
            <span className="flex w-full items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-[0.75rem] font-semibold text-fog">
              {isBooked ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : null}
              {isBooked ? labels.booked : labels.finished}
            </span>
          ) : isBooked ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isPending}
              className="w-full border-brand/50 text-brand-300 hover:border-alert/60 hover:bg-alert/10 hover:text-alert"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <X className="size-3.5" aria-hidden="true" />
              )}
              {labels.cancel}
            </Button>
          ) : isFull ? (
            <span className="flex w-full items-center justify-center rounded-full border border-alert/30 bg-alert/10 px-4 py-2.5 text-[0.75rem] font-semibold text-alert">
              {labels.full}
            </span>
          ) : !canBook ? (
            <span className="flex w-full items-center justify-center rounded-full border border-line px-4 py-2.5 text-center text-[0.7rem] font-semibold text-fog">
              {locale === "es" ? "Solo clientes reservan" : "Only clients can book"}
            </span>
          ) : (
            <Button
              size="sm"
              onClick={onBook}
              disabled={isPending}
              className="w-full"
              style={{
                backgroundColor: accentOnDark(session.gymClass.color),
                color: textOnAccent(session.gymClass.color),
              }}
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {labels.book}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
