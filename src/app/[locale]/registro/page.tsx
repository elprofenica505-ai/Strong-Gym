import { safeAuthRedirect } from "@/lib/auth/redirects";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/data/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return {
    title: dict.auth.registerTitle,
    description: dict.auth.registerSubtitle,
    robots: { index: false, follow: true },
  };
}

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const [{ locale: rawLocale }, { redirect: redirectTo }] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const dict = getDictionary(locale);

  const user = await getCurrentUser();
  if (user) redirect(`/${locale}/mi-cuenta`);

  const safeRedirect = safeAuthRedirect(redirectTo, locale);

  return (
    <AuthShell
      eyebrow={dict.nav.register}
      title={dict.auth.registerTitle}
      subtitle={dict.auth.registerSubtitle}
      bullets={dict.footer.services.map((service) => service)}
    >
      <AuthForm mode="register" redirectTo={safeRedirect} />
    </AuthShell>
  );
}
