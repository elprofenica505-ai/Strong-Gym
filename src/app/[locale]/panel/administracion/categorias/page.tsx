import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdminRole } from "@/lib/auth/current-user";
import { CategoryRules, type CategoryRule } from "@/components/admin/category-rules";
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
  return { title: "Categorías", robots: { index: false, follow: false } };
}

type Catalog = {
  rules: CategoryRule[];
  counts: Record<string, number>;
  pending: number;
  history: { changed_at: string; rules: unknown }[];
};

const emptyCatalog: Catalog = { rules: [], counts: {}, pending: 0, history: [] };

export default async function CategoriasPage({
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
      const { data, error } = await supabase
        .rpc("admin_category_rules")
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
            eyebrow="Administración · Categorías"
            title="Categoría automática de clientes"
            subtitle="El sistema clasifica a cada cliente con su vigencia real: si tiene el mes pagado, si está vencido o si solo viene seguido. Cambiá los números y el orden cuando quieras; el efecto es inmediato."
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x">
          {DEMO_MODE ? (
            <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist">
              Modo demo: cambiar las reglas requiere Supabase conectado.
            </p>
          ) : failed ? (
            <DataUnavailable locale={locale} code="CATEGORY_RULES_UNCONFIRMED" />
          ) : catalog.rules.length === 0 ? (
            <p
              role="alert"
              className="rounded-xl border border-red-400/40 bg-red-400/[0.06] px-4 py-3 text-[0.875rem] text-red-300"
            >
              No se pudieron leer las reglas de categoría. No se muestra una
              configuración inventada; recargá la página antes de cambiar nada.
            </p>
          ) : (
            <CategoryRules initial={catalog} />
          )}
        </div>
      </section>
    </>
  );
}
