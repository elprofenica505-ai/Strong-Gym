import { Loader2 } from "lucide-react";
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
        "flex items-center gap-3 rounded-2xl border border-line bg-card p-5 text-ink",
        className,
      )}
    >
      <Spinner size="md" className="text-brand-300" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {hint ? <p className="text-[0.8125rem] text-fog">{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * Esqueleto del contenido: barras grises con la forma de lo que va a llegar.
 * Es lo que se pinta al cambiar de pantalla, antes de que el servidor responda.
 */
export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded-full bg-line/70"
          style={{ width: `${[92, 78, 86, 64, 88][index % 5]}%` }}
        />
      ))}
    </div>
  );
}
