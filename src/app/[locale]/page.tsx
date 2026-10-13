import type { Metadata } from "next";
import { ClassesGrid } from "@/components/sections/classes-grid";
import { Coaches } from "@/components/sections/coaches";
import { Contact } from "@/components/sections/contact";
import { CtaBand } from "@/components/sections/cta-band";
import { Faq } from "@/components/sections/faq";
import { Features } from "@/components/sections/features";
import { Gallery } from "@/components/sections/gallery";
import { Hero } from "@/components/sections/hero";
import { Marquee } from "@/components/sections/marquee";
import { Plans } from "@/components/sections/plans";
import { Testimonials } from "@/components/sections/testimonials";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
import { homeJsonLd } from "@/lib/structured-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);

  return {
    title: { absolute: dict.meta.title },
    description: dict.meta.description,
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "es";
  const dict = getDictionary(safeLocale);

  return (
    <>
      <script
        type="application/ld+json"
        // Datos estructurados para Google (negocio local)
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd(safeLocale, dict)) }}
      />

      <Hero />
      <Marquee locale={safeLocale} />
      <Features locale={safeLocale} />
      <ClassesGrid locale={safeLocale} />
      <Plans locale={safeLocale} />
      <Coaches locale={safeLocale} />
      <Gallery locale={safeLocale} />
      <Testimonials locale={safeLocale} />
      <Faq locale={safeLocale} />
      <Contact locale={safeLocale} />
      <CtaBand locale={safeLocale} />
    </>
  );
}
