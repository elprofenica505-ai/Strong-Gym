import "@fontsource-variable/inter";
import "@fontsource/anton";
import "../globals.css";

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { DemoBanner } from "@/components/layout/demo-banner";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { AppProvider } from "@/components/providers/app-provider";
import { DictionaryProvider } from "@/components/providers/dictionary-provider";
import { Toaster } from "@/components/ui/toaster";
import { getSiteUrl, siteConfig } from "@/config/site";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const dict = getDictionary(locale);
  const siteUrl = getSiteUrl();

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: dict.meta.title,
      template: `%s | ${siteConfig.name}`,
    },
    description: dict.meta.description,
    keywords: dict.meta.keywords,
    applicationName: siteConfig.name,
    alternates: {
      canonical: `${siteUrl}/${locale}`,
      languages: {
        es: `${siteUrl}/es`,
        en: `${siteUrl}/en`,
        "x-default": `${siteUrl}/es`,
      },
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: dict.meta.title,
      description: dict.meta.description,
      url: `${siteUrl}/${locale}`,
      locale: locale === "es" ? "es_NI" : "en_US",
      images: [
        {
          url: "/opengraph-image.jpg",
          width: 1200,
          height: 630,
          alt: dict.meta.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: dict.meta.title,
      description: dict.meta.description,
      images: ["/opengraph-image.jpg"],
    },
    robots: { index: true, follow: true },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icon.svg" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#06070a",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

/**
 * El sitio se renderiza por request (no estático) porque el header y las
 * páginas privadas dependen de la sesión del usuario. En Vercel esto sigue
 * siendo rápido: Next cachea el resultado de las consultas públicas.
 */
export const dynamic = "force-dynamic";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = getDictionary(locale as Locale);
  const user = await getCurrentUser();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh bg-void text-chalk antialiased">
        <DictionaryProvider dict={dict} locale={locale as Locale}>
          <AppProvider initialUser={user} isDemo={!isSupabaseConfigured}>
            <a
              href="#contenido"
              className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-volt focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
            >
              {locale === "es" ? "Saltar al contenido" : "Skip to content"}
            </a>

            {!isSupabaseConfigured ? <DemoBanner /> : null}

            <SiteHeader />

            <main id="contenido" className="relative">
              {children}
            </main>

            <SiteFooter locale={locale as Locale} />
            <Toaster />
          </AppProvider>
        </DictionaryProvider>
      </body>
    </html>
  );
}
