import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionHeading } from "@/components/ui/section";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import { readData } from "@/lib/data/read-result";
import { getCurrentUser } from "@/lib/data/queries";
import { getMyProgressRoster } from "@/lib/data/progress-queries";
import { isLocale, type Locale } from "@/i18n/config";
import { DEMO_MODE } from "@/lib/supabase/env";
import { isStaffRole } from "@/lib/auth/current-user";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: "Progreso y medidas", robots: { index: false, follow: false } };
}

export default async function ProgresoIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const user = await getCurrentUser();
  if (!DEMO_MODE && (!user || !isStaffRole(user.role) || user.mfa !== "ok")) redirect(`/${locale}/panel`);

  const isTrainer = user?.role === "trainer";
  const roster = !DEMO_MODE && isTrainer ? await readData(() => getMyProgressRoster()) : null;

  return (
    <>
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-10 pb-8 sm:pt-12 sm:pb-10">
        <div className="container-x relative">
          <SectionHeading
            eyebrow="Módulo · Progreso"
            title="Progreso y medidas"
            subtitle="Medidas, meta y rutina de cada cliente. Sin copiar datos de una medición a otra."
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x grid gap-4">
          {DEMO_MODE ? (
            <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist">
              Modo demo: el progreso requiere Supabase conectado.
            </p>
          ) : isTrainer ? (
            roster && !roster.ok ? (
              <DataUnavailable locale={locale} code={roster.code} />
            ) : roster && roster.ok && roster.data.length === 0 ? (
              <p className="rounded-xl border border-line bg-card p-4 text-mist">
                Todavía no tenés clientes asignados. Cuando el administrador te asigne uno, aparecerá aquí.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {roster?.ok && roster.data.map((c) => (
                  <li key={c.clientId}>
                    <Link href={`/${locale}/panel/progreso/${c.clientId}`}
                      className="block rounded-2xl border border-line bg-card p-4 text-ink hover:border-brand/40">
                      {c.fullName}
                      <span className="mt-1 block text-xs text-fog">Ver medidas, meta y rutina</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="rounded-xl border border-line bg-card p-4 text-mist">
              Para ver el progreso de un cliente, busca su ficha en <Link className="text-brand-300 underline" href={`/${locale}/panel/clientes`}>Clientes</Link> y ábrela desde allí.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
