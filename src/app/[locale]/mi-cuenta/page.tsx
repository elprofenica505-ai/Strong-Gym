import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account/account-dashboard";
import { SectionHeading } from "@/components/ui/section";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import { getCurrentUser, getMyBookings, getPlans } from "@/lib/data/queries";

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
  const [bookings, plans] = await Promise.all([
    user ? getMyBookings(user.id) : Promise.resolve([]),
    getPlans(),
  ]);

  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-coal pt-12 pb-10 sm:pt-16 sm:pb-12 lg:pt-20">
        <div className="absolute inset-0 bg-grid opacity-50" aria-hidden="true" />
        <div className="container-x relative">
          <SectionHeading
            eyebrow={dict.nav.account}
            title={dict.account.title}
            subtitle={dict.account.subtitle}
          />
        </div>
      </section>

      <section className="py-10 sm:py-12 lg:py-14">
        <div className="container-x">
          <AccountDashboard initialBookings={bookings} plans={plans} />
        </div>
      </section>
    </>
  );
}
