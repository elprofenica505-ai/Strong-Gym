import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * El botón de volver (EX-05).
 *
 * Por qué existe: en las pantallas de la biblioteca el retroceso era un texto
 * de 12 px pegado arriba a la izquierda (`← Biblioteca`). En el teléfono eso se
 * ve como una etiqueta, no como algo que se toca, y el dueño pidió una flecha
 * más grande que además diga **Atrás**.
 *
 * Cómo está hecho:
 *   · Es un enlace con forma de botón: borde, fondo y estado al pasar el dedo.
 *   · Alto mínimo de 44 px, que es el mínimo cómodo para el pulgar.
 *   · La flecha va en un círculo teñido de la marca, para que se lea de un
 *     vistazo sin acercarse a la pantalla.
 *   · Se puede usar desde el servidor: no lleva estado ni efectos.
 */
export function BackLink({
  href,
  label = "Atrás",
  hint,
  className,
}: {
  href: string;
  /** Texto grande. Por defecto «Atrás». */
  label?: string;
  /** A dónde vuelve, en pequeño: «Biblioteca», «Mi cuenta»… */
  hint?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={hint ? `${label}: ${hint}` : label}
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-full border border-line bg-card py-2 pr-4 pl-2",
        "text-[0.9375rem] font-semibold text-ink transition-colors",
        "hover:border-brand hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:outline-none",
        "active:scale-[0.99]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-8 items-center justify-center rounded-full bg-brand-soft text-brand-300"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[1.125rem]"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </span>
      <span>{label}</span>
      {hint ? <span className="text-xs font-medium text-fog">{hint}</span> : null}
    </Link>
  );
}
