import { cn } from "@/lib/utils";

/**
 * Emblema de STRONG FITNESS GYM: triángulo rojo con la silueta negra
 * del atleta. Es el mismo dibujo del cartel del local y del favicon
 * (src/app/icon.svg), hecho en vectores para que se vea nítido en
 * cualquier tamaño y sobre cualquier fondo.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-9", className)}
      aria-hidden="true"
      focusable="false"
    >
      <polygon points="50,12 93,85 7,85" fill="#d81a22" />
      <g
        fill="#0c0c0e"
        stroke="#0c0c0e"
        strokeWidth="6.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="50" cy="46.5" r="5.6" stroke="none" />
        <polygon points="42,54.5 58,54.5 55.5,77 44.5,77" stroke="none" />
        <path d="M43 56 L33.5 60.5 L37 49.5" fill="none" />
        <path d="M57 56 L66.5 60.5 L63 49.5" fill="none" />
      </g>
    </svg>
  );
}
