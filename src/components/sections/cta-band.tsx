import { ArrowUpRight, CalendarCheck, MessageCircle } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { whatsappLink } from "@/config/site";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";

/** Banda de llamada a la acción, antes del footer. */
export function CtaBand({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="absolute inset-0 bg-gradient-to-br from-volt via-volt-600 to-volt-700" />
      <div className="absolute inset-0 bg-grid opacity-[0.07]" />
      <div className="absolute -top-24 -right-16 size-72 rounded-full bg-white/20 blur-3xl" aria-hidden="true" />

      <div className="container-x relative py-14 sm:py-16 lg:py-20">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <Reveal>
            <p className="text-[0.6875rem] font-bold tracking-[0.2em] text-ink/60 uppercase">
              {dict.cta.freeTrial}
            </p>

            <h2 className="display-xl mt-3 max-w-2xl text-[2rem] leading-[0.92] text-ink sm:text-[2.75rem] lg:text-[3.25rem]">
              {dict.hero.badge}
            </h2>

            <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-ink/75">
              {dict.schedule.subtitle}
            </p>
          </Reveal>

          <Reveal delay={120} className="shrink-0">
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <ButtonLink
                href={`/${locale}/horarios`}
                size="lg"
                className="bg-ink text-chalk shadow-none hover:bg-ink/85 hover:text-volt"
              >
                <CalendarCheck className="size-4.5" aria-hidden="true" />
                {dict.cta.bookNow}
              </ButtonLink>

              <a
                href={whatsappLink(dict.cta.freeTrial)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-ink/25 px-7 text-[0.9375rem] font-semibold text-ink transition-colors hover:border-ink/50 hover:bg-ink/5"
              >
                <MessageCircle className="size-4.5" aria-hidden="true" />
                {dict.cta.whatsapp}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
