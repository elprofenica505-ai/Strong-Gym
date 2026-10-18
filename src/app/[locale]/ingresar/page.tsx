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
    title: dict.auth.loginTitle,
    description: dict.auth.loginSubtitle,
    robots: { index: false, follow: true },
  };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const [{ locale: rawLocale }, { redirect: redirectTo, error }] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const dict = getDictionary(locale);

  // Si ya hay sesión, no tiene sentido mostrar el login.
  const user = await getCurrentUser();
  if (user && error !== "link") redirect(`/${locale}/mi-cuenta`);

  const safeRedirect = safeAuthRedirect(redirectTo, locale);

  return (
    <AuthShell
      eyebrow={dict.nav.login}
      title={dict.auth.loginTitle}
      subtitle={dict.auth.loginSubtitle}
      bullets={dict.plans.included}
    >
      {error === "link" ? <p role="alert" className="mb-4 text-alert">{dict.recovery.callbackFailed}</p> : null}
      <AuthForm mode="login" redirectTo={safeRedirect} />
    </AuthShell>
  );
}
