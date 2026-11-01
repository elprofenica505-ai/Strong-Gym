import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/auth/current-user";
import { MoneySettings } from "@/components/admin/money-settings";
import { FinanceUnavailable } from "@/components/admin/finance-unavailable";
import { BackLink } from "@/components/ui/back-link";
import { SectionHeading } from "@/components/ui/section";
import { getCurrentUser, getFinanceAccountsState } from "@/lib/data/queries";
import { readFinance } from "@/lib/finance/read-result";
import { isLocale, type Locale } from "@/i18n/config";
import { DEMO_MODE } from "@/lib/supabase/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: "Cuentas y transferencias", robots: { index: false, follow: false } };
}

/**
 * Cuentas, métodos, categorías y transferencias (FIN-03).
 *
 * Sólo administración con segundo factor: dar de alta una cuenta o mover plata
 * entre cuentas cambia los saldos del gimnasio. La base vuelve a comprobarlo
 * aunque alguien llegue por URL directa.
 */
export default async function DineroPage({
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

  const result = DEMO_MODE ? null : await readFinance(() => getFinanceAccountsState());

  return (
    <>
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-10 pb-8 sm:pt-12 sm:pb-10">
        <div className="container-x relative space-y-5">
          <BackLink href={`/${locale}/panel/administracion`} hint="Administración" />
          <SectionHeading
            eyebrow="Administración · Dinero"
            title="Cuentas y transferencias"
            subtitle="Dónde está la plata y cómo se mueve. Las cuentas, los métodos de pago y las categorías se administran acá; pasar plata de una cuenta a otra no es ingreso ni gasto, y el arqueo de caja lo tiene en cuenta."
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x">
          {DEMO_MODE ? (
            <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist">
              Modo demo: administrar cuentas y mover plata requiere Supabase conectado.
            </p>
          ) : result && !result.ok ? (
            <FinanceUnavailable locale={locale} code={result.code} message={result.message} />
          ) : result?.ok ? (
            <MoneySettings state={result.data} />
          ) : null}
        </div>
      </section>
    </>
  );
}
