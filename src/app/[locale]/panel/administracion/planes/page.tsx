import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdminRole } from "@/lib/auth/current-user";
import { PlansCatalog, type AdminPlan } from "@/components/admin/plans-catalog";
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
  return { title: "Planes y modalidades", robots: { index: false, follow: false } };
}

type Catalog = {
  plans: AdminPlan[];
  classes: { id: string; slug: string; name_es: string; is_active: boolean }[];
};

export default async function PlanesPage({
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

  let catalog: Catalog = { plans: [], classes: [] };
  let failed = false;
  if (DEMO_MODE) {
    catalog = { plans: [], classes: [] };
  } else if (!isSupabaseConfigured) {
    failed = true;
  } else {
    const supabase = await getSupabaseServerClient();
    if (!supabase) failed = true;
    else {
      const { data, error } = await supabase
        .rpc("admin_plans_catalog")
        .abortSignal(AbortSignal.timeout(15000));
      if (error || !data) failed = true;
      else catalog = data as Catalog;
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
            eyebrow="Administración · Planes"
            title="Planes y modalidades"
            subtitle="Creá cualquier plan o modalidad con su acceso, duración, moneda e importe. Al guardarlo queda disponible para cobrar en la ficha del cliente, con vigencia real y sin cambios de código."
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x">
          {DEMO_MODE ? (
            <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist">
              Modo demo: crear planes requiere Supabase conectado.
            </p>
          ) : failed ? (
            <DataUnavailable locale={locale} code="PLANS_CATALOG_UNCONFIRMED" />
          ) : (
            <PlansCatalog initial={catalog} />
          )}
        </div>
      </section>
    </>
  );
}
