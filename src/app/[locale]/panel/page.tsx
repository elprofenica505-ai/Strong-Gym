import { readData } from "@/lib/data/read-result";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessPanel } from "@/lib/auth/current-user";
import { ReloadButton } from "@/components/ui/reload-button";
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
import { DEMO_MODE } from "@/lib/supabase/env";

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

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const dict = getDictionary(locale);

  const demo = DEMO_MODE;
  const user = await getCurrentUser();
  const isStaff = canAccessPanel(user);

  if (!demo && !user) redirect(`/${locale}/ingresar`);

  // Un fallo de RLS/red o un perfil inexistente no es una denegación por rol.
  if (!demo && user && user.profileStatus !== "ready") {
    const es = locale === "es";
    return (
      <section className="container-x flex min-h-[70vh] flex-col items-center justify-center gap-5 py-24 text-center">
        <ShieldAlert className="size-8 text-alert" aria-hidden="true" />
        <h1 className="display-xl text-[1.75rem]">
          {es
            ? "No pudimos verificar tu perfil"
            : "We could not verify your profile"}
        </h1>
        <p className="max-w-lg text-fog">
          {es
            ? "Tu sesión está iniciada, pero no se pudo leer un perfil válido en public.profiles. No cambiamos tu rol ni habilitamos acceso sin verificarlo. Revisá las políticas RLS y que Vercel use el mismo proyecto de Supabase donde verificaste tu rol."
            : "You are signed in, but a valid public.profiles record could not be read. Your role was not changed and access remains protected. Check RLS policies and that Vercel uses the correct Supabase project."}
        </p>
        <p className="max-w-full break-all font-mono text-xs text-fog">
          ID: {user.id} ·{" "}
          {user.profileStatus === "missing"
            ? es
              ? "Perfil no visible o inexistente"
              : "Profile missing or not visible"
            : es
              ? "Error al leer el perfil"
              : "Profile read error"}
        </p>
        <ReloadButton label={es ? "Reintentar" : "Retry"} />
      </section>
    );
  }

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

        {user ? (
          <p className="mt-4 max-w-full break-all font-mono text-xs text-fog">
            ID: {user.id} · public.profiles.role: {user.role}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
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
    const result = await readData(() =>
      Promise.all([
        getAllBookings(),
        getClasses(),
        getContactMessages(),
        countMembers(),
        getSessionsForWeek(),
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
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-12 pb-10 sm:pt-16 sm:pb-12 lg:pt-20">
        <div
          className="absolute inset-0 bg-grid opacity-50"
          aria-hidden="true"
        />
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
                {user.fullName} ·{" "}
                <span className="font-mono text-brand-300">{user.role}</span>
              </>
            ) : (
              <>
                {dict.demo.title} ·{" "}
                <Link
                  href={`/${locale}/ingresar`}
                  className="text-brand-300 hover:opacity-80"
                >
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
