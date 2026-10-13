import type { Metadata } from "next";
import { CalendarDays, Info, ShieldCheck, Timer } from "lucide-react";
import { ScheduleBoard } from "@/components/schedule/schedule-board";
import { CtaBand } from "@/components/sections/cta-band";
import { SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import { siteConfig } from "@/config/site";
import { getSessionsForWeek } from "@/lib/data/queries";
import { scheduleJsonLd } from "@/lib/structured-data";
import { formatTime } from "@/lib/schedule";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);

  return {
    title: dict.schedule.title,
    description: dict.schedule.subtitle,
    alternates: {
      canonical: `/${locale}/horarios`,
      languages: { es: "/es/horarios", en: "/en/horarios" },
    },
  };
}

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string; day?: string }>;
}) {
  const [{ locale: rawLocale }, { week }] = await Promise.all([params, searchParams]);
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const dict = getDictionary(locale);

  // Datos para el JSON-LD (los mismos que verá el usuario)
  const { sessions } = await getSessionsForWeek(week ?? null);
  const jsonLdItems = sessions.slice(0, 50).map((session) => ({
    name: locale === "es" ? session.gymClass.name_es : session.gymClass.name_en,
    start: session.starts_at,
    end: session.ends_at,
    room: session.room,
  }));

  const perks = [
    { Icon: CalendarDays, text: dict.schedule.subtitle },
    {
      Icon: Timer,
      text:
        locale === "es"
          ? `Podés cancelar sin costo hasta ${siteConfig.cancellationWindowHours} horas antes de la clase.`
          : `You can cancel free of charge up to ${siteConfig.cancellationWindowHours} hours before the class.`,
    },
    {
      Icon: ShieldCheck,
      text:
        locale === "es"
          ? "Los cupos se liberan automáticamente si alguien cancela."
          : "Spots are released automatically when someone cancels.",
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(scheduleJsonLd(locale, dict, jsonLdItems)) }}
      />

      {/* Cabecera de la página */}
      <section className="relative overflow-hidden border-b border-line bg-cloud pt-12 pb-12 sm:pt-16 sm:pb-14 lg:pt-20">
        <div className="absolute inset-0 bg-grid opacity-50" aria-hidden="true" />
        <div
          className="absolute -top-32 left-1/3 size-96 rounded-full bg-brand/8 blur-3xl"
          aria-hidden="true"
        />

        <div className="container-x relative">
          <SectionHeading
            eyebrow={dict.nav.schedule}
            title={dict.schedule.title}
            subtitle={dict.schedule.subtitle}
          />

          <Reveal delay={140} className="mt-8 grid gap-3 sm:grid-cols-3">
            {perks.map(({ Icon, text }, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-xl border border-line bg-card/70 p-4"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                <p className="text-[0.75rem] leading-relaxed text-fog">{text}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Tablero de reservas */}
      <section className="py-10 sm:py-12 lg:py-14">
        <div className="container-x">
          <ScheduleBoard initialWeekKey={week} />

          {/* Nota de política de cancelación */}
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-line bg-card/60 p-5">
            <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            <p className="text-[0.8125rem] leading-relaxed text-fog">
              {locale === "es"
                ? `Las reservas se abren con 7 días de anticipación. Cada socio puede tener hasta 3 reservas activas al mismo tiempo y cancelar sin costo hasta ${siteConfig.cancellationWindowHours} horas antes del inicio.`
                : `Bookings open 7 days in advance. Each member can hold up to 3 active bookings at the same time and cancel free of charge up to ${siteConfig.cancellationWindowHours} hours before the start.`}
            </p>
          </div>

          {/* Resumen de la semana */}
          {sessions.length > 0 ? (
            <p className="mt-6 text-center text-[0.75rem] text-fog">
              {dict.schedule.today}: {formatTime(new Date(sessions[0].starts_at), locale)} ·{" "}
              {sessions.length} {dict.schedule.weeklySummary}
            </p>
          ) : null}
        </div>
      </section>

      <CtaBand locale={locale} />
    </>
  );
}
