import type { ExerciseCard as ExerciseCardData } from "@/lib/exercises/queries";

/**
 * Imagen de un ejercicio (EX-01).
 *
 * El catálogo trae, para la mayoría de los movimientos, **dos fotos**: la
 * posición inicial y la final. Mostrarlas alternadas es lo que hace que se lea
 * como el GIF del origen, sin descargar un video ni animar nada en JavaScript:
 * son dos `<img>` ya cacheadas que se turnan por CSS.
 *
 * Si el ejercicio sólo tiene una imagen (o una portada), se muestra quieta.
 * Con `prefers-reduced-motion` también queda quieta: la animación vive dentro
 * de `@media (prefers-reduced-motion: no-preference)` en `globals.css`.
 */

const url = (path: string | null) =>
  path ? `/api/exercises/image?path=${encodeURIComponent(path)}` : null;

export type ExerciseFrames = Pick<
  ExerciseCardData,
  "imageMain" | "imageStart" | "imagePeak"
>;

/** Las dos fotos que se turnan, si las hay; si no, la portada. */
export function exerciseFrames(frames: ExerciseFrames) {
  if (frames.imageStart && frames.imagePeak)
    return { first: frames.imageStart, second: frames.imagePeak, animated: true };
  const single = frames.imageMain ?? frames.imageStart ?? frames.imagePeak;
  return { first: single, second: null, animated: false };
}

/** Portada para listas: la foto principal o la del inicio del movimiento. */
export function exerciseImage(frames: ExerciseFrames) {
  return url(exerciseFrames(frames).first);
}

export function ExerciseFigure({
  name,
  frames,
  className = "",
  force = false,
}: {
  name: string;
  frames: ExerciseFrames;
  className?: string;
  /** Anima aunque el sistema pida reducir movimiento (lo pide el socio). */
  force?: boolean;
}) {
  const { first, second, animated } = exerciseFrames(frames);
  const firstUrl = url(first);
  if (!firstUrl) {
    return <span className="text-xs text-fog">Sin imagen</span>;
  }

  if (!animated || !second) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- WebP del catálogo servido por nuestra propia ruta.
      <img
        src={firstUrl}
        alt={name}
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        className={className || "size-full object-contain p-2"}
      />
    );
  }

  const secondUrl = url(second) as string;
  return (
    <div
      className={`exercise-frames ${className || "size-full"}`}
      data-animate="true"
      data-force={force ? "true" : "false"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- WebP del catálogo servido por nuestra propia ruta. */}
      <img
        src={firstUrl}
        alt={name}
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        className="frame-a"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- WebP del catálogo servido por nuestra propia ruta. */}
      <img
        src={secondUrl}
        alt=""
        aria-hidden="true"
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        className="frame-b"
      />
    </div>
  );
}
