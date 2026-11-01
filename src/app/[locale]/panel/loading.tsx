import { Spinner, LoadingSkeleton } from "@/components/ui/spinner";

/**
 * Pantalla de espera del panel de gestión (loading.tsx).
 *
 * Aparece en el instante en que se toca un módulo, antes de que el servidor
 * termine de leer los datos. Sin esto, la app se veía congelada uno o dos
 * segundos y la persona volvía a tocar la misma tarjeta.
 *
 * Repite la forma de las pantallas del panel —encabezado, cifras, tarjetas—
 * para que el cambio no dé un salto cuando llega el contenido de verdad.
 */
export default function PanelLoading() {
  return (
    <div className="pb-10" aria-busy="true">
      <section className="border-b border-brand/25 bg-cloud pt-10 pb-8 sm:pt-12 sm:pb-10">
        <div className="container-x space-y-3">
          <div className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-brand-300 uppercase">
            <Spinner size="sm" />
            Cargando…
          </div>
          <div className="h-7 w-2/3 max-w-md animate-pulse rounded-full bg-line/70" />
          <div className="h-3 w-full max-w-xl animate-pulse rounded-full bg-line/50" />
        </div>
      </section>

      <section className="py-8 sm:py-10">
        <div className="container-x space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="rounded-2xl border border-line bg-card p-4">
                <div className="size-9 animate-pulse rounded-xl bg-line/60" />
                <div className="mt-3 h-6 w-16 animate-pulse rounded-full bg-line/70" />
                <div className="mt-2 h-2.5 w-24 animate-pulse rounded-full bg-line/50" />
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((index) => (
              <div key={index} className="space-y-3 rounded-2xl border border-line bg-card p-5">
                <div className="h-4 w-40 animate-pulse rounded-full bg-line/70" />
                <LoadingSkeleton lines={index === 0 ? 3 : 4} />
              </div>
            ))}
          </div>

          <p className="text-[0.8125rem] text-fog" role="status" aria-live="polite">
            Estamos trayendo la información de esta pantalla. Si tarda, no hace
            falta tocar de nuevo: en cuanto llega, se abre sola.
          </p>
        </div>
      </section>
    </div>
  );
}
