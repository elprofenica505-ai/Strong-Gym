"use client";

import { useEffect, useRef, useState } from "react";
import {
  FIGURE_INTERVAL_MS,
  FIGURE_VARIANTS,
  exerciseFrames,
  figureMotion,
  figureSrcSet,
  figureUrl,
  type ExerciseFrames,
  type FigureVariant,
} from "@/lib/exercises/figure";

/**
 * La imagen de un ejercicio (EX-01).
 *
 * Hay dos formas de que se mueva, y las dos las hace **este componente** con un
 * temporizador, nunca una animación de CSS que dependa de la configuración del
 * teléfono:
 *
 *   · **Dos fotos** (438 de las 467 visibles): se alterna la posición inicial
 *     y la final del movimiento.
 *   · **Una sola foto** (29 fichas: posiciones que se mantienen, paseos con
 *     peso y máquinas de cardio): la imagen se acerca y se aleja despacio. El
 *     dueño quiso que también se muevan, y esto no miente: no se cambia la foto
 *     del ejercicio por la de otro aparato.
 *
 * Por qué no con animaciones de CSS condicionadas a la configuración del
 * aparato: la versión anterior lo hacía así y en los teléfonos con la opción de
 * reducir movimiento activada (Android la trae en Accesibilidad) la imagen
 * quedaba quieta y el socio creía que la biblioteca estaba rota. Quien no lo
 * quiera ver tiene el botón «Pausar movimiento» en la ficha.
 */

/** Cuánto se acerca la imagen cuando sólo hay una foto. */
const ZOOM = 1.08;

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
  /** Falso lo deja quieto. */
  playing?: boolean;
  /** Tamaño de foto: la tarjeta de la grilla o la imagen grande de la ficha. */
  variant?: FigureVariant;
}) {
  const { first, second } = exerciseFrames(frames);
  const motion = figureMotion(frames);
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

  // El reintento va en la dirección **y** en el `srcset`: si no, el navegador
  // vuelve a elegir la misma candidata que acaba de fallar.
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

  // Sin la segunda foto no hay nada que alternar: se queda con la primera.
  const alternates = motion === "alternate" && secondUrl !== null && !secondFailed && !firstFailed;
  const soloUna = motion === "soft" && !firstFailed;
  const seMueve = alternates || soloUna;

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
  }, [seMueve]);

  useEffect(() => {
    if (!seMueve || !playing || !onScreen) return;
    const id = setInterval(() => {
      // Con la pestaña en segundo plano tampoco.
      if (typeof document !== "undefined" && document.hidden) return;
      setTick((value) => value + 1);
    }, FIGURE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [seMueve, playing, onScreen]);

  // En pausa (o fuera de pantalla) queda quieta.
  const avanza = playing && onScreen && tick % 2 === 1;

  if (!firstUrl || firstFailed) {
    return <span className="text-xs text-fog">Sin imagen</span>;
  }

  // Una sola foto: se acerca y se aleja despacio. La transición va escrita acá
  // mismo, sin `@media`, para que no la apague ninguna preferencia del sistema.
  if (soloUna) {
    return (
      <div
        ref={box}
        className={`exercise-frames overflow-hidden ${className || "size-full"}`}
        data-motion="soft"
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
          style={{
            transform: `scale(${avanza ? ZOOM : 1})`,
            transition: `transform ${FIGURE_INTERVAL_MS}ms ease-in-out`,
          }}
        />
      </div>
    );
  }

  if (!alternates) {
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
        style={{ opacity: avanza ? 0 : 1 }}
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
        style={{ opacity: avanza ? 1 : 0 }}
      />
    </div>
  );
}
