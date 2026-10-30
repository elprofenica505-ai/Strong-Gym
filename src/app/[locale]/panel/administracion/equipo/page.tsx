import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdminRole } from "@/lib/auth/current-user";
import {
  CoachesCatalog,
  type CoachesCatalog as Catalog,
} from "@/components/admin/coaches-catalog";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import { getCurrentUser } from "@/lib/data/queries";
import { isLocale } from "@/i18n/config";
import { SectionHeading } from "@/components/ui/section";
import { DEMO_MODE, isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: "Equipo de entrenadores",
    robots: { index: false, follow: false },
  };
}

const emptyCatalog: Catalog = { coaches: [], classes: [], audit: [] };

export default async function EquipoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "es";
  const user = await getCurrentUser();

  if (!DEMO_MODE && (!isAdminRole(user?.role) || user?.mfa !== "ok")) {
    redirect(`/${locale}/panel`);
  }

  let catalog: Catalog = emptyCatalog;
  let failed = false;
  if (DEMO_MODE) {
    catalog = emptyCatalog;
  } else if (!isSupabaseConfigured) {
    failed = true;
  } else {
    const supabase = await getSupabaseServerClient();
    if (!supabase) failed = true;
    else {
      // Si la consulta falla o se corta, mostramos la tarjeta con código y no
      // una pantalla de error: abrir la página no escribe nada.
      try {
        const { data, error } = await supabase
          .rpc("admin_coaches_catalog")
          .abortSignal(AbortSignal.timeout(15000));
        if (error || !data) failed = true;
        else catalog = data as Catalog;
      } catch {
        failed = true;
      }
    }
  }

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
            eyebrow="Administración · Equipo"
            title="Equipo de entrenadores"
            subtitle="Quién entrena en el gimnasio y qué disciplinas dicta cada uno. Con eso el calendario puede asignar entrenador a las clases sin escribirlo a mano."
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x">
          {DEMO_MODE ? (
            <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist">
              Modo demo: administrar entrenadores requiere Supabase conectado.
            </p>
          ) : failed ? (
            <DataUnavailable locale={locale} code="COACHES_CATALOG_UNCONFIRMED" />
          ) : (
            <CoachesCatalog initial={catalog} />
          )}
        </div>
      </section>
    </>
  );
}
