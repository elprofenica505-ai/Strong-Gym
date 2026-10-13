import { Star } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";

export function Testimonials({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <Section id="opiniones" className="border-b border-line bg-coal">
      <SectionHeading
        eyebrow={dict.nav.home}
        title={dict.testimonials.title}
        subtitle={dict.testimonials.subtitle}
      />

      <div className="mt-10 grid gap-4 sm:mt-14 lg:grid-cols-3">
        {dict.testimonials.items.map((item, index) => (
          <Reveal key={item.name} delay={index * 80} className="h-full">
            <figure className="flex h-full flex-col rounded-2xl border border-line bg-card p-6 sm:p-7">
              <div className="flex gap-1" aria-label="5/5">
                {Array.from({ length: 5 }).map((_, starIndex) => (
                  <Star
                    key={starIndex}
                    className="size-4 fill-volt text-volt"
                    aria-hidden="true"
                  />
                ))}
              </div>

              <blockquote className="mt-5 flex-1">
                <p className="text-[0.9375rem] leading-relaxed text-mist">
                  <span className="display-xl mr-1 text-[1.5rem] leading-none text-volt/60" aria-hidden="true">
                    &ldquo;
                  </span>
                  {item.quote}
                </p>
              </blockquote>

              <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-volt/15 text-[0.75rem] font-bold text-volt">
                  {item.name.charAt(0)}
                </span>
                <span>
                  <span className="block text-[0.875rem] font-semibold text-chalk">
                    {item.name}
                  </span>
                  <span className="block text-[0.75rem] text-fog">{item.role}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
