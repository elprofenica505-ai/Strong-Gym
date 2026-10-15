import { ShieldCheck } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";

/**
 * Normas generales del gimnasio. Son las que el dueño tiene
 * publicadas en el local, tal cual.
 */
export function Rules({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <Section id="normas" className="border-b border-line">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-4">
          <SectionHeading
            eyebrow={dict.rules.eyebrow}
            title={dict.rules.title}
            subtitle={dict.rules.subtitle}
          />

          <Reveal delay={120} className="mt-8 hidden lg:block">
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-300">
              <ShieldCheck className="size-7" aria-hidden="true" />
            </span>
          </Reveal>
        </div>

        <Reveal delay={80} className="lg:col-span-8">
          <ol className="grid gap-px overflow-hidden rounded-2xl border border-brand/25 bg-brand/20 sm:grid-cols-2">
            {dict.rules.items.map((rule, index) => (
              <li key={rule} className="flex gap-3.5 bg-card p-5">
                <span className="display-xl mt-0.5 shrink-0 text-[1.125rem] leading-none text-brand-300 tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-[0.875rem] leading-relaxed text-mist">{rule}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </Section>
  );
}
