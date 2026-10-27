import { SCHEMA_DAYS, fullAddress, getSiteUrl, mapsLink, siteConfig } from "@/config/site";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

/**
 * Serializa JSON-LD sin permitir que un texto cierre la etiqueta script.
 * JSON.parse interpreta las secuencias \uXXXX igual que los caracteres
 * originales, pero el navegador ya no puede tomarlas como HTML.
 */
export function serializeJsonLd(value: unknown): string {
  return (JSON.stringify(value) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

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
    telephone: siteConfig.phoneIntl,
    // Sólo publicamos los datos que el gimnasio confirmó.
    ...(siteConfig.contactEmail ? { email: siteConfig.contactEmail } : {}),
    hasMap: mapsLink(),
    priceRange: "$",
    currenciesAccepted: siteConfig.currency.code,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.address.street,
      addressLocality: siteConfig.address.city,
      addressRegion: siteConfig.address.region,
      ...(siteConfig.address.postalCode
        ? { postalCode: siteConfig.address.postalCode }
        : {}),
      addressCountry: "NI",
    },
    ...(siteConfig.geo
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: siteConfig.geo.lat,
            longitude: siteConfig.geo.lng,
          },
        }
      : {}),
    sameAs: [
      siteConfig.social.facebook,
      siteConfig.social.instagram,
      siteConfig.social.youtube,
      siteConfig.social.tiktok,
    ].filter((url): url is string => Boolean(url)),
    // Un bloque por cada día con atención. El domingo no aparece:
    // en schema.org, un día ausente significa cerrado.
    openingHoursSpecification: siteConfig.openingHours.flatMap((slots, dayIndex) =>
      slots.map((slot) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: SCHEMA_DAYS[dayIndex],
        opens: slot.opens,
        closes: slot.closes,
      })),
    ),
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
            streetAddress: fullAddress(),
            addressLocality: siteConfig.address.city,
            addressCountry: "NI",
          },
        },
        url: `${siteUrl}/${locale}/horarios`,
      },
    })),
  };
}
