import { Check, Sparkles } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { formatPrice, whatsappLink } from "@/config/site";
import { getPlans } from "@/lib/data/queries";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function Plans({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const plans = await getPlans();

  return (
    <Section id="planes" className="border-b border-line">
      <SectionHeading
        eyebrow={dict.nav.plans}
        title={dict.plans.title}
        subtitle={dict.plans.subtitle}
      />

      <div className="mt-10 grid gap-5 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const name = locale === "es" ? plan.name_es : plan.name_en;
          const tagline = locale === "es" ? plan.tagline_es : plan.tagline_en;
          const features = locale === "es" ? plan.features_es : plan.features_en;

          const price = formatPrice(plan.price);
          const period = plan.period === "session" ? dict.plans.session : dict.plans.month;

          return (
            <Reveal key={plan.id} delay={index * 70} className="h-full">
              <article
                className={cn(
                  "relative flex h-full flex-col rounded-3xl border p-6 transition-all duration-300 sm:p-7",
                  plan.is_popular
                    ? "glow-brand border-brand/50 bg-gradient-to-b from-brand-soft to-card"
                    : "border-line bg-card shadow-[0_18px_50px_-38px_rgba(216,26,34,0.45)] hover:border-brand/40",
                )}
              >
                {plan.is_popular ? (
                  <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-[0.625rem] font-bold tracking-[0.12em] text-onbrand uppercase">
                    <Sparkles className="size-3" aria-hidden="true" />
                    {dict.plans.popular}
                  </span>
                ) : null}

                <h3 className="display-xl text-[1.5rem] leading-none text-ink">{name}</h3>

                <p className="mt-2 min-h-10 text-[0.8125rem] leading-snug text-fog">{tagline}</p>

                {/* Si el gimnasio todavía no publicó el precio mostramos
                    "Consultar" en vez de inventar un número. */}
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "display-xl leading-none",
                      price ? "text-[2.75rem]" : "text-[1.75rem]",
                      plan.is_popular ? "text-brand-300" : "text-ink",
                    )}
                  >
                    {price ?? dict.plans.consult}
                  </span>
                  {price ? <span className="text-[0.75rem] text-fog">{period}</span> : null}
                </p>

                <ul className="mt-6 flex flex-1 flex-col gap-3 border-t border-line pt-6">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-brand"
                        strokeWidth={2.75}
                        aria-hidden="true"
                      />
                      <span className="text-[0.8125rem] leading-snug text-mist">{feature}</span>
                    </li>
                  ))}
                </ul>

                <ButtonLink
                  href={whatsappLink(
                    locale === "es"
                      ? `Hola, me interesa el plan ${name}.`
                      : `Hi, I am interested in the ${name} plan.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant={plan.is_popular ? "primary" : "outline"}
                  size="md"
                  className="mt-7 w-full"
                >
                  {price ? dict.plans.choose : dict.plans.ask}
                </ButtonLink>
              </article>
            </Reveal>
          );
        })}
      </div>

      {/* Qué incluyen todos los planes */}
      <Reveal delay={120} className="mt-8">
        <div className="rounded-2xl border border-line bg-card p-6 sm:p-7">
          <p className="text-[0.8125rem] font-semibold tracking-[0.14em] text-mist uppercase">
            {dict.plans.allIncluded}
          </p>

          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {dict.plans.included.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-brand"
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
