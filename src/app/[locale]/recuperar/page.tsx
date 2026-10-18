import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryForm } from "@/components/auth/recovery-form";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function RecoveryPage({ params, searchParams }: {
  params: Promise<{locale: string}>; searchParams: Promise<{error?: string}>;
}) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  const {error} = await searchParams;
  const dict = getDictionary(locale);
  return <AuthShell eyebrow={dict.nav.login} title={dict.recovery.title} subtitle={dict.recovery.subtitle} bullets={[]}>
    <RecoveryForm mode="request" invalidLink={error === "link"} />
  </AuthShell>;
}
