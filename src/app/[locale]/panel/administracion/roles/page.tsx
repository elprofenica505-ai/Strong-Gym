import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdminRole } from "@/lib/auth/current-user";
import { RolesManager } from "@/components/admin/roles-manager";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import { readData } from "@/lib/data/read-result";
import { getCurrentUser, getProfilesForRoles } from "@/lib/data/queries";
import { isLocale, type Locale } from "@/i18n/config";
import { SectionHeading } from "@/components/ui/section";
import { DEMO_MODE } from "@/lib/supabase/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: "Personal y roles", robots: { index: false, follow: false } };
}

export default async function RolesPage({
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

  const result = DEMO_MODE ? null : await readData(() => getProfilesForRoles());

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
            eyebrow="Administración · Personal"
            title="Personal y roles"
            subtitle="Asigná caja, entrenador o administrador. Cada cambio queda registrado."
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x">
          {DEMO_MODE ? (
            <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist">
              Modo demo: la asignación de roles requiere Supabase conectado.
            </p>
          ) : result && !result.ok ? (
            <DataUnavailable locale={locale} code={result.code} />
          ) : result && result.ok ? (
            <RolesManager profiles={result.data} currentUserId={user?.id ?? ""} />
          ) : null}
        </div>
      </section>
    </>
  );
}
