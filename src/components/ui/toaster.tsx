"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { cn } from "@/lib/utils";

const styles = {
  success: {
    icon: CheckCircle2,
    ring: "border-brand/40 bg-card",
    iconColor: "text-brand-300",
  },
  error: {
    icon: AlertTriangle,
    ring: "border-alert/40 bg-card",
    iconColor: "text-alert",
  },
  info: {
    icon: Info,
    ring: "border-line bg-card",
    iconColor: "text-mist",
  },
} as const;

/** Notificaciones flotantes. Se montan una sola vez en el layout. */
export function Toaster() {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const style = styles[toast.type];
        const Icon = style.icon;

        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur",
              style.ring,
            )}
            style={{ animation: "rise 0.35s cubic-bezier(0.16,1,0.3,1) both" }}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", style.iconColor)} aria-hidden="true" />
            <p className="flex-1 text-[0.8125rem] leading-snug text-ink">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-fog transition-colors hover:text-ink"
              aria-label="Cerrar"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
