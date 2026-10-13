import { Clock, Users } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { getClasses } from "@/lib/data/queries";
import { formatDuration } from "@/lib/schedule";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ButtonLink } from "@/components/ui/button";

const intensityBars: Record<string, number> = { low: 1, medium: 2, high: 3 };

export async function ClassesGrid({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const classes = await getClasses();

  return (
    <Section id="clases" className="border-b border-line">
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
              locale === "es" ? gymClass.description_es : gymClass.description_en;
            const level = intensityBars[gymClass.intensity] ?? 2;

            return (
              <Reveal key={gymClass.id} delay={index * 50} className="h-full">
                <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
                  {/* Barra de color superior */}
                  <span
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ backgroundColor: gymClass.color }}
                    aria-hidden="true"
                  />
                  <span
                    className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30"
                    style={{ backgroundColor: gymClass.color }}
                    aria-hidden="true"
                  />

                  <header className="flex items-start justify-between gap-3">
                    <h3 className="display-xl text-[1.5rem] leading-none">{name}</h3>

                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em]"
                      style={{
                        color: gymClass.color,
                        backgroundColor: `${gymClass.color}1a`,
                      }}
                    >
                      {dict.classes.intensityLevels[gymClass.intensity]}
                    </span>
                  </header>

                  <p className="mt-3 flex-1 text-[0.875rem] leading-relaxed text-fog">
                    {description}
                  </p>

                  <footer className="mt-5 flex items-center gap-4 border-t border-line pt-4 text-[0.75rem] text-fog">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {formatDuration(gymClass.duration_min, locale)}
                    </span>

                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5" aria-hidden="true" />
                      {gymClass.capacity} {dict.classes.capacity}
                    </span>

                    {/* Barras de intensidad */}
                    <span className="ml-auto flex items-end gap-0.5" aria-hidden="true">
                      {[1, 2, 3].map((bar) => (
                        <span
                          key={bar}
                          className="w-1 rounded-full transition-colors"
                          style={{
                            height: `${0.35 + bar * 0.28}rem`,
                            backgroundColor:
                              bar <= level ? gymClass.color : "rgba(255,255,255,0.14)",
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
