import { InstagramIcon } from "@/components/ui/social-icons";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { getCoaches } from "@/lib/data/queries";
import { siteConfig } from "@/config/site";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";

export async function Coaches({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const coaches = await getCoaches();

  return (
    <Section id="profes" className="border-b border-line">
      <SectionHeading
        eyebrow={dict.nav.coaches}
        title={dict.coaches.title}
        subtitle={dict.coaches.subtitle}
      />

      <div className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
        {coaches.map((coach, index) => {
          const role = locale === "es" ? coach.role_es : coach.role_en;
          const bio = locale === "es" ? coach.bio_es : coach.bio_en;

          return (
            <Reveal key={coach.id} delay={index * 60} className="h-full">
              <article className="group flex h-full flex-col rounded-2xl border border-line bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
                <div className="flex items-center gap-4">
                  {/* Avatar con iniciales */}
                  <span
                    className="display-xl grid size-16 shrink-0 place-items-center rounded-2xl text-[1.25rem] transition-transform duration-300 group-hover:scale-105"
                    style={{
                      color: coach.color,
                      backgroundColor: `${coach.color}1a`,
                      boxShadow: `inset 0 0 0 1px ${coach.color}45`,
                    }}
                    aria-hidden="true"
                  >
                    {coach.initials}
                  </span>

                  <div className="min-w-0">
                    <h3 className="truncate text-[1.0625rem] font-semibold text-chalk">
                      {coach.name}
                    </h3>
                    <p className="mt-0.5 text-[0.75rem] leading-snug" style={{ color: coach.color }}>
                      {role}
                    </p>
                  </div>
                </div>

                <p className="mt-5 flex-1 text-[0.875rem] leading-relaxed text-fog">{bio}</p>

                <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                  <div className="flex flex-wrap gap-1.5">
                    {coach.specialties.slice(0, 2).map((specialty) => (
                      <span
                        key={specialty}
                        className="rounded-full border border-line px-2.5 py-1 text-[0.625rem] font-medium tracking-wide text-fog capitalize"
                      >
                        {specialty.replace("-", " ")}
                      </span>
                    ))}
                  </div>

                  <a
                    href={siteConfig.social.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Instagram de ${coach.name}`}
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-fog transition-colors hover:border-volt/60 hover:text-volt"
                  >
                    <InstagramIcon className="size-4" />
                  </a>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
