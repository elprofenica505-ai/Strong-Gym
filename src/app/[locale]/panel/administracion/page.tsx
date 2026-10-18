import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/auth/current-user";
import { visibleModules } from "@/lib/admin/modules";
import { getCurrentUser } from "@/lib/data/queries";
import { getDictionary } from "@/i18n/dictionaries";
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
  return { title: "Administración", robots: { index: false, follow: false } };
}

export default async function AdministracionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const dict = getDictionary(locale);
  const user = await getCurrentUser();

  if (!DEMO_MODE && !isAdminRole(user?.role)) redirect(`/${locale}/panel`);

  const children = visibleModules("admin", DEMO_MODE).find((m) => m.id === "administracion")?.children ?? [];

  return (
    <>
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-10 pb-8 sm:pt-12 sm:pb-10">
        <div className="container-x relative">
          <SectionHeading
            eyebrow="Módulo · Administración"
            title="Personal, datos y guía"
            subtitle={dict.admin.subtitle}
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {children.map((c) => (
            <Link
              key={c.id}
              href={`/${locale}${c.href}`}
              className="rounded-2xl border border-line bg-card p-5 transition-colors hover:border-brand"
            >
              <p className="text-[1rem] font-semibold text-ink">{c.label} →</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
