import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { ReloadButton } from "@/components/ui/reload-button";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return {
    title: dict.offline.title,
    description: dict.offline.text,
    robots: { index: false, follow: true },
  };
}

/**
 * Página que muestra el service worker cuando el usuario no tiene red
 * y la ruta pedida nunca se cacheó. Mantiene el estilo del sitio
 * (tarjetas oscuras, acento rojo) para que se vea parte de la marca
 * aunque no haya internet.
 */
export default async function OfflinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = getDictionary(locale as Locale);
  const home = `/${locale}`;

  return (
    <div className="container-x flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
      <p className="display-xl text-[5rem] leading-none text-brand sm:text-[7rem]">
        OFF
      </p>

      <h1 className="display-xl mt-4 text-[1.75rem] sm:text-[2.5rem]">
        {dict.offline.title}
      </h1>

      <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-fog">
        {dict.offline.text}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ReloadButton label={dict.offline.retry} />
        <ButtonLink href={home} variant="outline" size="lg">
          {dict.offline.home}
        </ButtonLink>
      </div>
    </div>
  );
}
