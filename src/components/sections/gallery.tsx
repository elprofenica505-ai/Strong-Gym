import Image from "next/image";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

/** Las fotos viven en /public/images. Si cambiás una, mantené el mismo nombre. */
const photos = [
  { key: "studio", src: "/images/studio.jpg", span: "sm:col-span-2 lg:col-span-2 lg:row-span-2" },
  { key: "weights", src: "/images/weights.jpg", span: "lg:col-span-2" },
  { key: "functional", src: "/images/functional.jpg", span: "lg:col-span-2" },
  { key: "lockers", src: "/images/lockers.jpg", span: "sm:col-span-2 lg:col-span-4" },
];

export function Gallery({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <Section id="galeria" className="border-b border-line">
      <SectionHeading
        eyebrow={dict.nav.home}
        title={dict.gallery.title}
        subtitle={dict.gallery.subtitle}
      />

      <div className="mt-10 grid auto-rows-[13rem] gap-3 sm:mt-14 sm:grid-cols-2 sm:auto-rows-[14rem] lg:grid-cols-4 lg:auto-rows-[12rem]">
        {dict.gallery.items.map((item, index) => {
          const photo = photos[index] ?? photos[0];

          return (
            <Reveal
              key={item.label}
              delay={index * 70}
              className={cn("relative", photo.span)}
            >
              <figure className="group relative size-full overflow-hidden rounded-2xl border border-line bg-card">
                <Image
                  src={photo.src}
                  alt={item.label}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/25 to-transparent" />

                <figcaption className="absolute inset-x-0 bottom-0 p-5">
                  <span className="block text-[0.9375rem] font-semibold text-chalk">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-fog">{item.detail}</span>
                </figcaption>

                <span
                  className="absolute inset-0 rounded-2xl ring-1 ring-white/0 transition-all duration-300 group-hover:ring-volt/40"
                  aria-hidden="true"
                />
              </figure>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
