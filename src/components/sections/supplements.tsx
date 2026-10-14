import { Check } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { whatsappLink } from "@/config/site";
import { demoSupplements } from "@/lib/data/demo-content";
import { Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ButtonLink } from "@/components/ui/button";
import { GymPhoto } from "@/components/ui/gym-photo";

/**
 * Suplementos y ropa deportiva que vende el gimnasio.
 * Los precios cambian seguido, así que no se publican: se consultan
 * por WhatsApp con el producto ya escrito en el mensaje.
 */
export function Supplements({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <Section id="suplementos" className="border-b border-line bg-cloud">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
        {/* Foto */}
        <Reveal className="lg:col-span-5">
          <figure className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-line bg-card lg:aspect-[4/5]">
            <GymPhoto
              src="/images/supl1.jpg"
              alt={dict.supplements.title}
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-cover"
            />
          </figure>
        </Reveal>

        {/* Lista */}
        <div className="lg:col-span-7">
          <Reveal delay={80}>
            <span className="eyebrow">
              <span className="h-px w-6 bg-brand" aria-hidden="true" />
              {dict.supplements.eyebrow}
            </span>

            <h2 className="display-xl mt-4 max-w-xl text-[2rem] leading-[0.92] text-ink sm:text-[2.75rem] lg:text-[3.25rem]">
              {dict.supplements.title}
            </h2>

            <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-fog sm:text-base">
              {dict.supplements.subtitle}
            </p>
          </Reveal>

          <Reveal delay={140}>
            <ul className="mt-8 grid gap-2.5 sm:grid-cols-2">
              {demoSupplements.map((key) => (
                <li
                  key={key}
                  className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3.5"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-300">
                    <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <span className="text-[0.9375rem] font-medium text-ink">
                    {dict.supplements.items[key]}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={200}>
            <p className="mt-6 text-[0.8125rem] text-fog">{dict.supplements.note}</p>

            <ButtonLink
              href={whatsappLink(
                locale === "es"
                  ? "Hola, quiero consultar precio y disponibilidad de suplementos."
                  : "Hi, I would like to ask about supplement prices and availability.",
              )}
              target="_blank"
              rel="noopener noreferrer"
              size="lg"
              className="mt-6"
            >
              {dict.supplements.cta}
            </ButtonLink>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
