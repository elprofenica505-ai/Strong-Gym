import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CashPanel } from "@/components/admin/cash-panel";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import {
  getAccounts,
  getCashSummary,
  getCurrentUser,
  getDailyCash,
  getMonthlyPnl,
  getPaymentMethods,
  getPaymentMethodsBreakdown,
  getRecentTransactions,
} from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: "Caja y cuentas",
    robots: { index: false, follow: false },
  };
}

export default async function CajaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) redirect("/es");
  const isDemo = !isSupabaseConfigured;
  const user = await getCurrentUser();

  // Sólo staff/admin.
  if (!isDemo && (!user || (user.role !== "admin" && user.role !== "staff"))) {
    redirect(`/${locale}/mi-cuenta`);
  }

  const [
    summary,
    recent,
    daily,
    monthly,
    methods,
    paymentMethods,
    accounts,
  ] = await Promise.all([
    getCashSummary(),
    getRecentTransactions(30),
    getDailyCash(14),
    getMonthlyPnl(6),
    getPaymentMethodsBreakdown(),
    getPaymentMethods(),
    getAccounts(),
  ]);

  const paymentMethodNames = Object.fromEntries(
    paymentMethods.map((m) => [m.id, m.nameEs]),
  );
  const paymentMethodIcons = Object.fromEntries(
    paymentMethods.map((m) => [m.id, m.icon]),
  );
  const accountsForPanel = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    kind: a.kind,
  }));

  return (
    <CashPanel
      summary={summary}
      recent={recent}
      daily={daily}
      monthly={monthly}
      methods={methods}
      paymentMethodNames={paymentMethodNames}
      paymentMethodIcons={paymentMethodIcons}
      accounts={accounts}
      isDemo={isDemo}
    />
  );
}
