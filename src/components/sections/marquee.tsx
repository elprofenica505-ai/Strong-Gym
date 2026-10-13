
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

/**
 * Cinta infinita con las disciplinas. Decorativa: se oculta a lectores
 * de pantalla porque el listado real está en la sección de clases.
 */
export function Marquee({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const items = dict.marquee;

  const row = (
    <div className="flex shrink-0 items-center">
      {items.map((item) => (
        <span key={item} className="flex items-center">
          <span className="display-xl px-6 text-[1.25rem] text-white sm:px-8 sm:text-[1.75rem]">
            {item}
          </span>
          <span className="size-1.5 shrink-0 rotate-45 bg-brand" aria-hidden="true" />
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="relative overflow-hidden bg-night py-5"
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-night to-transparent sm:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-night to-transparent sm:w-28" />

      <div className="flex w-max animate-marquee">
        {row}
        {row}
      </div>
    </div>
  );
}
