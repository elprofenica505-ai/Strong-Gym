import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import {
  AdminPanel,
  type AdminBookingRow,
  type AdminClassRow,
} from "@/components/admin/admin-panel";
import { SectionHeading } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import {
  countMembers,
  getAllBookings,
  getClasses,
  getContactMessages,
  getCurrentUser,
  getSessionsForWeek,
} from "@/lib/data/queries";
import {
  demoAdminBookings,
  demoAdminClasses,
  demoAdminMessages,
} from "@/lib/data/demo-admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);

  return {
    title: dict.admin.title,
    robots: { index: false, follow: false },
  };
}

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const dict = getDictionary(locale);

  const demo = !isSupabaseConfigured;
  const user = await getCurrentUser();
  const isStaff = user?.role === "admin" || user?.role === "staff";

  /* ------------------------------------------------------------
     Control de acceso: sólo staff/admin (en modo demo se puede
     espiar el panel para ver cómo queda).
     ------------------------------------------------------------ */
  if (!demo && !isStaff) {
    return (
      <section className="container-x flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
        <span className="grid size-14 place-items-center rounded-full border border-alert/40 bg-alert/10 text-alert">
          <ShieldAlert className="size-6" aria-hidden="true" />
        </span>

        <h1 className="display-xl mt-5 text-[1.75rem] sm:text-[2.25rem]">
          {dict.admin.noAccess}
        </h1>

        <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-fog">
          {dict.admin.noAccessHint}
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          {user ? null : (
            <ButtonLink href={`/${locale}/ingresar`} size="lg">
              {dict.nav.login}
            </ButtonLink>
          )}
          <ButtonLink href={`/${locale}/mi-cuenta`} variant="outline" size="lg">
            {dict.account.title}
          </ButtonLink>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------
     Datos del panel
     ------------------------------------------------------------ */

  let bookings: AdminBookingRow[];
  let classes: AdminClassRow[];
  let messages: Awaited<ReturnType<typeof getContactMessages>>;
  let memberCount: number;

  if (demo) {
    bookings = demoAdminBookings();
    classes = demoAdminClasses();
    messages = demoAdminMessages();
    memberCount = 942;
  } else {
    const [rawBookings, rawClasses, rawMessages, members, week] = await Promise.all([
      getAllBookings(),
      getClasses(),
      getContactMessages(),
      countMembers(),
      getSessionsForWeek(),
    ]);

    messages = rawMessages;
    memberCount = members;

    const sessionsPerClass = new Map<string, number>();
    for (const session of week.sessions) {
      sessionsPerClass.set(session.class_id, (sessionsPerClass.get(session.class_id) ?? 0) + 1);
    }

    bookings = rawBookings.map((booking) => ({
      id: booking.id,
      memberName: booking.memberName,
      memberEmail: booking.memberEmail,
      status: booking.status,
      createdAt: booking.created_at,
      className:
        locale === "es" ? booking.session.gymClass.name_es : booking.session.gymClass.name_en,
      classColor: booking.session.gymClass.color,
      room: booking.session.room,
      coachName: booking.session.coach?.name ?? null,
      startsAt: booking.session.starts_at,
      sessionId: booking.session_id,
    }));

    classes = rawClasses.map((gymClass) => ({
      id: gymClass.id,
      name: locale === "es" ? gymClass.name_es : gymClass.name_en,
      slug: gymClass.slug,
      color: gymClass.color,
      capacity: gymClass.capacity,
      duration: gymClass.duration_min,
      intensity: gymClass.intensity,
      isActive: gymClass.is_active,
      sessionsThisWeek: sessionsPerClass.get(gymClass.id) ?? 0,
    }));
  }

  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-cloud pt-12 pb-10 sm:pt-16 sm:pb-12 lg:pt-20">
        <div className="absolute inset-0 bg-grid opacity-50" aria-hidden="true" />
        <div
          className="absolute -top-24 left-1/4 size-80 rounded-full bg-brand/8 blur-3xl"
          aria-hidden="true"
        />

        <div className="container-x relative">
          <SectionHeading
            eyebrow={dict.nav.admin}
            title={dict.admin.title}
            subtitle={dict.admin.subtitle}
          />

          <p className="mt-4 text-[0.8125rem] text-fog">
            {user ? (
              <>
                {user.fullName} · <span className="font-mono text-brand">{user.role}</span>
              </>
            ) : (
              <>
                {dict.demo.title} ·{" "}
                <Link href={`/${locale}/ingresar`} className="text-brand hover:opacity-80">
                  {dict.nav.login}
                </Link>
              </>
            )}
          </p>
        </div>
      </section>

      <section className="py-10 sm:py-12 lg:py-14">
        <div className="container-x">
          <AdminPanel
            bookings={bookings}
            messages={messages}
            classes={classes}
            memberCount={memberCount}
            isDemo={demo}
          />
        </div>
      </section>
    </>
  );
}
