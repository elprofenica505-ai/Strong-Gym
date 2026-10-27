import { Clock, Mail, MapPin, Navigation, Phone } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  fullAddress,
  mapsEmbedUrl,
  mapsLink,
  openingHoursSummary,
  siteConfig,
  whatsappLink,
} from "@/config/site";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ButtonLink } from "@/components/ui/button";
import { ContactForm } from "./contact-form";
import type { PublicDisciplineVisibility } from "@/lib/public-disciplines";

export function Contact({
  locale,
  showBoxing = true,
  showZumba = true,
}: { locale: Locale } & Partial<PublicDisciplineVisibility>) {
  const dict = getDictionary(locale);
  const hours = openingHoursSummary(locale);

  const details = [
    {
      key: "address",
      Icon: MapPin,
      label: dict.contact.addressLabel,
      value: fullAddress(),
      href: mapsLink(),
      external: true,
    },
    {
      key: "phone",
      Icon: Phone,
      label: dict.contact.phoneLabel,
      value: siteConfig.phoneIntl,
      href: whatsappLink(),
      external: true,
    },
    // El email sólo aparece cuando el gimnasio tenga uno.
    ...(siteConfig.contactEmail
      ? [
          {
            key: "email",
            Icon: Mail,
            label: dict.contact.emailLabel,
            value: siteConfig.contactEmail,
            href: `mailto:${siteConfig.contactEmail}`,
            external: false,
          },
        ]
      : []),
  ];

  return (
    <Section id="contacto" className="border-b border-line">
      <SectionHeading
        eyebrow={dict.nav.contact}
        title={dict.contact.title}
        subtitle={dict.contact.subtitle}
      />

      <div className="mt-10 grid gap-5 sm:mt-14 lg:grid-cols-12 lg:gap-6">
        {/* Datos + mapa */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          <Reveal className="rounded-2xl border border-line bg-card p-6">
            <ul className="flex flex-col gap-5">
              {details.map(({ key, Icon, label, value, href, external }) => (
                <li key={key} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-300">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
                      {label}
                    </span>
                    <a
                      href={href}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="mt-1 block text-[0.9375rem] leading-snug text-ink transition-colors hover:text-brand-300"
                    >
                      {value}
                    </a>
                  </span>
                </li>
              ))}

              {/* Horario real: dos tramos el sábado y domingo cerrado */}
              <li className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-300">
                  <Clock className="size-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
                    {dict.contact.hoursLabel}
                  </span>
                  <dl className="mt-1.5 flex flex-col gap-1 text-[0.875rem] leading-relaxed">
                    {hours.map((row) => (
                      <div key={row.days} className="flex flex-wrap justify-between gap-x-3">
                        <dt className="text-fog">{row.days}</dt>
                        <dd
                          className={
                            row.hours === dict.contact.closed
                              ? "font-semibold text-brand-300"
                              : "font-medium text-ink tabular-nums"
                          }
                        >
                          {row.hours}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </span>
              </li>
            </ul>

            <ButtonLink
              href={mapsLink()}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              size="md"
              className="mt-6 w-full"
            >
              <Navigation className="size-4" aria-hidden="true" />
              {dict.cta.directions}
            </ButtonLink>
          </Reveal>

          {/* Mapa */}
          <Reveal delay={100} className="flex-1">
            <div className="h-full min-h-56 overflow-hidden rounded-2xl border border-line bg-cloud">
              <iframe
                title={dict.contact.mapTitle}
                src={mapsEmbedUrl()}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="size-full min-h-56"
              />
            </div>
          </Reveal>
        </div>

        {/* Formulario */}
        <Reveal delay={60} className="lg:col-span-7">
          <ContactForm showClassSubject={showBoxing || showZumba} />
        </Reveal>
      </div>
    </Section>
  );
}
