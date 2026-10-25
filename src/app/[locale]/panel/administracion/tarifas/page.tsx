import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdminRole } from "@/lib/auth/current-user";
import {
  PlanTariffEditor,
  type GymTariffSlug,
} from "@/components/admin/plan-tariff-editor";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import { readData } from "@/lib/data/read-result";
import {
  getCurrentUser,
  getGymTariffsAdmin,
  type PlanTariffAdmin,
} from "@/lib/data/queries";
import { isLocale, type Locale } from "@/i18n/config";
import { SectionHeading } from "@/components/ui/section";
import { DEMO_MODE } from "@/lib/supabase/env";

const EXPECTED_TARIFFS = [
  { slug: "pase-del-dia", fallbackName: "Pase del día", placeholder: "40" },
  { slug: "gimnasio-semanal", fallbackName: "Gimnasio semanal", placeholder: "150" },
  {
    slug: "gimnasio-quincenal",
    fallbackName: "Gimnasio quincenal",
    placeholder: "280",
  },
  { slug: "gimnasio-mensual", fallbackName: "Gimnasio mensual", placeholder: "560" },
] as const satisfies readonly {
  slug: GymTariffSlug;
  fallbackName: string;
  placeholder: string;
}[];

const PERIOD_SUFFIX: Record<PlanTariffAdmin["period"], string> = {
  session: "por visita",
  week: "por semana",
  fortnight: "por quincena",
  month: "por mes",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: "Tarifas", robots: { index: false, follow: false } };
}

export default async function TarifasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const user = await getCurrentUser();

  if (!DEMO_MODE && (!isAdminRole(user?.role) || user?.mfa !== "ok")) {
    redirect(`/${locale}/panel`);
  }

  const result = DEMO_MODE ? null : await readData(() => getGymTariffsAdmin());
  const tariffsBySlug = new Map(
    result?.ok ? result.data.map((tariff) => [tariff.slug, tariff]) : [],
  );
  const missingTariffs = EXPECTED_TARIFFS.filter(
    (expected) => !tariffsBySlug.has(expected.slug),
  );

  return (
    <>
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-10 pb-8 sm:pt-12 sm:pb-10">
        <div className="container-x relative">
          <Link
            href={`/${locale}/panel/administracion`}
            className="mb-5 inline-grid size-10 place-items-center rounded-full border border-line text-mist hover:border-brand hover:text-ink"
            aria-label="Volver a Administración"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <SectionHeading
            eyebrow="Administración · Tarifas"
            title="Tarifas de pesas y máquinas"
            subtitle="Cambiá los precios en córdobas por día, semana, quincena y mes. Se usan en recepción y se muestran en la web; Boxeo queda aparte y cobrar una tarifa no activa vigencia automáticamente."
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x">
          {DEMO_MODE ? (
            <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist">
              Modo demo: cambiar las tarifas requiere Supabase conectado.
            </p>
          ) : result && !result.ok ? (
            <DataUnavailable locale={locale} code={result.code} />
          ) : result?.ok ? (
            <div className="space-y-5">
              {missingTariffs.length > 0 ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-400/40 bg-red-400/[0.06] px-4 py-3 text-[0.875rem] text-red-300"
                >
                  Faltan estas tarifas de pesas y máquinas:{" "}
                  {missingTariffs
                    .map((tariff) => `«${tariff.fallbackName}»`)
                    .join(", ")}
                  . No se creó ni se inventó ningún plan; revisá la
                  configuración antes de cobrarlas como tarifas rápidas.
                </p>
              ) : null}

              {result.data.length > 0 ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  {EXPECTED_TARIFFS.map((expected) => {
                    const tariff = tariffsBySlug.get(expected.slug);
                    if (!tariff) return null;
                    return (
                      <PlanTariffEditor
                        key={tariff.id}
                        slug={expected.slug}
                        nameEs={tariff.nameEs}
                        periodSuffix={PERIOD_SUFFIX[tariff.period]}
                        placeholder={expected.placeholder}
                        initialPriceNio={tariff.priceNio}
                        isActive={tariff.isActive}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
