"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/app-provider";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { requestRecovery, changeRecoveredPassword, validNewPassword, NEW_PASSWORD_MAX } from "@/lib/auth/password-recovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function RecoveryForm({ mode, expectedUserId, email, invalidLink = false }: {
  mode: "request" | "update"; expectedUserId?: string; email?: string; invalidLink?: boolean;
}) {
  const { locale, dict } = useDictionary();
  const copy = dict.recovery;
  const { isDemo } = useApp();
  const router = useRouter();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || done || isDemo || (mode === "update" && !expectedUserId)) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (mode === "update" && (!validNewPassword(password) || password !== String(data.get("confirmPassword") ?? ""))) {
      setError(copy.passwordRule); return;
    }
    locked.current = true; setBusy(true); setError(null);
    try {
      const client = getSupabaseBrowserClient();
      if (!client) { setError(copy.failed); return; }
      if (mode === "request") {
        const result = await requestRecovery(client, String(data.get("email") ?? ""), window.location.origin, locale);
        if (result !== "sent") {
          setError(result === "invalid" ? dict.contact.invalidEmail
            : result === "rateLimited" ? dict.auth.rateLimited
            : result === "deliveryUnavailable" ? dict.auth.deliveryUnavailable : copy.failed);
          return;
        }
        setDone(true); form.reset();
      } else {
        const result = await changeRecoveredPassword(client, expectedUserId!, password);
        if (result !== "changed" && result !== "changed_logout_failed") {
          setError(result === "mfa" ? copy.mfaRequired : result === "auth" ? copy.invalidLink : copy.unconfirmed); return;
        }
        // Contraseña confirmada aunque falle el cierre: no invitar a repetir la mutación.
        setDone(true); setWarning(result === "changed_logout_failed"); form.reset(); router.refresh();
      }
    } catch { setError(mode === "update" ? copy.unconfirmed : copy.failed); }
    finally { locked.current = false; setBusy(false); }
  }

  if (isDemo) return <p role="status">{dict.auth.demoNotice}</p>;
  if (done) return (
    <div className="rounded-xl border border-brand/40 bg-card p-6" role="status">
      <p>{mode === "request" ? copy.sent : copy.changed}</p>
      {warning ? <p className="mt-3" role="alert">{copy.logoutFailed}</p> : null}
      <Link className="mt-4 inline-block text-brand-300 underline" href={`/${locale}/ingresar`}>{dict.auth.goLogin}</Link>
    </div>
  );
  if (mode === "update" && !expectedUserId) return (
    <div role="alert"><p>{copy.invalidLink}</p><Link className="text-brand-300 underline" href={`/${locale}/recuperar`}>{copy.requestNew}</Link></div>
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-6">
      {invalidLink ? <p role="alert">{copy.invalidLink}</p> : null}
      {error ? <p role="alert" className="text-alert">{error}</p> : null}
      {mode === "request" ? (
        <Input name="email" type="email" label={dict.auth.email} autoComplete="email" required maxLength={254} disabled={busy} />
      ) : (<>
        <p className="break-words text-sm text-fog">{copy.account}: {email}</p>
        <Input name="password" type="password" label={copy.newPassword} hint={copy.passwordRule} autoComplete="new-password" required maxLength={NEW_PASSWORD_MAX} disabled={busy} />
        <Input name="confirmPassword" type="password" label={dict.auth.confirmPassword} autoComplete="new-password" required maxLength={NEW_PASSWORD_MAX} disabled={busy} />
        <p className="text-sm text-fog">{copy.sessionNotice}</p>
      </>)}
      <Button type="submit" loading={busy}>{busy ? dict.auth.loading : mode === "request" ? copy.send : copy.save}</Button>
      <Link className="text-sm text-brand-300" href={`/${locale}/ingresar`}>{dict.auth.goLogin}</Link>
    </form>
  );
}
