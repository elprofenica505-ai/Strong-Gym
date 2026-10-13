import { CalendarDays, Heart, ShieldCheck, Smartphone, Timer, Users } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";

const icons = [CalendarDays, Users, Smartphone, Timer, Heart, ShieldCheck];

export function Features({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <Section id="por-que" className="border-b border-line">
      <SectionHeading
        eyebrow={dict.nav.home}
        title={dict.features.title}
        subtitle={dict.features.subtitle}
      />

      <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
        {dict.features.items.map((item, index) => {
          const Icon = icons[index % icons.length];

          return (
            <Reveal
              key={item.title}
              delay={index * 60}
              className="group relative bg-card p-6 transition-colors duration-300 hover:bg-card-2 sm:p-7 lg:p-8"
            >
              <span className="grid size-11 place-items-center rounded-xl border border-line bg-void text-volt transition-colors duration-300 group-hover:border-volt/50 group-hover:bg-volt/10">
                <Icon className="size-5" aria-hidden="true" />
              </span>

              <h3 className="mt-5 text-[1.0625rem] font-semibold text-chalk">{item.title}</h3>

              <p className="mt-2.5 text-[0.875rem] leading-relaxed text-fog">{item.text}</p>

              <span
                className="absolute inset-x-0 bottom-0 h-px scale-x-0 bg-volt transition-transform duration-500 group-hover:scale-x-100"
                aria-hidden="true"
              />
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
