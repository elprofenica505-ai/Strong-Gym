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
import { openingHoursSummary, siteConfig, whatsappLink } from "@/config/site";
import { Logo } from "./logo";
import { NewsletterForm } from "./newsletter-form";

export function SiteFooter({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const year = gymNow().getFullYear();
  const hours = openingHoursSummary(locale);

  const navLinks = [
    { href: `/${locale}`, label: dict.nav.home },
    { href: `/${locale}/horarios`, label: dict.nav.schedule },
    { href: `/${locale}#boxeo`, label: dict.nav.boxing },
    { href: `/${locale}#planes`, label: dict.nav.plans },
    { href: `/${locale}#suplementos`, label: dict.nav.supplements },
    { href: `/${locale}#contacto`, label: dict.nav.contact },
  ];

  // Sólo mostramos las redes que el gimnasio realmente tiene.
  const socials = [
    { href: siteConfig.social.facebook, label: "Facebook", Icon: FacebookIcon },
    { href: siteConfig.social.instagram, label: "Instagram", Icon: InstagramIcon },
    { href: siteConfig.social.youtube, label: "YouTube", Icon: YoutubeIcon },
  ].filter((social): social is { href: string; label: string; Icon: typeof FacebookIcon } =>
    Boolean(social.href),
  );

  return (
    <footer className="relative border-t border-brand/30 bg-night text-white">
      <div className="container-x py-14 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          {/* Marca */}
          <div className="lg:col-span-4">
            <Logo locale={locale} name={siteConfig.name} tone="dark" />

            <p className="mt-5 max-w-sm text-[0.875rem] leading-relaxed text-white/60">
              {dict.footer.about}
            </p>

            {socials.length > 0 ? (
              <div className="mt-6">
                <p className="mb-2 text-[0.6875rem] font-semibold tracking-[0.16em] text-white/50 uppercase">
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
                      className="grid size-10 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-brand hover:bg-brand/15 hover:text-white"
                    >
                      <Icon className="size-4.5" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Navegación */}
          <nav className="lg:col-span-2" aria-label={dict.footer.quickLinks}>
            <h2 className="mb-4 text-[0.6875rem] font-semibold tracking-[0.16em] text-white/50 uppercase">
              {dict.footer.quickLinks}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {navLinks.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-[0.875rem] text-white/60 transition-colors hover:text-brand"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Servicios */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-[0.6875rem] font-semibold tracking-[0.16em] text-white/50 uppercase">
              {dict.footer.servicesTitle}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {dict.footer.services.map((service) => (
                <li key={service} className="text-[0.875rem] text-white/60">
                  {service}
                </li>
              ))}
            </ul>
          </div>

          {/* Contacto */}
          <div className="lg:col-span-4">
            <h2 className="mb-4 text-[0.6875rem] font-semibold tracking-[0.16em] text-white/50 uppercase">
              {dict.footer.contactTitle}
            </h2>

            <ul className="flex flex-col gap-3 text-[0.875rem] text-white/60">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                <span>
                  {siteConfig.address.street}
                  <br />
                  {siteConfig.address.city}, {siteConfig.address.region},{" "}
                  {siteConfig.address.country}
                </span>
              </li>
              <li className="flex gap-3">
                <Phone className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                <a
                  href={whatsappLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  {siteConfig.phoneIntl}
                </a>
              </li>
              {siteConfig.contactEmail ? (
                <li className="flex gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  <a
                    href={`mailto:${siteConfig.contactEmail}`}
                    className="transition-colors hover:text-white"
                  >
                    {siteConfig.contactEmail}
                  </a>
                </li>
              ) : null}
              <li className="flex gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                <span className="flex-1">
                  {hours.map((row) => (
                    <span key={row.days} className="flex flex-wrap justify-between gap-x-3">
                      <span className="text-white/50">{row.days}</span>
                      <span
                        className={
                          row.hours === dict.contact.closed
                            ? "font-semibold text-brand-300"
                            : "text-white tabular-nums"
                        }
                      >
                        {row.hours}
                      </span>
                    </span>
                  ))}
                </span>
              </li>
            </ul>

            <div className="mt-6">
              <p className="mb-2 text-[0.8125rem] font-medium text-white">
                {dict.footer.newsletter}
              </p>
              <p className="mb-3 text-[0.8125rem] text-white/55">{dict.footer.newsletterText}</p>
              <NewsletterForm className="max-w-sm" />
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/12 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.75rem] text-white/50">
            © {year} {siteConfig.name}. {dict.footer.rights}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.75rem] text-white/50">
            <span className="hidden sm:inline">
              {dict.footer.madeWith} · {formatDateNumeric(gymNow(), locale)}
            </span>
            <Link href={`/${locale}#normas`} className="transition-colors hover:text-white">
              {dict.nav.rules}
            </Link>
            <Link href={`/${locale}/privacidad`} className="transition-colors hover:text-white">
              {dict.footer.privacy}
            </Link>
            <Link href={`/${locale}/terminos`} className="transition-colors hover:text-white">
              {locale === "en" ? "Terms" : "Términos"}
            </Link>
            <Link href={`/${locale}/cookies`} className="transition-colors hover:text-white">
              {locale === "en" ? "Cookies" : "Cookies"}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
