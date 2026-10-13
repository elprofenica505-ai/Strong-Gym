import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { demoGallery } from "@/lib/data/demo-content";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import { GymPhoto } from "@/components/ui/gym-photo";

/**
 * Galería de instalaciones. Las fotos son del local real y viven en
 * /public/images (ver demoGallery en demo-content.ts). Si cambiás
 * una, mantené el mismo nombre de archivo.
 */
const spans = [
  "sm:col-span-2 lg:col-span-2 lg:row-span-2",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-2",
  "sm:col-span-2 lg:col-span-2",
];

export function Gallery({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <Section id="galeria" className="border-b border-line">
      <SectionHeading
        eyebrow={dict.nav.gallery}
        title={dict.gallery.title}
        subtitle={dict.gallery.subtitle}
      />

      <div className="mt-10 grid auto-rows-[13rem] gap-3 sm:mt-14 sm:auto-rows-[14rem] sm:grid-cols-2 lg:auto-rows-[12rem] lg:grid-cols-6">
        {demoGallery.map((photo, index) => {
          const item = dict.gallery.items[photo.key];

          return (
            <Reveal
              key={photo.key}
              delay={index * 70}
              className={cn("relative", spans[index] ?? "lg:col-span-2")}
            >
              <figure className="group relative size-full overflow-hidden rounded-2xl border border-line bg-cloud">
                <GymPhoto
                  src={photo.src}
                  alt={item.label}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-night via-night/25 to-transparent" />

                <figcaption className="absolute inset-x-0 bottom-0 p-5">
                  <span className="block text-[0.9375rem] font-semibold text-white">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-white/65">{item.detail}</span>
                </figcaption>

                <span
                  className="absolute inset-0 rounded-2xl ring-1 ring-transparent transition-all duration-300 group-hover:ring-brand/60"
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
