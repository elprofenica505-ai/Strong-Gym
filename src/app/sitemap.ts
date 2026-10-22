import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/config/site";
import { locales } from "@/i18n/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const pages: { path: string; priority: number; frequency: "daily" | "weekly" | "monthly" }[] = [
    { path: "", priority: 1, frequency: "weekly" },
    { path: "/horarios", priority: 0.9, frequency: "daily" },
    { path: "/ingresar", priority: 0.3, frequency: "monthly" },
    { path: "/registro", priority: 0.4, frequency: "monthly" },
    { path: "/privacidad", priority: 0.2, frequency: "monthly" },
    { path: "/terminos", priority: 0.2, frequency: "monthly" },
    { path: "/cookies", priority: 0.2, frequency: "monthly" },
    // /offline solo lo cachea el service worker; no lo indexamos.
    { path: "/offline", priority: 0, frequency: "monthly" },
  ];

  return pages.flatMap((page) =>
    locales.map((locale) => ({
      url: `${siteUrl}/${locale}${page.path}`,
      lastModified: now,
      changeFrequency: page.frequency,
      priority: page.priority,
      alternates: {
        languages: Object.fromEntries(
          locales.map((other) => [other, `${siteUrl}/${other}${page.path}`]),
        ),
      },
    })),
  );
}
