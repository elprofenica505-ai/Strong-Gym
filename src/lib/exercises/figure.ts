import type { ExerciseCard as ExerciseCardData } from "@/lib/exercises/queries";

/**
 * Las fotos de un ejercicio (EX-01).
 *
 * El catálogo trae, para la mayoría de los movimientos, **dos fotos**: la
 * posición inicial y la final. Alternarlas es lo que hace que la ficha se lea
 * como el GIF del origen sin descargar un video.
 *
 * Estas funciones son puras y viven fuera del componente para que las pueda
 * usar cualquier pantalla del servidor: el componente que anima es de cliente.
 */

export type ExerciseFrames = Pick<
  ExerciseCardData,
  "imageMain" | "imageStart" | "imagePeak"
>;

/** Ruta del proxy: la foto nunca se enlaza al origen. */
export const figureUrl = (path: string | null) =>
  path ? `/api/exercises/image?path=${encodeURIComponent(path)}` : null;

/** Las dos fotos que se alternan, si las hay; si no, la portada. */
export function exerciseFrames(frames: ExerciseFrames) {
  if (frames.imageStart && frames.imagePeak)
    return { first: frames.imageStart, second: frames.imagePeak, animated: true };
  const single = frames.imageMain ?? frames.imageStart ?? frames.imagePeak;
  return { first: single, second: null, animated: false };
}

/** Portada para listas: la foto principal o la del inicio del movimiento. */
export function exerciseImage(frames: ExerciseFrames) {
  return figureUrl(exerciseFrames(frames).first);
}

/** Cada cuánto se cambia de foto. Dos por segundo se lee como un GIF. */
export const FIGURE_INTERVAL_MS = 900;
