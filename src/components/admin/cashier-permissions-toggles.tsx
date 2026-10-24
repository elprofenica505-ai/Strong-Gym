"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CASHIER_PERMISSION_DEFINITIONS,
  type CashierPermissionKey,
  type CashierPermissions,
} from "@/lib/finance/cashier-permissions";

/**
 * Interruptores del administrador para delegar vistas concretas a caja.
 * Nacen apagados, no vencen solos y caja nunca puede cambiarlos: la API y
 * la RLS de staff_permissions vuelven a exigir administrador con MFA.
 */
export function CashierPermissionsToggles({
  initialPermissions,
}: {
  initialPermissions: CashierPermissions;
}) {
  const router = useRouter();
  const [permissions, setPermissions] = useState(initialPermissions);
  const [busy, setBusy] = useState<CashierPermissionKey | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function toggle(field: CashierPermissionKey, next: boolean) {
    const definition = CASHIER_PERMISSION_DEFINITIONS.find((item) => item.field === field);
    setBusy(field);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/trainer-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_cashier_permission", permission: field, enabled: next }),
      });
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: json?.message ?? "No se pudo guardar el cambio. No se modificó nada.",
        });
        return;
      }
      setPermissions((current) => ({ ...current, [field]: next }));
      setNotice({
        tone: "ok",
        text: next
          ? definition?.enabledMessage ?? "Permiso activado para caja."
          : definition?.disabledMessage ?? "Permiso desactivado para caja.",
      });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "No hay conexión. No se modificó nada." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="caja-permisos-titulo"
      className="flex flex-col gap-5 rounded-2xl border border-line bg-card p-5"
    >
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
          Caja · Permisos por separado
        </p>
        <h2 id="caja-permisos-titulo" className="mt-1 text-[1rem] font-semibold text-ink">
          Qué puede ver caja cuando administración no está
        </h2>
        <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-mist">
          Caja siempre conserva su operación diaria: cobrar servicios, registrar abonos y emitir
          comprobantes. Encendé solo las vistas extra que necesite mientras te reemplaza. Estos
          permisos no vencen solos; apagálos al volver.
        </p>
      </div>

      <ul className="grid gap-3 lg:grid-cols-2">
        {CASHIER_PERMISSION_DEFINITIONS.map((definition) => {
          const enabled = permissions[definition.field];
          const inputId = `cashier-permission-${definition.field}`;
          return (
            <li
              key={definition.field}
              className="flex items-start justify-between gap-4 rounded-xl border border-line bg-card-2 p-4"
            >
              <div className="min-w-0">
                <label htmlFor={inputId} className="text-[0.9375rem] font-semibold text-ink">
                  {definition.title}
                </label>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-mist">
                  {definition.description}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2 rounded-lg border border-line px-3 py-2">
                <span className={`text-[0.75rem] font-semibold ${enabled ? "text-brand" : "text-fog"}`}>
                  {enabled ? "Encendido" : "Apagado"}
                </span>
                <input
                  id={inputId}
                  type="checkbox"
                  role="switch"
                  aria-checked={enabled}
                  checked={enabled}
                  disabled={busy !== null}
                  onChange={(event) => toggle(definition.field, event.target.checked)}
                  className="size-5 accent-brand disabled:opacity-50"
                />
              </span>
            </li>
          );
        })}
      </ul>

      {notice ? (
        <p
          role="status"
          className={`rounded-xl px-4 py-2 text-[0.8125rem] ${
            notice.tone === "ok"
              ? "bg-brand/[0.08] text-ink"
              : "border border-red-400/40 bg-red-400/[0.06] text-red-300"
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
