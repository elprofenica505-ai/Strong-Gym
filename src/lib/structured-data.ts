import { getSiteUrl, siteConfig } from "@/config/site";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

/** JSON-LD del gimnasio, para que Google muestre horarios, dirección y teléfono. */
export function homeJsonLd(locale: Locale, dict: Dictionary) {
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    "@id": `${siteUrl}/#gym`,
    name: siteConfig.name,
    legalName: siteConfig.legalName,
    description: dict.meta.description,
    url: `${siteUrl}/${locale}`,
    telephone: siteConfig.phone,
    email: siteConfig.contactEmail,
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.address.street,
      addressLocality: siteConfig.address.city,
      addressRegion: siteConfig.address.region,
      postalCode: siteConfig.address.postalCode,
      addressCountry: siteConfig.address.country.slice(0, 2).toUpperCase(),
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: siteConfig.geo.lat,
      longitude: siteConfig.geo.lng,
    },
    sameAs: [
      siteConfig.social.instagram,
      siteConfig.social.facebook,
      siteConfig.social.youtube,
    ],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: siteConfig.openingHours.weekday.opens,
        closes: siteConfig.openingHours.weekday.closes,
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday"],
        opens: siteConfig.openingHours.saturday.opens,
        closes: siteConfig.openingHours.saturday.closes,
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Sunday"],
        opens: siteConfig.openingHours.sunday.opens,
        closes: siteConfig.openingHours.sunday.closes,
      },
    ],
    inLanguage: locale,
    potentialAction: {
      "@type": "ReserveAction",
      name: dict.cta.book,
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/${locale}/horarios`,
        inLanguage: locale,
        actionPlatform: [
          "http://schema.org/DesktopWebPlatform",
          "http://schema.org/MobileWebPlatform",
        ],
      },
    },
  };
}

/** JSON-LD para la página de horarios (lista de clases reservables). */
export function scheduleJsonLd(
  locale: Locale,
  dict: Dictionary,
  items: { name: string; start: string; end: string; room: string }[],
) {
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: dict.schedule.title,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Event",
        name: item.name,
        startDate: item.start,
        endDate: item.end,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: `${siteConfig.name} — ${item.room}`,
          address: {
            "@type": "PostalAddress",
            streetAddress: siteConfig.address.street,
            addressLocality: siteConfig.address.city,
            addressCountry: siteConfig.address.country.slice(0, 2).toUpperCase(),
          },
        },
        url: `${siteUrl}/${locale}/horarios`,
      },
    })),
  };
}
