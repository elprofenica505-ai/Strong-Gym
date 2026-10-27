"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isTotpCode, type MfaState } from "@/lib/auth/current-user";
import {
  readMfaState,
  startTotpEnrollment,
  verifiedTotpFactorId,
  verifyTotpCode,
  type TotpEnrollment,
} from "@/lib/auth/mfa-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type Phase =
  | { kind: "loading" }
  | { kind: "enroll"; enrollment: TotpEnrollment | null }
  | { kind: "verify"; factorId: string | null }
  | { kind: "unavailable" };

const copy = {
  es: {
    title: "Verificación en dos pasos",
    intro:
      "Las cuentas del personal necesitan un código de tu app de autenticación además de la contraseña. Sin este paso no se puede entrar al panel.",
    loading: "Revisando tu verificación…",
    enrollSteps: [
      "Abrí una app de autenticación en tu celular (Google Authenticator, Microsoft Authenticator o similar).",
      "Escaneá el código QR de esta pantalla, o escribí la clave manual en la app.",
      "Escribí el código de 6 dígitos que muestra la app y confirmá.",
    ],
    manualKey: "Clave manual",
    verifyIntro: "Escribí el código de 6 dígitos que muestra tu app de autenticación.",
    codeLabel: "Código de 6 dígitos",
    confirm: "Confirmar",
    confirming: "Confirmando…",
    wrongCode: "El código no es válido o ya venció. Esperá al siguiente código y volvé a intentar.",
    unavailable:
      "No pudimos verificar tu sesión en este momento. No se habilitó el panel. Recargá la página y, si sigue igual, avisá al dueño.",
    retry: "Reintentar",
    preparing: "Preparando el código…",
  },
  en: {
    title: "Two-step verification",
    intro:
      "Staff accounts need a code from your authenticator app in addition to the password. Without this step the panel cannot be opened.",
    loading: "Checking your verification…",
    enrollSteps: [
      "Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or similar).",
      "Scan the QR code on this screen, or enter the manual key in the app.",
      "Enter the 6-digit code shown in the app and confirm.",
    ],
    manualKey: "Manual key",
    verifyIntro: "Enter the 6-digit code shown by your authenticator app.",
    codeLabel: "6-digit code",
    confirm: "Confirm",
    confirming: "Confirming…",
    wrongCode: "The code is not valid or has expired. Wait for the next code and try again.",
    unavailable:
      "We could not verify your session right now. The panel was not enabled. Reload the page and, if it persists, contact the owner.",
    retry: "Try again",
    preparing: "Preparing the code…",
  },
} as const;

export function MfaSetup({
  locale,
  role,
  initialState,
}: {
  locale: string;
  role: string;
  initialState: MfaState;
}) {
  const t = copy[locale === "en" ? "en" : "es"];
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  // Calcula la fase sin tocar estado; el estado sólo cambia tras un await.
  async function loadPhase(): Promise<Phase> {
    const client = getSupabaseBrowserClient();
    if (!client) return { kind: "unavailable" };
    const state = await readMfaState(client, role);
    if (state === "ok") {
      router.refresh();
      return { kind: "loading" };
    }
    if (state === "enroll") {
      const enrollment = await startTotpEnrollment(client);
      return typeof enrollment === "string"
        ? { kind: "unavailable" }
        : { kind: "enroll", enrollment };
    }
    if (state === "verify") {
      const factorId = await verifiedTotpFactorId(client);
      return factorId === "unavailable" ? { kind: "unavailable" } : { kind: "verify", factorId };
    }
    return { kind: "unavailable" };
  }

  function retry() {
    setError("");
    setPhase({ kind: "loading" });
    void loadPhase().then(setPhase);
  }

  useEffect(() => {
    if (initialState === "not_required") return;
    let active = true;
    void loadPhase().then((next) => {
      if (active) setPhase(next);
    });
    return () => {
      active = false;
    };
    // Una sola carga por montaje: el estado inicial llega del servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || busy) return false;
    const factorId =
      phase.kind === "enroll" ? phase.enrollment?.factorId : phase.kind === "verify" ? phase.factorId : null;
    if (!factorId) return false;
    const submittedCodes = new FormData(event.currentTarget).getAll("code");
    const code =
      submittedCodes.length === 1 && typeof submittedCodes[0] === "string"
        ? submittedCodes[0]
        : "";
    if (!isTotpCode(code)) {
      setError(t.wrongCode);
      return false;
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      setError(t.unavailable);
      return false;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await verifyTotpCode(client, factorId, code);
      if (!result.ok) {
        setError(result.error === "code" ? t.wrongCode : t.unavailable);
        return false;
      }
      router.refresh();
      return true;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (phase.kind === "loading") {
    return <Card title={t.title}><p role="status" className="text-fog">{t.loading}</p></Card>;
  }

  if (phase.kind === "unavailable") {
    return (
      <Card title={t.title}>
        <p role="alert" className="text-alert">{t.unavailable}</p>
        <Button type="button" variant="outline" onClick={retry}>
          {t.retry}
        </Button>
      </Card>
    );
  }

  if (phase.kind === "enroll" && !phase.enrollment) {
    return <Card title={t.title}><p role="status" className="text-fog">{t.preparing}</p></Card>;
  }

  const isEnroll = phase.kind === "enroll";
  const factorId = isEnroll ? phase.enrollment?.factorId : phase.factorId;
  return (
    <Card title={t.title}>
      <p className="text-fog">{t.intro}</p>
      {isEnroll && phase.enrollment ? (
        <EnrollmentInstructions
          enrollment={phase.enrollment}
          locale={locale}
          steps={t.enrollSteps}
          manualKey={t.manualKey}
        />
      ) : (
        <p className="text-fog">{t.verifyIntro}</p>
      )}
      <TotpCodeForm
        key={`${phase.kind}-${factorId ?? "none"}`}
        label={t.codeLabel}
        confirm={t.confirm}
        confirming={t.confirming}
        busy={busy}
        onSubmit={submit}
      />
      {error && <p role="alert" className="text-alert">{error}</p>}
    </Card>
  );
}

const EnrollmentInstructions = memo(function EnrollmentInstructions({
  enrollment,
  locale,
  steps,
  manualKey,
}: {
  enrollment: TotpEnrollment;
  locale: string;
  steps: readonly string[];
  manualKey: string;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
      {/* El QR lo genera Supabase como SVG en una URL de datos; no se inserta HTML
          y next/image no admite data URLs de SVG. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrollment.qrCode} alt={locale === "en" ? "QR code for your authenticator app" : "Código QR para tu app de autenticación"} width={200} height={200} className="rounded-lg bg-white p-2" />
      <div className="space-y-2 text-sm text-fog">
        <ol className="list-decimal space-y-1 pl-5">
          {steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <p>{manualKey}: <code className="break-all font-mono text-ink">{enrollment.secret}</code></p>
      </div>
    </div>
  );
});

function TotpCodeForm({
  label,
  confirm,
  confirming,
  busy,
  onSubmit,
}: {
  label: string;
  confirm: string;
  confirming: string;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  // El código vive en el DOM (campo no controlado). Solo cambia el estado
  // cuando se cruza el límite de 6 dígitos, así escribir no vuelve a pintar
  // la tarjeta completa en cada tecla y la respuesta visual queda inmediata.
  const [codeReady, setCodeReady] = useState(false);

  function handleCodeChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const digits = input.value.replace(/\D/g, "").slice(0, 6);
    if (input.value !== digits) input.value = digits;
    const ready = digits.length === 6;
    if (ready !== codeReady) setCodeReady(ready);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    if (await onSubmit(event)) {
      form.reset();
      setCodeReady(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3" noValidate>
      <Input
        label={label}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        defaultValue=""
        onChange={handleCodeChange}
        disabled={busy}
        className="w-40 tracking-[0.3em]"
      />
      <Button type="submit" disabled={busy || !codeReady}>
        {busy ? confirming : confirm}
      </Button>
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-4 rounded-xl border border-brand/40 bg-cloud p-5">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}
