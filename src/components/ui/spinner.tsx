import { Flame, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * La figura de «Cargando» del proyecto.
 *
 * Por qué existe: en el celular, cuando una pantalla tarda en contestar, lo que
 * se ve es una pantalla quieta y la persona toca otra vez el mismo botón o la
 * misma tarjeta. Un giro visible (y su texto) confirma que algo está pasando y
 * evita el doble toque.
 *
 * No es un componente de cliente: se puede usar tanto en pantallas del servidor
 * (`loading.tsx`) como dentro de botones que ya están en el navegador. El texto
 * va aparte porque cada pantalla sabe qué está esperando; `label` permite
 * dejarlo sólo para lectores de pantalla cuando ya hay texto visible al lado.
 */
export function Spinner({
  size = "md",
  className,
  label,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Texto para lectores de pantalla. Si se omite, el icono queda decorativo. */
  label?: string;
}) {
  const sizeClass = size === "sm" ? "size-3.5" : size === "lg" ? "size-7" : "size-4";
  return (
    <>
      <Loader2
        className={cn("animate-spin", sizeClass, className)}
        aria-hidden="true"
        focusable="false"
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

/**
 * Bloque de espera con texto visible: «Cargando…» y una línea de contexto.
 * Se usa cuando la pantalla todavía no tiene nada que mostrar.
 */
export function LoadingBlock({
  title = "Cargando…",
  hint,
  className,
}: {
  title?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-card p-4 text-ink sm:p-5",
        className,
      )}
    >
      {/* La misma cascada de brasas del aviso de navegación: un hilo fino sobre
          el borde, sin tapar el contenido ni dejar la tarjeta en gris. */}
      <span className="fire-bar absolute inset-x-0 top-0 block h-[3px]" aria-hidden="true" />
      <div className="flex items-center gap-2.5">
        <Flame className="fire-flame size-4 shrink-0 text-amber-400" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {hint ? <p className="text-[0.8125rem] text-fog">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}
