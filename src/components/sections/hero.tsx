"use client";

import Image from "next/image";
import { CalendarCheck, ChevronDown, Play } from "lucide-react";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";

/**
 * Hero de la home. Usa la foto del salón de musculación con un
 * degradado encima para que el texto quede siempre legible.
 */
export function Hero() {
  const { dict, locale } = useDictionary();

  return (
    <section className="relative isolate overflow-hidden">
      {/* Fondo */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-void/92 via-void/78 to-void" />
        <div className="absolute inset-0 bg-gradient-to-r from-void via-void/70 to-transparent" />
        <div className="absolute inset-0 bg-grid opacity-40" />
      </div>

      <div className="container-x">
        <div className="flex min-h-[calc(100svh-4rem)] flex-col justify-center py-14 sm:py-20 lg:min-h-[44rem] lg:py-24">
          <div className="max-w-3xl">
            {/* Chip de prueba gratis */}
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-volt/35 bg-volt/10 py-1.5 pr-4 pl-1.5 text-[0.75rem] font-semibold text-volt sm:text-[0.8125rem]">
                <span className="grid size-6 place-items-center rounded-full bg-volt text-ink">
                  <Play className="size-3 fill-current" aria-hidden="true" />
                </span>
                {dict.hero.badge}
              </span>
            </Reveal>

            {/* Título */}
            <Reveal delay={80}>
              <h1 className="display-xl mt-6 text-[3.25rem] leading-[0.86] sm:text-[4.5rem] lg:text-[6.5rem] xl:text-[7.5rem]">
                <span className="block text-chalk">{dict.hero.titleTop}</span>
                <span className="block text-gradient-volt">{dict.hero.titleAccent}</span>
                <span className="block text-chalk/35">{dict.hero.titleBottom}</span>
              </h1>
            </Reveal>

            {/* Bajada */}
            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-[0.9375rem] leading-relaxed text-mist sm:mt-8 sm:text-base">
                {dict.hero.subtitle}
              </p>
            </Reveal>

            {/* Botones */}
            <Reveal delay={240}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <ButtonLink href={`/${locale}/horarios`} size="lg" className="w-full sm:w-auto">
                  <CalendarCheck className="size-4.5" aria-hidden="true" />
                  {dict.hero.primary}
                </ButtonLink>

                <ButtonLink
                  href={`/${locale}#clases`}
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {dict.hero.secondary}
                </ButtonLink>
              </div>
            </Reveal>

            {/* Estadísticas */}
            <Reveal delay={320}>
              <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-7 border-t border-line/70 pt-8 sm:grid-cols-4 sm:gap-x-4">
                {dict.hero.stats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="display-xl block text-[1.75rem] text-volt sm:text-[2rem]">
                        {stat.value}
                      </span>
                      <span className="mt-1 block text-[0.75rem] leading-snug text-fog">
                        {stat.label}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Indicador de scroll */}
      <div className="hidden justify-center pb-6 lg:flex">
        <a
          href="#clases"
          className="flex flex-col items-center gap-2 text-[0.6875rem] tracking-[0.2em] text-fog uppercase transition-colors hover:text-volt"
        >
          {dict.hero.scroll}
          <ChevronDown className="size-4 animate-bounce" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
