import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryForm } from "@/components/auth/recovery-form";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
import { DEMO_MODE } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function NewPasswordPage({ params }: { params: Promise<{locale: string}> }) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  let user: {id: string; email?: string} | null = null;
  if (!DEMO_MODE) {
    try {
      const client = await getSupabaseServerClient();
      const result = await client?.auth.getUser();
      if (result && !result.error) user = result.data.user;
    } catch { /* Nunca conceder identidad por querystring o por getSession local. */ }
  }
  return <AuthShell eyebrow={dict.nav.login} title={dict.recovery.updateTitle} subtitle={dict.recovery.updateSubtitle} bullets={[]}>
    <RecoveryForm mode="update" expectedUserId={user?.id} email={user?.email} />
  </AuthShell>;
}
