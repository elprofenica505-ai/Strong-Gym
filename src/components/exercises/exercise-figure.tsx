"use client";

import { useEffect, useRef, useState } from "react";
import {
  FIGURE_INTERVAL_MS,
  FIGURE_VARIANTS,
  exerciseFrames,
  figureSrcSet,
  figureUrl,
  type ExerciseFrames,
  type FigureVariant,
} from "@/lib/exercises/figure";

/**
 * La imagen de un ejercicio (EX-01).
 *
 * El catálogo publica dos fotos de cada movimiento —posición inicial y final—
 * y acá se alternan **desde JavaScript**, no con una animación de CSS.
 *
 * Por qué así: la versión anterior animaba con `@keyframes` y sólo cuando el
 * teléfono no pedía «reducir movimiento». En varios aparatos el sistema trae
 * esa opción activada (o el navegador la fuerza), la imagen quedaba quieta y el
 * socio creía que la biblioteca estaba rota. El movimiento tiene que verse en
 * todos los dispositivos, así que el cambio de foto lo hace el componente y no
 * depende de ninguna preferencia del sistema. Quien no lo quiera ver tiene el
 * botón «Pausar movimiento» en la ficha.
 */
export function ExerciseFigure({
  name,
  frames,
  className = "",
  playing = true,
  variant = "card",
}: {
  name: string;
  frames: ExerciseFrames;
  className?: string;
  /** Falso lo deja quieto en la posición inicial. */
  playing?: boolean;
  /** Tamaño de foto: la tarjeta de la grilla o la imagen grande de la ficha. */
  variant?: FigureVariant;
}) {
  const { first, second, animated } = exerciseFrames(frames);
  const { widths, sizes } = FIGURE_VARIANTS[variant];
  const [tick, setTick] = useState(0);
  const [onScreen, setOnScreen] = useState(true);
  const box = useRef<HTMLDivElement | null>(null);

  /*
   * Reintento de la foto (EX-04b).
   *
   * En el teléfono, una tarjeta («Curl con Barra Z») mostró el icono de imagen
   * rota con el nombre encima: la petición de esa foto falló una vez. El
   * archivo existe —se comprobó uno por uno—, así que un tropiezo de red con
   * datos móviles no puede dejar la tarjeta rota para siempre. Se vuelve a
   * pedir hasta dos veces, con un parámetro distinto para que el navegador no
   * reutilice la respuesta fallida. Si tampoco carga, la tarjeta muestra un
   * hueco discreto («Sin imagen»), nunca el icono roto con el nombre encima.
   */
  const [retry, setRetry] = useState(0);
  const [firstFailed, setFirstFailed] = useState(false);
  const [secondFailed, setSecondFailed] = useState(false);

  // El reintento se aplica a la dirección **y** al `srcset`: si no, el
  // navegador vuelve a elegir la misma candidata que acaba de fallar.
  const extra = retry > 0 ? `&r=${retry}` : "";
  const firstUrl = figureUrl(first, widths[0]) ? `${figureUrl(first, widths[0])}${extra}` : null;
  const secondUrl = second ? `${figureUrl(second, widths[0])}${extra}` : null;
  const firstSrcSet = figureSrcSet(first, widths, extra);
  const secondSrcSet = figureSrcSet(second, widths, extra);

  const onFirstError = () => {
    if (firstFailed) return;
    if (retry < 2) setRetry((value) => value + 1);
    else setFirstFailed(true);
  };
  const onSecondError = () => {
    if (secondFailed) return;
    if (retry < 2) setRetry((value) => value + 1);
    else setSecondFailed(true);
  };

  // Sin la segunda foto no hay nada que alternar: se queda en la primera.
  const moves = animated && secondUrl !== null && !secondFailed && !firstFailed;

  // Sólo se mueve lo que se está viendo: con 25 tarjetas en pantalla nadie
  // gasta batería animando fotos que quedaron abajo.
  useEffect(() => {
    const element = box.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setOnScreen(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [moves]);

  useEffect(() => {
    if (!moves || !playing || !onScreen) return;
    const id = setInterval(() => {
      // Con la pestaña en segundo plano tampoco.
      if (typeof document !== "undefined" && document.hidden) return;
      setTick((value) => value + 1);
    }, FIGURE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [moves, playing, onScreen]);

  // En pausa (o fuera de pantalla) queda en la posición inicial.
  const peak = playing && onScreen && tick % 2 === 1;

  if (!firstUrl || firstFailed) {
    return <span className="text-xs text-fog">Sin imagen</span>;
  }

  if (!moves) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto del catálogo servida por nuestra propia ruta.
      <img
        src={firstUrl}
        srcSet={firstSrcSet ?? undefined}
        sizes={sizes}
        alt={name}
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        onError={onFirstError}
        className={className || "size-full object-contain p-2"}
      />
    );
  }

  return (
    <div
      ref={box}
      className={`exercise-frames ${className || "size-full"}`}
      data-animate="true"
      data-playing={playing ? "true" : "false"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- foto del catálogo servida por nuestra propia ruta. */}
      <img
        src={firstUrl}
        srcSet={firstSrcSet ?? undefined}
        sizes={sizes}
        alt={name}
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        onError={onFirstError}
        className="frame-a"
        style={{ opacity: peak ? 0 : 1 }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- la segunda foto es la misma escena, así que no necesita texto alternativo. */}
      <img
        src={secondUrl ?? undefined}
        srcSet={secondSrcSet ?? undefined}
        sizes={sizes}
        alt=""
        aria-hidden="true"
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        onError={onSecondError}
        className="frame-b"
        style={{ opacity: peak ? 1 : 0 }}
      />
    </div>
  );
}
