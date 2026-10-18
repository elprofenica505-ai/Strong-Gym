import { readData } from "@/lib/data/read-result";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import {
  CalendarCheck,
  Clock,
  DoorOpen,
  MessageCircle,
  Users,
} from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { getClasses } from "@/lib/data/queries";
import { formatDuration } from "@/lib/schedule";
import { whatsappLink } from "@/config/site";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ButtonLink } from "@/components/ui/button";
import { accentOnDark, textOnAccent } from "@/lib/utils";

const intensityBars: Record<string, number> = { low: 1, medium: 2, high: 3 };

/** Cómo se accede a cada disciplina: reserva, acceso libre o consulta. */
const ACCESS: Record<string, "book" | "free" | "ask"> = {
  boxeo: "book",
  musculacion: "free",
  zumba: "ask",
};

export async function ClassesGrid({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const result = await readData(() => getClasses());
  if (!result.ok)
    return (
      <Section id="clases">
        <DataUnavailable locale={locale} code={result.code} />
      </Section>
    );
  const classes = result.data;

  return (
    <Section id="clases" className="border-b border-line bg-cloud">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeading
          eyebrow={dict.nav.classes}
          title={dict.classes.title}
          subtitle={dict.classes.subtitle}
        />

        <Reveal delay={120} className="shrink-0">
          <ButtonLink href={`/${locale}/horarios`} variant="outline" size="md">
            {dict.classes.seeSchedule}
          </ButtonLink>
        </Reveal>
      </div>

      {classes.length === 0 ? (
        <p className="mt-10 text-fog">{dict.classes.empty}</p>
      ) : (
        <div className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((gymClass, index) => {
            const name = locale === "es" ? gymClass.name_es : gymClass.name_en;
            const description =
              locale === "es"
                ? gymClass.description_es
                : gymClass.description_en;
            const level = intensityBars[gymClass.intensity] ?? 2;
            const access = ACCESS[gymClass.slug] ?? "ask";

            return (
              <Reveal key={gymClass.id} delay={index * 50} className="h-full">
                <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_18px_50px_-30px_rgba(216,26,34,0.55)]">
                  {/* Barra de color superior */}
                  <span
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ backgroundColor: accentOnDark(gymClass.color) }}
                    aria-hidden="true"
                  />

                  <header className="flex items-start justify-between gap-3">
                    <h3 className="display-xl text-[1.5rem] leading-none text-ink">
                      {name}
                    </h3>

                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[0.625rem] font-bold tracking-[0.1em] uppercase"
                      style={{
                        backgroundColor: accentOnDark(gymClass.color),
                        color: textOnAccent(gymClass.color),
                      }}
                    >
                      {dict.classes.intensityLevels[gymClass.intensity]}
                    </span>
                  </header>

                  <p className="mt-3 flex-1 text-[0.875rem] leading-relaxed text-fog">
                    {description}
                  </p>

                  {/* Cómo se accede */}
                  <div className="mt-5">
                    {access === "book" ? (
                      <ButtonLink
                        href={`/${locale}/horarios`}
                        variant="primary"
                        size="sm"
                        className="w-full"
                      >
                        <CalendarCheck
                          className="size-3.5"
                          aria-hidden="true"
                        />
                        {dict.classes.bookSchedule}
                      </ButtonLink>
                    ) : access === "free" ? (
                      <span className="flex items-center gap-2 rounded-full border border-line bg-cloud px-3.5 py-2 text-[0.75rem] font-medium text-mist">
                        <DoorOpen
                          className="size-3.5 shrink-0 text-brand"
                          aria-hidden="true"
                        />
                        {dict.classes.freeAccess} ·{" "}
                        {dict.classes.freeAccessHint}
                      </span>
                    ) : (
                      <ButtonLink
                        href={whatsappLink(
                          locale === "es"
                            ? `Hola, quiero consultar el horario de ${name}.`
                            : `Hi, I would like to ask about the ${name} schedule.`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <MessageCircle
                          className="size-3.5"
                          aria-hidden="true"
                        />
                        {dict.classes.askSchedule}
                      </ButtonLink>
                    )}
                  </div>
                  {access === "book" ? (
                    <p className="mt-3 text-[0.75rem] leading-relaxed text-fog">
                      {dict.classes.availabilityHint}
                    </p>
                  ) : null}

                  <footer className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-[0.75rem] text-fog">
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {formatDuration(gymClass.duration_min, locale)}
                    </span>

                    <span className="flex min-w-0 flex-1 items-start gap-1.5">
                      <Users className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {(access === "book" ? dict.classes.sessionCapacity : dict.classes.capacity)
                          .replace("{count}", String(gymClass.capacity))}
                      </span>
                    </span>

                    {/* Barras de intensidad */}
                    <span
                      className="ml-auto flex items-end gap-0.5"
                      aria-hidden="true"
                    >
                      {[1, 2, 3].map((bar) => (
                        <span
                          key={bar}
                          className="w-1 rounded-full transition-colors"
                          style={{
                            height: `${0.35 + bar * 0.28}rem`,
                            backgroundColor:
                              bar <= level
                                ? accentOnDark(gymClass.color)
                                : "rgba(255,255,255,0.16)",
                          }}
                        />
                      ))}
                    </span>
                  </footer>
                </article>
              </Reveal>
            );
          })}
        </div>
      )}
    </Section>
  );
}
