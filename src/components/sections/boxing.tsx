import { Clock, Users } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { whatsappLink } from "@/config/site";
import { Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ButtonLink } from "@/components/ui/button";
import { GymPhoto } from "@/components/ui/gym-photo";

/**
 * Boxeo: la clase dirigida del gimnasio. Martes, miércoles y jueves,
 * tres horarios al día, $20 al mes y para todas las edades.
 * Las fotos son del área de boxeo real (boxeo.jpg y sacos.jpg).
 */
export function Boxing({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  const message =
    locale === "es"
      ? "Hola, quiero información de las clases de boxeo."
      : "Hi, I would like information about the boxing classes.";

  return (
    <Section id="boxeo" className="bg-night text-white">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
        {/* Texto */}
        <div className="lg:col-span-6">
          <Reveal>
            <span className="eyebrow">
              <span className="h-px w-6 bg-brand" aria-hidden="true" />
              {dict.boxing.eyebrow}
            </span>

            <h2 className="display-xl mt-4 max-w-xl text-[2rem] leading-[0.92] text-white sm:text-[2.75rem] lg:text-[3.25rem]">
              {dict.boxing.title}
            </h2>

            <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-white/70 sm:text-base">
              {dict.boxing.subtitle}
            </p>
          </Reveal>

          {/* Días y precio */}
          <Reveal delay={100}>
            <dl className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5">
                <dt className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-white/50 uppercase">
                  <Users className="size-3.5 text-brand" aria-hidden="true" />
                  {dict.boxing.daysLabel}
                </dt>
                <dd className="mt-2 text-[0.9375rem] font-medium text-white">
                  {dict.boxing.days}
                </dd>
              </div>

              <div className="rounded-2xl border border-brand/40 bg-brand/12 p-5">
                <dt className="text-[0.6875rem] font-semibold tracking-[0.14em] text-white/60 uppercase">
                  {dict.boxing.priceLabel}
                </dt>
                <dd className="display-xl mt-1 text-[2rem] leading-none text-brand">
                  {dict.boxing.price}
                </dd>
              </div>
            </dl>
          </Reveal>

          {/* Los tres horarios */}
          <Reveal delay={160}>
            <p className="mt-8 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-white/50 uppercase">
              <Clock className="size-3.5 text-brand" aria-hidden="true" />
              {dict.boxing.sessionsLabel}
            </p>

            <ul className="mt-3 grid gap-2.5 sm:grid-cols-3">
              {dict.boxing.sessions.map((session) => (
                <li
                  key={session.name}
                  className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 transition-colors hover:border-brand/50"
                >
                  <span className="block text-[0.6875rem] tracking-[0.12em] text-white/45 uppercase">
                    {session.name}
                  </span>
                  <span className="mt-1 block font-mono text-[0.9375rem] font-semibold text-white tabular-nums">
                    {session.time}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={220}>
            <p className="mt-6 text-[0.8125rem] text-white/55">{dict.boxing.note}</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={`/${locale}/horarios`} size="lg">
                {dict.boxing.cta}
              </ButtonLink>
              <ButtonLink
                href={whatsappLink(message)}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline-dark"
                size="lg"
              >
                {dict.cta.whatsapp}
              </ButtonLink>
            </div>
          </Reveal>
        </div>

        {/* Fotos del área de boxeo */}
        <Reveal delay={120} className="lg:col-span-6">
          <div className="grid grid-cols-5 gap-3">
            <figure className="relative col-span-3 aspect-[3/4] overflow-hidden rounded-2xl border border-white/12 bg-night-2">
              <GymPhoto
                src="/images/boxeo.jpg"
                alt={dict.boxing.title}
                sizes="(max-width: 1024px) 60vw, 30vw"
                className="object-cover"
              />
            </figure>

            <figure className="relative col-span-2 mt-10 aspect-[3/4] overflow-hidden rounded-2xl border border-white/12 bg-night-2">
              <GymPhoto
                src="/images/sacos.jpg"
                alt={locale === "es" ? "Sacos de boxeo" : "Heavy bags"}
                sizes="(max-width: 1024px) 40vw, 20vw"
                className="object-cover"
              />
            </figure>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
