import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Las zonas privadas no se indexan
        disallow: [
          "/api/",
          "/es/mi-cuenta",
          "/en/mi-cuenta",
          "/es/panel",
          "/en/panel",
          "/es/offline",
          "/en/offline",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
