import { Spinner } from "@/components/ui/spinner";

/**
 * Espera de las pantallas públicas (portada, horarios, planes).
 *
 * Se muestra apenas se toca un enlace, mientras el servidor prepara la página.
 * Sin esto, en el celular la pantalla quedaba igual unos segundos y parecía
 * que el toque no había entrado.
 */
export default function LocaleLoading() {
  return (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center gap-3 py-24 text-center">
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex flex-col items-center gap-3"
      >
        <Spinner size="lg" className="text-brand" />
        <p className="text-sm font-semibold text-ink">Cargando…</p>
        <p className="max-w-xs text-[0.8125rem] text-fog">
          Estamos preparando esta pantalla. En cuanto esté, se abre sola.
        </p>
      </div>
    </div>
  );
}
