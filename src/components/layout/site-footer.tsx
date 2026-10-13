import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
} from "@/components/ui/social-icons";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { formatDateNumeric, gymNow } from "@/lib/schedule";
import { siteConfig, whatsappLink } from "@/config/site";
import { Logo } from "./logo";
import { NewsletterForm } from "./newsletter-form";

export function SiteFooter({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const year = gymNow().getFullYear();

  const navLinks = [
    { href: `/${locale}`, label: dict.nav.home },
    { href: `/${locale}/horarios`, label: dict.nav.schedule },
    { href: `/${locale}#clases`, label: dict.nav.classes },
    { href: `/${locale}#planes`, label: dict.nav.plans },
    { href: `/${locale}#profes`, label: dict.nav.coaches },
    { href: `/${locale}#contacto`, label: dict.nav.contact },
  ];

  const socials = [
    { href: siteConfig.social.instagram, label: "Instagram", Icon: InstagramIcon },
    { href: siteConfig.social.facebook, label: "Facebook", Icon: FacebookIcon },
    { href: siteConfig.social.youtube, label: "YouTube", Icon: YoutubeIcon },
  ];

  return (
    <footer className="relative mt-8 border-t border-line bg-coal">
      <div className="container-x py-14 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          {/* Marca */}
          <div className="lg:col-span-4">
            <Logo locale={locale} name={dict.nav.home} />

            <p className="mt-5 max-w-sm text-[0.875rem] leading-relaxed text-fog">
              {dict.footer.about}
            </p>

            <div className="mt-6">
              <p className="mb-2 text-[0.6875rem] font-semibold tracking-[0.16em] text-mist uppercase">
                {dict.footer.socialTitle}
              </p>
              <div className="flex gap-2">
                {socials.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="grid size-10 place-items-center rounded-full border border-line bg-card text-mist transition-colors hover:border-volt/60 hover:text-volt"
                  >
                    <Icon className="size-4.5" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Navegación */}
          <nav className="lg:col-span-2" aria-label={dict.footer.quickLinks}>
            <h2 className="mb-4 text-[0.6875rem] font-semibold tracking-[0.16em] text-mist uppercase">
              {dict.footer.quickLinks}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {navLinks.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-[0.875rem] text-fog transition-colors hover:text-volt"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Servicios */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-[0.6875rem] font-semibold tracking-[0.16em] text-mist uppercase">
              {dict.footer.servicesTitle}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {dict.footer.services.map((service) => (
                <li key={service} className="text-[0.875rem] text-fog">
                  {service}
                </li>
              ))}
            </ul>
          </div>

          {/* Contacto */}
          <div className="lg:col-span-4">
            <h2 className="mb-4 text-[0.6875rem] font-semibold tracking-[0.16em] text-mist uppercase">
              {dict.footer.contactTitle}
            </h2>

            <ul className="flex flex-col gap-3 text-[0.875rem] text-fog">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-volt" aria-hidden="true" />
                <span>
                  {siteConfig.address.street}
                  <br />
                  {siteConfig.address.city}, {siteConfig.address.country}
                </span>
              </li>
              <li className="flex gap-3">
                <Phone className="mt-0.5 size-4 shrink-0 text-volt" aria-hidden="true" />
                <a href={whatsappLink()} className="transition-colors hover:text-chalk">
                  {siteConfig.phone}
                </a>
              </li>
              <li className="flex gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-volt" aria-hidden="true" />
                <a
                  href={`mailto:${siteConfig.contactEmail}`}
                  className="transition-colors hover:text-chalk"
                >
                  {siteConfig.contactEmail}
                </a>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-volt" aria-hidden="true" />
                <span>
                  {dict.contact.hours.map((entry) => (
                    <span key={entry.day} className="block">
                      <span className="text-mist">{entry.day}:</span> {entry.time}
                    </span>
                  ))}
                </span>
              </li>
            </ul>

            <div className="mt-6">
              <p className="mb-2 text-[0.8125rem] font-medium text-chalk">{dict.footer.newsletter}</p>
              <p className="mb-3 text-[0.8125rem] text-fog">{dict.footer.newsletterText}</p>
              <NewsletterForm className="max-w-sm" />
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.75rem] text-fog">
            © {year} {siteConfig.name}. {dict.footer.rights}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.75rem] text-fog">
            <span className="hidden sm:inline">
              {dict.footer.madeWith} · {formatDateNumeric(gymNow(), locale)}
            </span>
            <Link href={`/${locale}#contacto`} className="transition-colors hover:text-chalk">
              {dict.footer.terms}
            </Link>
            <Link href={`/${locale}#contacto`} className="transition-colors hover:text-chalk">
              {dict.footer.privacy}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
