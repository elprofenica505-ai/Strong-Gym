import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { GymPhoto } from "@/components/ui/gym-photo";

/**
 * Comunidad: las fotos reales de la gente del gimnasio y el
 * testimonio de resultados (2022 → 2026), publicado con permiso.
 */
export function Community({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <Section id="comunidad" className="border-b border-line bg-cloud">
      <SectionHeading
        eyebrow={dict.community.eyebrow}
        title={dict.community.title}
        subtitle={dict.community.subtitle}
      />

      <div className="mt-10 grid gap-4 sm:mt-14 lg:grid-cols-12">
        {/* Clases grupales / bailoterapia */}
        <Reveal className="lg:col-span-7">
          <figure className="h-full overflow-hidden rounded-3xl border border-line bg-card">
            <div className="relative aspect-[4/3] w-full">
              <GymPhoto
                src="/images/grupo.jpg"
                alt={dict.community.groupCaption}
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="object-cover"
              />
            </div>
            <figcaption className="px-5 py-4 text-[0.8125rem] text-fog">
              {dict.community.groupCaption}
            </figcaption>
          </figure>
        </Reveal>

        {/* Testimonio de resultados */}
        <Reveal delay={90} className="lg:col-span-5">
          <figure className="flex h-full flex-col overflow-hidden rounded-3xl border border-brand/35 bg-brand-soft">
            <div className="relative aspect-[4/3] w-full">
              <GymPhoto
                src="/images/cambio.jpg"
                alt={dict.community.changeCaption}
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
              <span className="absolute top-4 left-4 rounded-full bg-brand px-3 py-1 text-[0.625rem] font-bold tracking-[0.12em] text-onbrand uppercase">
                {dict.community.changeTitle}
              </span>
            </div>
            <figcaption className="flex-1 px-5 py-4 text-[0.8125rem] text-ink/70">
              {dict.community.changeCaption}
            </figcaption>
          </figure>
        </Reveal>

        {/* Socios */}
        <Reveal delay={150} className="lg:col-span-12">
          <figure className="overflow-hidden rounded-3xl border border-line bg-card">
            <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
              <GymPhoto
                src="/images/pareja1.jpg"
                alt={dict.community.membersCaption}
                sizes="100vw"
                className="object-cover object-top"
              />
            </div>
            <figcaption className="px-5 py-4 text-[0.8125rem] text-fog">
              {dict.community.membersCaption}
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </Section>
  );
}
