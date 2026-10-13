import Image from "next/image";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/reveal";

/**
 * Layout de dos columnas para las páginas de login y registro:
 * el formulario a un lado y una foto con beneficios del gimnasio al otro.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  bullets,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  bullets: string[];
  children: ReactNode;
}) {
  return (
    <section className="relative pt-12 pb-16 sm:pt-16 lg:pt-20">
      <div className="absolute inset-0 bg-grid opacity-40" aria-hidden="true" />
      <div
        className="absolute -top-24 right-1/4 size-80 rounded-full bg-volt/8 blur-3xl"
        aria-hidden="true"
      />

      <div className="container-x relative">
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-14">
          {/* Formulario */}
          <Reveal className="mx-auto w-full max-w-md lg:mx-0">
            <span className="eyebrow">
              <span className="h-px w-6 bg-volt" aria-hidden="true" />
              {eyebrow}
            </span>

            <h1 className="display-xl mt-4 text-[2rem] leading-[0.94] sm:text-[2.5rem]">
              {title}
            </h1>

            <p className="mt-3 text-[0.9375rem] leading-relaxed text-fog">{subtitle}</p>

            <div className="mt-7">{children}</div>
          </Reveal>

          {/* Panel lateral (sólo en pantallas grandes) */}
          <Reveal
            delay={120}
            className="relative hidden overflow-hidden rounded-3xl border border-line lg:block"
          >
            <div className="relative aspect-4/5 w-full">
              <Image
                src="/images/studio.jpg"
                alt=""
                fill
                sizes="(max-width: 1024px) 0px, 45vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-void via-void/60 to-void/20" />
            </div>

            <div className="absolute inset-x-0 bottom-0 p-8">
              <ul className="flex flex-col gap-3">
                {bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-volt"
                      strokeWidth={2.75}
                      aria-hidden="true"
                    />
                    <span className="text-[0.875rem] leading-snug text-chalk">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
