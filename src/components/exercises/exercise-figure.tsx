"use client";

import { useEffect, useRef, useState } from "react";
import {
  FIGURE_INTERVAL_MS,
  exerciseFrames,
  figureUrl,
  type ExerciseFrames,
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
}: {
  name: string;
  frames: ExerciseFrames;
  className?: string;
  /** Falso lo deja quieto en la posición inicial. */
  playing?: boolean;
}) {
  const { first, second, animated } = exerciseFrames(frames);
  const firstUrl = figureUrl(first);
  const [tick, setTick] = useState(0);
  const [onScreen, setOnScreen] = useState(true);
  const box = useRef<HTMLDivElement | null>(null);

  const secondUrl = second ? figureUrl(second) : null;
  const moves = animated && secondUrl !== null;

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

  if (!firstUrl) {
    return <span className="text-xs text-fog">Sin imagen</span>;
  }

  if (!moves) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto del catálogo servida por nuestra propia ruta.
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
        alt={name}
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        className="frame-a"
        style={{ opacity: peak ? 0 : 1 }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- la segunda foto es la misma escena, así que no necesita texto alternativo. */}
      <img
        src={secondUrl}
        alt=""
        aria-hidden="true"
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        className="frame-b"
        style={{ opacity: peak ? 1 : 0 }}
      />
    </div>
  );
}
