import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { mapsEmbedUrl, mapsLink, siteConfig, whatsappLink } from "@/config/site";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ContactForm } from "./contact-form";

export function Contact({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  const details = [
    {
      Icon: MapPin,
      label: dict.contact.addressLabel,
      value: `${siteConfig.address.street}, ${siteConfig.address.city}`,
      href: mapsLink(),
      external: true,
    },
    {
      Icon: Phone,
      label: dict.contact.phoneLabel,
      value: siteConfig.phone,
      href: whatsappLink(),
      external: true,
    },
    {
      Icon: Mail,
      label: dict.contact.emailLabel,
      value: siteConfig.contactEmail,
      href: `mailto:${siteConfig.contactEmail}`,
      external: false,
    },
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
              {details.map(({ Icon, label, value, href, external }) => (
                <li key={label} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-void text-volt">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
                      {label}
                    </span>
                    <a
                      href={href}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="mt-1 block text-[0.9375rem] leading-snug text-chalk transition-colors hover:text-volt"
                    >
                      {value}
                    </a>
                  </span>
                </li>
              ))}

              <li className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-void text-volt">
                  <Clock className="size-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
                    {dict.contact.hoursLabel}
                  </span>
                  <span className="mt-1 block text-[0.875rem] leading-relaxed text-chalk">
                    {dict.contact.hours.map((entry) => (
                      <span key={entry.day} className="block">
                        <span className="text-fog">{entry.day}:</span> {entry.time}
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            </ul>
          </Reveal>

          {/* Mapa */}
          <Reveal delay={100} className="flex-1">
            <div className="h-full min-h-56 overflow-hidden rounded-2xl border border-line bg-card">
              <iframe
                title={dict.contact.mapTitle}
                src={mapsEmbedUrl()}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="size-full min-h-56 grayscale-[0.65] contrast-110 transition-all duration-500 hover:grayscale-0"
              />
            </div>
          </Reveal>
        </div>

        {/* Formulario */}
        <Reveal delay={60} className="lg:col-span-7">
          <ContactForm />
        </Reveal>
      </div>
    </Section>
  );
}
