import { existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Foto del gimnasio.
 *
 * Mientras alguna foto todavía no esté subida a `public/images/`, en su
 * lugar se muestra un recuadro que dice qué archivo falta, en vez de un
 * hueco roto. Así el sitio se puede ver y revisar completo, y cuando la
 * foto aparezca con ese nombre se muestra sola, sin tocar código.
 *
 * Es un componente de servidor: la comprobación la hace Node, nunca el
 * navegador.
 */
/** ¿La foto ya está subida a `public/images/`? Sólo se puede llamar en el servidor. */
export function fotoDisponible(src: string): boolean {
  return existsSync(join(process.cwd(), "public", src));
}

export function GymPhoto({
  src,
  alt,
  sizes,
  className,
  priority = false,
  quality,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  quality?: number;
}) {
  if (!fotoDisponible(src)) {
    return <FotoPendiente src={src} className={className} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      quality={quality}
      priority={priority}
      className={className}
    />
  );
}

/** Recuadro de "falta esta foto", con el nombre exacto del archivo. */
function FotoPendiente({ src, className }: { src: string; className?: string }) {
  const nombre = src.split("/").pop() ?? src;

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card-2 p-4 text-center ring-1 ring-line ring-inset",
        className,
      )}
      aria-hidden="true"
    >
      <ImageOff className="size-5 text-fog" strokeWidth={1.75} />
      <span className="font-mono text-[0.6875rem] leading-tight break-all text-fog/90">
        {nombre}
      </span>
    </div>
  );
}
