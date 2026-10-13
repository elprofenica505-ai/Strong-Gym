import { Check, Sparkles } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { formatPrice } from "@/config/site";
import { getPlans } from "@/lib/data/queries";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function Plans({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const plans = await getPlans();

  return (
    <Section id="planes" className="border-b border-line bg-coal">
      <SectionHeading
        eyebrow={dict.nav.plans}
        title={dict.plans.title}
        subtitle={dict.plans.subtitle}
      />

      <div className="mt-10 grid gap-5 sm:mt-14 lg:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan, index) => {
          const name = locale === "es" ? plan.name_es : plan.name_en;
          const tagline = locale === "es" ? plan.tagline_es : plan.tagline_en;
          const features = locale === "es" ? plan.features_es : plan.features_en;

          return (
            <Reveal key={plan.id} delay={index * 70} className="h-full">
              <article
                className={cn(
                  "relative flex h-full flex-col rounded-3xl border p-6 transition-all duration-300 sm:p-7",
                  plan.is_popular
                    ? "border-volt/50 bg-gradient-to-b from-volt/[0.09] to-card ring-volt"
                    : "border-line bg-card hover:border-white/20",
                )}
              >
                {plan.is_popular ? (
                  <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-volt px-3 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-ink">
                    <Sparkles className="size-3" aria-hidden="true" />
                    {dict.plans.popular}
                  </span>
                ) : null}

                <h3 className="display-xl text-[1.5rem] leading-none">{name}</h3>

                <p className="mt-2 min-h-10 text-[0.8125rem] leading-snug text-fog">{tagline}</p>

                <p className="mt-6 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "display-xl text-[2.75rem] leading-none",
                      plan.is_popular ? "text-volt" : "text-chalk",
                    )}
                  >
                    {formatPrice(plan.price)}
                  </span>
                  <span className="text-[0.75rem] text-fog">{dict.plans.month}</span>
                </p>

                <ul className="mt-6 flex flex-1 flex-col gap-3 border-t border-line pt-6">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-volt"
                        strokeWidth={2.75}
                        aria-hidden="true"
                      />
                      <span className="text-[0.8125rem] leading-snug text-mist">{feature}</span>
                    </li>
                  ))}
                </ul>

                <ButtonLink
                  href={`/${locale}/horarios`}
                  variant={plan.is_popular ? "primary" : "outline"}
                  size="md"
                  className="mt-7 w-full"
                >
                  {dict.plans.choose}
                </ButtonLink>
              </article>
            </Reveal>
          );
        })}
      </div>

      {/* Qué incluyen todos los planes */}
      <Reveal delay={120} className="mt-8">
        <div className="rounded-2xl border border-line bg-card/60 p-6 sm:p-7">
          <p className="text-[0.8125rem] font-semibold tracking-[0.14em] text-mist uppercase">
            {dict.plans.allIncluded}
          </p>

          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {dict.plans.included.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-volt"
                  strokeWidth={2.75}
                  aria-hidden="true"
                />
                <span className="text-[0.8125rem] leading-snug text-fog">{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-5 border-t border-line pt-4 text-[0.75rem] text-fog">
            {dict.plans.note}
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
