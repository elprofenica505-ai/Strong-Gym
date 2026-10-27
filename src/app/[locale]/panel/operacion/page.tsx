import { readData } from "@/lib/data/read-result";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  canAccessPanel,
  isAdminRole,
  isFinanceRole,
} from "@/lib/auth/current-user";
import { ShieldAlert } from "lucide-react";
import {
  AdminPanel,
  type AdminBookingRow,
  type AdminClassRow,
} from "@/components/admin/admin-panel";
import { SectionHeading } from "@/components/ui/section";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import {
  countMembers,
  getAdminClasses,
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
import { DEMO_MODE } from "@/lib/supabase/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: "Operación",
    robots: { index: false, follow: false },
  };
}

export default async function OperacionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const dict = getDictionary(locale);
  const demo = DEMO_MODE;
  const user = await getCurrentUser();

  if (!demo && !user) redirect(`/${locale}/ingresar`);

  if (!demo && user && user.profileStatus !== "ready") {
    return (
      <section className="container-x flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <ShieldAlert className="size-8 text-alert" aria-hidden="true" />
        <p className="max-w-lg text-fog">
          {locale === "es"
            ? "No pudimos verificar tu perfil. No cambiamos tu rol ni habilitamos acceso sin verificarlo."
            : "We could not verify your profile. Access remains protected."}
        </p>
      </section>
    );
  }

  // Operación: administración y caja. El entrenador no entra aquí.
  if (!demo && (!canAccessPanel(user) || !isFinanceRole(user?.role))) {
    redirect(`/${locale}/panel`);
  }
  const canManageClasses =
    !demo && canAccessPanel(user) && isAdminRole(user?.role);

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
    const result = await readData(() =>
      Promise.all([
        getAllBookings(),
        canManageClasses ? getAdminClasses() : getClasses(),
        getContactMessages(),
        countMembers(),
        getSessionsForWeek(null, {
          includeInactiveClasses: canManageClasses,
        }),
      ]),
    );
    if (!result.ok)
      return (
        <section className="container-x py-12">
          <DataUnavailable locale={locale} code={result.code} />
        </section>
      );
    const [rawBookings, rawClasses, rawMessages, members, week] = result.data;

    messages = rawMessages;
    memberCount = members;

    const sessionsPerClass = new Map<string, number>();
    for (const session of week.sessions) {
      sessionsPerClass.set(
        session.class_id,
        (sessionsPerClass.get(session.class_id) ?? 0) + 1,
      );
    }

    bookings = rawBookings.map((booking) => ({
      id: booking.id,
      memberName: booking.memberName,
      memberEmail: booking.memberEmail,
      status: booking.status,
      createdAt: booking.created_at,
      className:
        locale === "es"
          ? booking.session.gymClass.name_es
          : booking.session.gymClass.name_en,
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
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-10 pb-8 sm:pt-12 sm:pb-10">
        <div className="container-x relative">
          <SectionHeading
            eyebrow="Módulo · Operación"
            title="Reservas, mensajes y clases"
            subtitle={dict.admin.subtitle}
          />
        </div>
      </section>

      <section className="py-8 sm:py-10">
        <div className="container-x">
          <AdminPanel
            bookings={bookings}
            messages={messages}
            classes={classes}
            memberCount={memberCount}
            isDemo={demo}
            canManageClasses={canManageClasses}
          />
        </div>
      </section>
    </>
  );
}
