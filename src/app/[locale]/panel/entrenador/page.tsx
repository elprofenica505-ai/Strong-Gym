import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrainerClientsPanel } from "@/components/admin/trainer-clients-panel";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import { SectionHeading } from "@/components/ui/section";
import { readData } from "@/lib/data/read-result";
import { getCurrentUser, getTrainerRequestEnabled, getTrainerRoster } from "@/lib/data/queries";
import { isLocale, type Locale } from "@/i18n/config";
import { DEMO_MODE } from "@/lib/supabase/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: "Mis clientes", robots: { index: false, follow: false } };
}

export default async function EntrenadorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const user = await getCurrentUser();

  if (!DEMO_MODE && (user?.role !== "trainer" || user?.mfa !== "ok")) {
    redirect(`/${locale}/panel`);
  }

  const roster = DEMO_MODE ? null : await readData(() => getTrainerRoster());
  const enabled = DEMO_MODE ? null : await readData(() => getTrainerRequestEnabled());

  return (
    <>
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-10 pb-8 sm:pt-12 sm:pb-10">
        <div className="container-x relative">
          <SectionHeading
            eyebrow="Módulo · Entrenador"
            title="Mis clientes"
            subtitle="Tus clientes asignados y su asistencia. Para entrenar a otro cliente, pedí acceso: el administrador lo aprueba."
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x">
          {DEMO_MODE ? (
            <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist">
              Modo demo: los clientes asignados requieren Supabase conectado.
            </p>
          ) : roster && !roster.ok ? (
            <DataUnavailable locale={locale} code={roster.code} />
          ) : roster && roster.ok && enabled && enabled.ok ? (
            <TrainerClientsPanel initialRoster={roster.data} searchEnabled={enabled.data} />
          ) : (
            <DataUnavailable locale={locale} code="TRAINER_ROSTER" />
          )}
        </div>
      </section>
    </>
  );
}
