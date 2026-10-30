"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { RotateCcw } from "lucide-react";

/**
 * Red de contención de todo el panel: si una pantalla se rompe al abrir, se
 * muestra este aviso en lugar de la pantalla técnica de error. Abrir una
 * pantalla del panel nunca escribe nada, así que acá se puede reintentar sin
 * riesgo; lo que ya estaba guardado sigue igual.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const es = !pathname?.startsWith("/en");

  useEffect(() => {
    // Queda en la consola del navegador para poder diagnosticar sin exponer
    // datos personales en pantalla.
    console.error("Panel error", error.digest ?? error.message);
  }, [error]);

  return (
    <section className="py-10">
      <div className="container-x">
        <div
          role="alert"
          className="rounded-2xl border border-alert/40 bg-card p-5 text-sm text-mist"
        >
          <h1 className="font-semibold text-ink">
            {es ? "Esta pantalla no cargó" : "This screen did not load"}
          </h1>
          <p className="my-3">
            {es
              ? "No se guardó ni se borró nada: abrir una pantalla del panel solo lee información. Reintentá; si sigue igual, esperá un minuto y volvé a probar."
              : "Nothing was saved or deleted: opening a panel screen only reads data. Retry; if it keeps failing, wait a minute and try again."}
          </p>
          {error.digest ? (
            <p className="mb-3 break-all font-mono text-xs text-fog">
              {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-4 py-2 font-medium text-ink transition hover:border-brand hover:text-brand"
          >
            <RotateCcw className="size-4" aria-hidden />
            {es ? "Reintentar" : "Retry"}
          </button>
        </div>
      </div>
    </section>
  );
}
