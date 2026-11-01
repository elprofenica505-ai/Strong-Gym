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

/**
 * Tamaños de la foto (EX-06).
 *
 * Por qué: las fotos del origen pesan ~60 KB cada una y vienen a 850 px de
 * ancho, pero una tarjeta de la grilla mide ~170 px en el teléfono. Se estaba
 * bajando el triple de píxeles de los que se muestran. Medido sobre una foto
 * real: 71 KB → **~10 KB** a 320 px (‑86 %) y ~24 KB a 640 px.
 *
 * El proxy `/api/exercises/image` recibe `w` y devuelve WebP a ese ancho.
 * Sólo tres medidas: cuantas más, más cachés distintas que llenar.
 */
export const FIGURE_WIDTHS = { card: 320, cardBig: 640, detail: 640, full: 960 } as const;

/** Las dos medidas que se ofrecen al navegador en cada pantalla. */
export const FIGURE_VARIANTS = {
  /** Grilla: dos columnas en el teléfono, hasta cinco en pantalla grande. */
  card: {
    widths: [FIGURE_WIDTHS.card, FIGURE_WIDTHS.cardBig],
    sizes: "(min-width: 1280px) 19vw, (min-width: 1024px) 24vw, (min-width: 640px) 32vw, 45vw",
  },
  /** Ficha: la imagen ocupa la columna principal. */
  detail: {
    widths: [FIGURE_WIDTHS.detail, FIGURE_WIDTHS.full],
    sizes: "(min-width: 1024px) 60vw, 100vw",
  },
} as const;

export type FigureVariant = keyof typeof FIGURE_VARIANTS;

/** Ruta del proxy: la foto nunca se enlaza al origen. */
export const figureUrl = (path: string | null, width: number = FIGURE_WIDTHS.card) =>
  path ? `/api/exercises/image?path=${encodeURIComponent(path)}&w=${width}` : null;

/**
 * La misma foto en dos medidas para que el navegador elija una sola: el
 * teléfono baja la chica y la pantalla grande la nítida. Nunca las dos.
 */
export function figureSrcSet(
  path: string | null,
  widths: readonly number[],
  /** Se agrega al final de cada dirección (el reintento usa `&r=1`). */
  extra = "",
) {
  if (!path) return null;
  return widths.map((width) => `${figureUrl(path, width)}${extra} ${width}w`).join(", ");
}

/** Las dos fotos que se alternan, si las hay; si no, la portada. */
export function exerciseFrames(frames: ExerciseFrames) {
  if (frames.imageStart && frames.imagePeak)
    return { first: frames.imageStart, second: frames.imagePeak, animated: true };
  const single = frames.imageMain ?? frames.imageStart ?? frames.imagePeak;
  return { first: single, second: null, animated: false };
}

/**
 * Cómo se mueve una ficha.
 *
 *   · `alternate` — hay dos fotos (inicio y final) y se alternan.
 *   · `soft` — el catálogo trae **una sola foto** (29 fichas: posiciones que se
 *     mantienen, paseos con peso y máquinas de cardio). El dueño pidió que
 *     también se muevan, así que la imagen se acerca y se aleja despacio. No se
 *     pone la foto de otro aparato: eso enseñaría mal el ejercicio.
 *   · `none` — no hay ni una foto.
 */
export type FigureMotion = "alternate" | "soft" | "none";

export function figureMotion(frames: ExerciseFrames): FigureMotion {
  const { first, second } = exerciseFrames(frames);
  if (!first) return "none";
  return second ? "alternate" : "soft";
}

/** Portada para listas: la foto principal o la del inicio del movimiento. */
export function exerciseImage(frames: ExerciseFrames, width: number = FIGURE_WIDTHS.card) {
  return figureUrl(exerciseFrames(frames).first, width);
}

/** Cada cuánto se cambia de foto. Dos por segundo se lee como un GIF. */
export const FIGURE_INTERVAL_MS = 900;

/**
 * Qué se le dice al socio cuando la imagen no se mueve.
 *
 * Por qué: el catálogo de dibujos publicó **una sola imagen** para 32 fichas
 * visibles (posiciones que se mantienen, paseos con peso y máquinas de cardio),
 * así que ésas no pueden alternar nada. Antes la ficha decía «Imagen de
 * referencia del movimiento» sin explicar nada y parecía un error. Ahora se
 * dice la verdad, en una línea:
 *   · si hay dos fotos, que alternan;
 *   · si es una posición que se mantiene, que **no se mueve porque el
 *     ejercicio no se mueve**;
 *   · si no hay segunda foto, que el catálogo trae una sola.
 */
export function figureNote(frames: ExerciseFrames, nameEs = "") {
  const motion = figureMotion(frames);
  if (motion === "alternate")
    return "La imagen alterna la posición inicial y la final del movimiento.";
  if (motion === "none") return "Este ejercicio todavía no tiene imagen en el catálogo.";
  if (/isom[eé]tric|sost[eé]n/i.test(nameEs))
    return "Es una posición que se mantiene. El catálogo trae una sola foto, así que la imagen se mueve despacio para que se lea.";
  return "El catálogo trae una sola foto de este ejercicio: la imagen se acerca y se aleja para que se lea en movimiento.";
}
