import { MessageCircleQuestion, Phone } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { siteConfig, whatsappLink } from "@/config/site";
import { Section, SectionHeading } from "@/components/ui/section";
import { Accordion } from "@/components/ui/accordion";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";

export function Faq({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <Section id="preguntas" className="border-b border-line bg-coal">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <SectionHeading
            eyebrow={dict.nav.contact}
            title={dict.faq.title}
            subtitle={dict.faq.subtitle}
          />

          <Reveal delay={140} className="mt-8">
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-volt/12 text-volt">
                  <MessageCircleQuestion className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[0.875rem] font-semibold text-chalk">
                    {dict.contact.formTitle}
                  </p>
                  <p className="text-[0.75rem] text-fog">{dict.contact.formSubtitle}</p>
                </div>
              </div>

              <a
                href={whatsappLink(dict.cta.freeTrial)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[0.8125rem] font-medium text-volt transition-opacity hover:opacity-80"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {siteConfig.phone}
              </a>

              <ButtonLink href={`/${locale}#contacto`} variant="dark" size="sm" className="mt-1">
                {dict.cta.contact}
              </ButtonLink>
            </div>
          </Reveal>
        </div>

        <Reveal delay={80} className="lg:col-span-7">
          <Accordion items={dict.faq.items} />
        </Reveal>
      </div>
    </Section>
  );
}
