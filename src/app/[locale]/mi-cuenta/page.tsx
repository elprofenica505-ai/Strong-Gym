import { readData } from "@/lib/data/read-result";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import { ClientPass } from "@/components/crm/client-pass";
import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account/account-dashboard";
import { SectionHeading } from "@/components/ui/section";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import { getCurrentUser, getMyBookings, getPlans, getMyAssignedPlan } from "@/lib/data/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);

  return {
    title: dict.account.title,
    description: dict.account.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const dict = getDictionary(locale);

  const user = await getCurrentUser();
  const result = await readData(() =>
    Promise.all([
      user ? getMyBookings(user.id) : Promise.resolve([]),
      getPlans(),
    ]),
  );
  if (!result.ok)
    return (
      <section className="container-x py-12">
        <DataUnavailable locale={locale} code={result.code} />
      </section>
    );
  const [bookings, plans] = result.data;
  // Lectura separada: un fallo de plan no convierte el dato en «sin plan»
  // ni impide consultar reservas. El RPC sólo consulta la identidad de la sesión.
  const assignedPlan = user ? await readData(getMyAssignedPlan) : null;

  return (
    <>
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-12 pb-10 sm:pt-16 sm:pb-12 lg:pt-20">
        <div
          className="absolute inset-0 bg-grid opacity-50"
          aria-hidden="true"
        />
        <div className="container-x relative">
          <SectionHeading
            eyebrow={dict.nav.account}
            title={dict.account.title}
            subtitle={dict.account.subtitle}
          />
        </div>
      </section>

      <ClientPass />
      <section className="py-10 sm:py-12 lg:py-14">
        <div className="container-x">
          <AccountDashboard initialBookings={bookings} plans={plans}
            accountPlan={user && assignedPlan ? { userId: user.id, ...assignedPlan } : null} />
        </div>
      </section>
    </>
  );
}
