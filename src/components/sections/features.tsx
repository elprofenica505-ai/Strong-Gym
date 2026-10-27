import { Clock, Dumbbell, Music, Package, Sparkles, Zap } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import {
  BOXING_CLASS_SLUG,
  ZUMBA_CLASS_SLUG,
  selectPublicDisciplineText,
  type PublicDisciplineVisibility,
} from "@/lib/public-disciplines";

/* Un icono por cada cosa que ofrece el gimnasio, en el mismo orden
   que dict.features.items. */
const icons = [Dumbbell, Zap, Sparkles, Music, Package, Clock];

// En el mismo orden que dict.features.items: Boxeo tercero y Zumba cuarto.
const itemClassSlugs: (string | undefined)[] = [
  undefined,
  undefined,
  BOXING_CLASS_SLUG,
  ZUMBA_CLASS_SLUG,
  undefined,
  undefined,
];

export function Features({
  locale,
  showBoxing = true,
  showZumba = true,
}: { locale: Locale } & Partial<PublicDisciplineVisibility>) {
  const dict = getDictionary(locale);
  const visibility = { showBoxing, showZumba };
  const subtitle = selectPublicDisciplineText(visibility, {
    both: dict.features.subtitle,
    boxingOnly: dict.features.subtitleBoxingOnly,
    danceOnly: dict.features.subtitleDanceOnly,
    weightsOnly: dict.features.subtitleWeightsOnly,
  });
  const items = dict.features.items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => {
      const slug = itemClassSlugs[index];
      if (slug === BOXING_CLASS_SLUG) return showBoxing;
      if (slug === ZUMBA_CLASS_SLUG) return showZumba;
      return true;
    });

  return (
    <Section id="por-que" className="border-b border-line">
      <SectionHeading
        eyebrow={dict.nav.classes}
        title={dict.features.title}
        subtitle={subtitle}
      />

      <div className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ item, index }) => {
          const Icon = icons[index % icons.length];

          return (
            <Reveal
              key={item.title}
              delay={index * 60}
              className="group rounded-2xl border border-line bg-card p-6 transition-colors duration-300 hover:border-brand/45 sm:p-7 lg:p-8"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-300 transition-colors duration-300 group-hover:bg-brand group-hover:text-onbrand">
                <Icon className="size-5" aria-hidden="true" />
              </span>

              <h3 className="mt-5 text-[1.0625rem] font-semibold text-ink">{item.title}</h3>

              <p className="mt-2.5 text-[0.875rem] leading-relaxed text-fog">{item.text}</p>

              <span
                className="absolute inset-x-0 bottom-0 h-px scale-x-0 bg-brand transition-transform duration-500 group-hover:scale-x-100"
                aria-hidden="true"
              />
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
