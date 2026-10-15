"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type Mode = "login" | "register";

export function AuthForm({ mode, redirectTo }: { mode: Mode; redirectTo?: string }) {
  const { dict, locale } = useDictionary();
  const { signIn, signUp, authLoading, isDemo } = useApp();
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const isLogin = mode === "login";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authLoading) return;

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const fullName = String(data.get("fullName") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const confirm = String(data.get("confirmPassword") ?? "");

    const errors: Record<string, string> = {};
    if (!isLogin) {
      if (fullName.length < 2) errors.fullName = dict.auth.requiredField;
      if (password.length < 6) errors.password = dict.auth.passwordMin;
      if (password !== confirm) errors.confirmPassword = dict.auth.passwordMismatch;
    } else if (password.length < 1) {
      errors.password = dict.auth.requiredField;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errors.email = dict.contact.invalidEmail;
    }

    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    const result = isLogin
      ? await signIn(email, password)
      : await signUp({ fullName, email, password, phone });

    if (!result.ok) {
      setError((dict.auth as Record<string, string>)[result.error ?? "genericError"]);
      return;
    }

    if ("needsConfirmation" in result && result.needsConfirmation) {
      setConfirmationEmail(email);
      return;
    }

    // Login/registro exitoso: al panel del socio o a la página pedida.
    const target = redirectTo || `/${locale}/mi-cuenta`;
    router.replace(target);
    router.refresh();
  }

  /* ---------- Pantalla de "revisá tu correo" ---------- */
  if (confirmationEmail) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-brand/35 bg-brand/[0.06] p-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-brand text-onbrand">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>

        <h2 className="display-xl text-[1.5rem] leading-none">{dict.auth.confirmEmailTitle}</h2>

        <p className="max-w-sm text-[0.875rem] leading-relaxed text-mist">
          {dict.auth.confirmEmailText.replace("{email}", confirmationEmail)}
        </p>

        <Link
          href={`/${locale}/ingresar`}
          className="text-[0.8125rem] font-semibold text-brand-300 transition-opacity hover:opacity-80"
        >
          {dict.auth.goLogin}
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-6 sm:p-7"
    >
      {error ? (
        <div
          className="flex items-start gap-2.5 rounded-xl border border-alert/40 bg-alert/10 px-4 py-3"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alert" aria-hidden="true" />
          <p className="text-[0.8125rem] leading-snug text-alert">{error}</p>
        </div>
      ) : null}

      {!isLogin ? (
        <Input
          name="fullName"
          label={dict.auth.name}
          placeholder={dict.contact.namePlaceholder}
          autoComplete="name"
          required
          error={fieldErrors.fullName}
        />
      ) : null}

      <Input
        name="email"
        type="email"
        label={dict.auth.email}
        placeholder={dict.contact.emailPlaceholder}
        autoComplete="email"
        required
        error={fieldErrors.email}
      />

      {!isLogin ? (
        <Input
          name="phone"
          type="tel"
          label={dict.contact.phone}
          placeholder={dict.contact.phonePlaceholder}
          autoComplete="tel"
        />
      ) : null}

      <div className="relative">
        <Input
          name="password"
          type={showPassword ? "text" : "password"}
          label={dict.auth.password}
          hint={isLogin ? undefined : dict.auth.passwordHint}
          autoComplete={isLogin ? "current-password" : "new-password"}
          required
          error={fieldErrors.password}
        />

        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute top-9.5 right-3.5 text-fog transition-colors hover:text-ink"
        >
          {showPassword ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {!isLogin ? (
        <Input
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          label={dict.auth.confirmPassword}
          autoComplete="new-password"
          required
          error={fieldErrors.confirmPassword}
        />
      ) : null}

      <Button type="submit" size="lg" disabled={authLoading} className="mt-2 w-full">
        {authLoading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowRight className="size-4" aria-hidden="true" />
        )}
        {authLoading ? dict.auth.loading : isLogin ? dict.auth.login : dict.auth.register}
      </Button>

      <p className="text-center text-[0.8125rem] text-fog">
        {isLogin ? dict.auth.noAccount : dict.auth.hasAccount}{" "}
        <Link
          href={`/${locale}/${isLogin ? "registro" : "ingresar"}`}
          className="font-semibold text-brand-300 transition-opacity hover:opacity-80"
        >
          {isLogin ? dict.auth.goRegister : dict.auth.goLogin}
        </Link>
      </p>

      {isDemo ? (
        <div className="rounded-xl border border-line bg-paper/50 px-4 py-3">
          <p className="text-[0.75rem] leading-relaxed text-fog">{dict.auth.demoNotice}</p>

          {isLogin ? (
            <p className="mt-2 font-mono text-[0.6875rem] leading-relaxed text-brand-300">
              admin@stronggym.com · admin123
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
