"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/layout/brand-mark";

/**
 * Transición de fuego a pantalla completa.
 *
 * El problema: al cambiar de módulo, Next tiene que renderizar la pantalla en el
 * servidor y en el celular se ve un instante de quietud. Esa pausa parece que la
 * app se colgó y la gente toca otra vez.
 *
 * Lo que hace: cubre **toda** la interfaz con una fogata, el emblema y
 * «Cargando…», y la retira sola cuando la pantalla nueva está lista.
 *
 * El fuego no es una mancha grande: es una **fogata de quince lenguas**, cada
 * una de distinto tamaño, tono e inclinación, y cada una meciéndose a su propio
 * ritmo. Debajo laten las brasas y encima suben doce chispas. El movimiento
 * viene de muchas piezas desfasadas; una sola mancha enorme se veía como una
 * foto quieta, que es justo lo que no quería el gimnasio.
 *
 * Se enciende **sólo si de verdad hay espera**: espera 120 ms antes de
 * aparecer. Una vez encendida dura al menos 1.1 s —tiempo suficiente para ver
 * una lengua mecerse y varias chispas subir— y se apaga en 320 ms.
 *
 * Reglas que respeta:
 *   · Se activa con un toque en un enlace interno, con «atrás» del navegador o
 *     al volver desde otra app.
 *   · No se queda pegada: si la pantalla nueva no llega en 8 segundos, se apaga.
 *   · Mientras cubre no deja tocar lo de abajo: no se abre dos veces.
 *   · No usa `filter` ni `backdrop-filter`: en celulares Android eso deja
 *     manchas y borrones de GPU. Todo el fuego son degradados y movimientos.
 */

/** Espera antes de mostrar el fuego: si la pantalla abre antes, ni se ve. */
const SHOW_DELAY_MS = 120;
/**
 * Mínimo en pantalla una vez visible. No es capricho: con menos de un segundo
 * el ojo no alcanza a ver las lenguas mecerse y el fuego parece una imagen
 * fija. 1.1 s deja ver un mecido completo y varias chispas subiendo.
 */
const MIN_VISIBLE_MS = 1_100;
/** Desvanecido de salida. */
const FADE_OUT_MS = 320;
/** Si la pantalla nueva no llega, se apaga sola. */
const GIVE_UP_MS = 8_000;
/** Cada cuánto se mira si la dirección ya cambió. */
const POLL_MS = 160;

type Tone = "hot" | "warm" | "deep";

/**
 * Las lenguas del fuego. Cada fila es una llama distinta:
 * `[izquierda %, ancho vw, alto vh, duración s, retraso s, inclinación, tono]`.
 *
 * Los retrasos son negativos a propósito: así, en el primer instante, cada
 * lengua ya está en una parte distinta de su ciclo y no se mueven todas a la
 * vez como un bloque.
 */
const FLAMES: ReadonlyArray<readonly [number, number, number, number, number, number, Tone]> = [
  [-12, 40, 30, 1.9, -0.2, -9, "deep"],
  [-6, 34, 46, 1.5, -0.5, -7, "warm"],
  [0, 28, 38, 1.7, -1.2, -5, "deep"],
  [6, 34, 60, 1.3, -0.3, -3, "warm"],
  [14, 26, 46, 1.6, -1.6, 3, "hot"],
  [20, 38, 72, 1.2, -0.9, -2, "hot"],
  [28, 30, 56, 1.4, -1.4, 4, "warm"],
  [34, 34, 78, 1.1, -0.2, -3, "hot"],
  [42, 28, 62, 1.3, -1.1, 5, "hot"],
  [50, 32, 74, 1.2, -0.6, -4, "warm"],
  [58, 30, 58, 1.5, -1.5, 6, "hot"],
  [64, 34, 68, 1.3, -0.8, -2, "warm"],
  [72, 28, 48, 1.6, -1.3, 5, "deep"],
  [78, 32, 40, 1.8, -0.4, 8, "warm"],
  [86, 26, 30, 1.9, -1.7, 10, "deep"],
];

/** Brasas del piso: `[izquierda %, tamaño vw, duración s, retraso s]`. */
const COALS: ReadonlyArray<readonly [number, number, number, number]> = [
  [9, 11, 1.1, 0],
  [22, 14, 0.9, -0.4],
  [35, 16, 1.3, -0.2],
  [50, 17, 1, -0.7],
  [64, 15, 1.2, -0.3],
  [77, 13, 0.95, -0.6],
  [91, 10, 1.25, -0.15],
];

/** Chispas: `[izquierda %, deriva px, duración s, retraso s]`. */
const EMBERS: ReadonlyArray<readonly [number, number, number, number]> = [
  [7, -26, 2.4, 0],
  [14, 18, 2.9, -0.9],
  [22, -12, 2.1, -1.6],
  [29, 30, 3.1, -0.4],
  [36, -20, 2.6, -1.2],
  [43, 8, 2.2, -1.9],
  [50, -32, 3, -0.6],
  [57, 22, 2.5, -1.5],
  [64, -14, 2.8, -0.2],
  [72, 28, 2.3, -1.1],
  [81, -22, 3.2, -1.8],
  [92, 12, 2.7, -0.7],
];

/** Un enlace que lleva a otra pantalla de esta misma app. */
function navigationTarget(event: MouseEvent): string | null {
  if (event.defaultPrevented) return null;
  // Sólo el toque normal: nada de Ctrl/Cmd, botón del medio ni rueda.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a");
  if (!anchor) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  const href = anchor.getAttribute("href");
  if (!href) return null;

  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // Mismo destino exacto (o sólo un ancla): no hay pantalla que esperar.
  const here = `${window.location.pathname}${window.location.search}`;
  if (`${url.pathname}${url.search}` === here) return null;
  return `${url.pathname}${url.search}`;
}

type Phase = "idle" | "shown" | "leaving";

export function FireTransition() {
  const [phase, setPhase] = useState<Phase>("idle");
  const pathname = usePathname();
  // Los tiempos y el destino viven en refs: así el efecto no se vuelve a montar
  // en cada cambio de estado ni pierde un toque por culpa de un cierre viejo.
  const phaseRef = useRef<Phase>("idle");
  /** Ruta que había cuando se encendió: cuando cambie, la pantalla ya llegó. */
  const startedPath = useRef<string | null>(null);
  /** Última ruta que vio React. Se lee al encender, sin volver a montar nada. */
  const pathnameRef = useRef<string | null>(pathname ?? null);
  /** El apagado del efecto principal, para poder llamarlo desde fuera. */
  const hideRef = useRef<() => void>(() => {});

  useEffect(() => {
    let target: string | null = null;
    let shownAt = 0;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let giveUp: ReturnType<typeof setTimeout> | null = null;
    let hideDelay: ReturnType<typeof setTimeout> | null = null;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (revealTimer) clearTimeout(revealTimer);
      if (poll) clearInterval(poll);
      if (giveUp) clearTimeout(giveUp);
      if (hideDelay) clearTimeout(hideDelay);
      if (fadeTimer) clearTimeout(fadeTimer);
      revealTimer = poll = giveUp = hideDelay = fadeTimer = null;
    };

    const goIdle = () => {
      clearTimers();
      target = null;
      startedPath.current = null;
      phaseRef.current = "idle";
      setPhase("idle");
    };

    const fadeOut = () => {
      if (phaseRef.current !== "shown") return goIdle();
      if (poll) clearInterval(poll);
      if (giveUp) clearTimeout(giveUp);
      if (revealTimer) clearTimeout(revealTimer);
      poll = giveUp = revealTimer = null;
      phaseRef.current = "leaving";
      setPhase("leaving");
      fadeTimer = setTimeout(goIdle, FADE_OUT_MS);
    };

    /** La pantalla nueva ya tomó el control: se retira, respetando el mínimo. */
    const hide = () => {
      // Todavía no se había mostrado: fue tan rápido que no hace falta enseñarla.
      if (phaseRef.current !== "shown") return goIdle();
      if (hideDelay) return;
      const remaining = MIN_VISIBLE_MS - (Date.now() - shownAt);
      hideDelay = setTimeout(fadeOut, Math.max(0, remaining));
    };
    hideRef.current = hide;

    const reveal = () => {
      revealTimer = null;
      if (phaseRef.current !== "idle") return;
      phaseRef.current = "shown";
      shownAt = Date.now();
      setPhase("shown");
    };

    /**
     * `destination` es la dirección del enlace tocado. Con «atrás» no la
     * sabemos (el navegador ya cambió la barra de direcciones), así que se pasa
     * `null` y el apagado lo resuelve el cambio de ruta de React.
     */
    const start = (destination: string | null, giveUpAfter = GIVE_UP_MS) => {
      // Si venía saliendo, se reinicia limpio para la pantalla nueva.
      if (phaseRef.current === "leaving") goIdle();
      if (phaseRef.current === "shown") return;
      clearTimers();
      target = destination;
      // La ruta del hook todavía es la vieja: cuando cambie, se apaga.
      startedPath.current = pathnameRef.current;

      // Se vigila desde el primer instante: si la pantalla llega antes del
      // retardo, no se muestra nada.
      poll = setInterval(() => {
        if (target === null) return;
        const here = `${window.location.pathname}${window.location.search}`;
        if (here === target) hide();
      }, POLL_MS);
      giveUp = setTimeout(() => {
        hideDelay = null;
        fadeOut();
      }, giveUpAfter);
      revealTimer = setTimeout(reveal, SHOW_DELAY_MS);
    };

    const onClick = (event: MouseEvent) => {
      const destination = navigationTarget(event);
      if (destination) start(destination);
    };
    // «Atrás» y «adelante» no disparan un toque, y el navegador ya cambió la
    // dirección antes de avisar: la pantalla nueva se detecta por el cambio de
    // ruta. Si esa ruta no cambia (sólo cambió la consulta), no se le deja
    // colgada los 8 segundos completos.
    const onPopState = () => start(null, 3_000);
    // Al volver de otra app, o si el navegador restaura la página, se apaga.
    const onShow = () => goIdle();

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onShow);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onShow);
      clearTimers();
    };
  }, []);

  // La pantalla nueva ya se dibujó: la ruta del hook cambió. Esto es lo que
  // apaga el fuego cuando se vuelve con «atrás», donde no hay enlace que seguir.
  useEffect(() => {
    pathnameRef.current = pathname ?? null;
    if (startedPath.current === null) return;
    if (pathname && pathname !== startedPath.current) hideRef.current();
  }, [pathname]);

  if (phase === "idle") return null;

  return (
    <div
      className="fire-overlay"
      data-state={phase}
      role="status"
      aria-live="polite"
      aria-label="Cargando la pantalla"
    >
      {/* La fogata: resplandor del piso, quince lenguas que se mecen, brasas que
          laten y chispas que suben. Todo son degradados y movimientos; ningún
          filtro de desenfoque. */}
      <div className="fire-stage" aria-hidden="true">
        <div className="fire-bed" />

        <div className="fire-flames">
          {FLAMES.map(([left, width, height, duration, delay, tilt, tone], index) => (
            <span
              key={`flame-${index}`}
              className={`fire-tongue fire-tongue--${tone}`}
              style={
                {
                  left: `${left}%`,
                  width: `${width}vw`,
                  height: `${height}vh`,
                  "--dur": `${duration}s`,
                  "--delay": `${delay}s`,
                  "--tilt": `${tilt}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <div className="fire-coals">
          <div className="fire-core" />
          {COALS.map(([left, size, duration, delay], index) => (
            <span
              key={`coal-${index}`}
              className="fire-coal"
              style={
                {
                  left: `${left}%`,
                  "--size": `${size}vw`,
                  "--dur": `${duration}s`,
                  "--delay": `${delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <div className="fire-embers">
          {EMBERS.map(([left, drift, duration, delay], index) => (
            <span
              key={`ember-${index}`}
              className="fire-ember"
              style={
                {
                  left: `${left}%`,
                  "--dx": `${drift}px`,
                  "--dur": `${duration}s`,
                  "--delay": `${delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <div className="fire-content">
        <span className="fire-halo" aria-hidden="true" />
        {/* Sin `drop-shadow`: es un filtro, y en Android los filtros dejan
            manchas. El halo oscuro de abajo ya separa el emblema del fuego. */}
        <BrandMark className="size-14" />
        <p className="mt-4 font-display text-[1.05rem] font-extrabold tracking-[0.18em] text-white/95 uppercase">
          Strong Fitness Gym
        </p>
        <p className="mt-1 text-[0.75rem] tracking-[0.22em] text-amber-200/80 uppercase">
          Cargando…
        </p>
        <span className="fire-line mt-5" aria-hidden="true" />
      </div>
    </div>
  );
}
