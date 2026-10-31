import { isFinanceRole } from "@/lib/auth/current-user";
import { FinanceUnavailable } from "@/components/admin/finance-unavailable";
import { readFinance } from "@/lib/finance/read-result";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CashPanel } from "@/components/admin/cash-panel";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import {
  getAccounts,
  getCashierPermissions,
  getCashSummary,
  getCurrentUser,
  getDailyCash,
  getMonthlyPnl,
  getPaymentMethods,
  getPaymentMethodsBreakdown,
  getRecentTransactions,
  getRecentVoids,
} from "@/lib/data/queries";
import { DEMO_MODE } from "@/lib/supabase/env";

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
  const isDemo = DEMO_MODE;
  const user = await getCurrentUser();

  // Sólo staff/admin.
  if (!isDemo && (!user || !isFinanceRole(user.role))) {
    redirect(`/${locale}/mi-cuenta`);
  }

  const permissionResult = await readFinance(() => getCashierPermissions());
  if (!permissionResult.ok)
    return (
      <FinanceUnavailable
        locale={locale}
        code={permissionResult.code}
        message={permissionResult.message}
      />
    );
  const permissions = permissionResult.data;

  const result = await readFinance(() =>
    Promise.all([
      getCashSummary(),
      getRecentTransactions(30),
      permissions.charts ? getDailyCash(14) : Promise.resolve([]),
      permissions.monthlyResult ? getMonthlyPnl(6) : Promise.resolve([]),
      permissions.charts ? getPaymentMethodsBreakdown() : Promise.resolve([]),
      getPaymentMethods(),
      getAccounts(),
      // Marcar lo ya anulado: sin esto, después de anular el movimiento se
      // veía igual y parecía que no había pasado nada.
      getRecentVoids(),
    ]),
  );
  if (!result.ok)
    return (
      <FinanceUnavailable
        locale={locale}
        code={result.code}
        message={result.message}
      />
    );
  const [
    summary,
    recent,
    daily,
    monthly,
    methods,
    paymentMethods,
    accounts,
    voids,
  ] = result.data;
  const visibleRecent = permissions.expenses
    ? recent
    : recent.filter((transaction) => transaction.direction !== "expense");
  const visibleAccounts = permissions.accountBalances
    ? accounts
    : accounts.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency,
        kind: account.kind,
      }));

  const paymentMethodNames = Object.fromEntries(
    paymentMethods.map((m) => [m.id, m.nameEs]),
  );
  const paymentMethodIcons = Object.fromEntries(
    paymentMethods.map((m) => [m.id, m.icon]),
  );

  return (
    <CashPanel
      summary={summary}
      recent={visibleRecent}
      daily={daily}
      monthly={monthly}
      methods={methods}
      paymentMethodNames={paymentMethodNames}
      paymentMethodIcons={paymentMethodIcons}
      accounts={visibleAccounts}
      isDemo={isDemo}
      permissions={permissions}
      voids={voids}
    />
  );
}
