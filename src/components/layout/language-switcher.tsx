"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { LOCALE_COOKIE, localeShort, locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Cambia de idioma manteniendo la página actual.
 * /es/horarios → /en/horarios
 */
export function LanguageSwitcher({
  locale,
  label,
  variant = "default",
}: {
  locale: Locale;
  label: string;
  variant?: "default" | "menu";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;

    // Guardamos la preferencia en una cookie para que el proxy la recuerde.
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;

    const segments = pathname.split("/");
    segments[1] = next; // el primer segmento siempre es el idioma
    const target = segments.join("/") || `/${next}`;

    startTransition(() => {
      router.push(target);
      router.refresh();
    });
  }

  if (variant === "menu") {
    return (
      <div className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3">
        <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-mist">
          <Globe className="size-4 text-fog" aria-hidden="true" />
          {label}
        </span>

        <div className="flex gap-1 rounded-full bg-void p-1">
          {locales.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => switchTo(code)}
              disabled={isPending}
              aria-current={code === locale ? "true" : undefined}
              className={cn(
                "min-w-11 rounded-full px-3 py-1.5 text-[0.75rem] font-bold tracking-wide transition-colors",
                code === locale ? "bg-volt text-ink" : "text-fog hover:text-chalk",
              )}
            >
              {localeShort[code]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-0.5 rounded-full border border-line bg-card p-0.5">
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchTo(code)}
          disabled={isPending}
          aria-label={`${label}: ${localeShort[code]}`}
          aria-current={code === locale ? "true" : undefined}
          className={cn(
            "rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tracking-wider transition-colors",
            code === locale ? "bg-volt text-ink" : "text-fog hover:text-chalk",
          )}
        >
          {localeShort[code]}
        </button>
      ))}
    </div>
  );
}
