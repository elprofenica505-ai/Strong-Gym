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
 * El fuego es **fotografía real de llamas**, no formas dibujadas: tres capas
 * de textura (lejos, medio y cerca) recortadas en lenguas con punta suave y
 * montadas una sobre otra. Cada capa entra dos veces —la segunda corrida a un
 * lado y con la animación desfasada— y cada una se mece a su propio ritmo
 * (1.3–2.2 s): al cruzarse las dos copias, las llamas se estiran y se encogen
 * como fuego de verdad. Ese es el punto: en las versiones anteriores las llamas
 * eran manchas y siluetas dibujadas en CSS, y frente a la referencia del dueño
 * se veían planas.
 * Las texturas están en `public/fire/` y pesan ~300 KB en total (WebP).
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

/**
 * Las tres capas del fuego, de la más lejana a la más cercana.
 *
 * `sway` es el ritmo del mecido y `boil` el del cruce entre las dos copias.
 * Los ritmos son distintos en cada capa a propósito: si coincidieran, el fuego
 * se movería como un bloque y volvería a parecer una foto.
 */
const LAYERS = [
  { file: "/fire/fuego-lejos.webp", className: "fire-layer--far", sway: 2.2, boil: 2.4, opacity: 0.75 },
  { file: "/fire/fuego-medio.webp", className: "fire-layer--mid", sway: 1.7, boil: 1.8, opacity: 0.92 },
  { file: "/fire/fuego-cerca.webp", className: "fire-layer--near", sway: 1.3, boil: 1.35, opacity: 1 },
] as const;

/**
 * Una capa de fuego.
 *
 * La misma textura entra dos veces: la segunda corrida a un lado y con la
 * animación a media vuelta. Mientras una copia se apaga, la otra se enciende, y
 * como no coinciden, las puntas de las llamas cambian de forma: el fuego deja
 * de verse quieto sin necesidad de un video.
 */
function FireLayer({ layer }: { layer: (typeof LAYERS)[number] }) {
  return (
    <div
      className={`fire-layer ${layer.className}`}
      style={
        {
          "--sway": `${layer.sway}s`,
          "--boil": `${layer.boil}s`,
          "--layer-opacity": `${layer.opacity}`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="fire-layer-img" style={{ backgroundImage: `url(${layer.file})` }} />
      {/* Segunda copia, corrida a un lado y desfasada: sus llamas no coinciden
          con las de la otra, así el fuego hierve en vez de deslizarse. */}
      <span
        className="fire-layer-img fire-layer-img--offset"
        style={{ backgroundImage: `url(${layer.file})` }}
      />
    </div>
  );
}

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

  // Las texturas se piden apenas se monta la capa: pesan ~300 KB en total y así
  // ya están listas para el primer cambio de pantalla.
  useEffect(() => {
    for (const layer of LAYERS) {
      const img = new Image();
      img.src = layer.file;
    }
  }, []);
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
      {/* La fogata: tres capas de fuego real que se mecen, resplandor del piso y
          chispas que suben. Sólo degradados, texturas y movimientos; ningún
          filtro de desenfoque. */}
      <div className="fire-stage" aria-hidden="true">
        {/* Calor del piso: un resplandor suave detrás de las llamas. */}
        <div className="fire-glow" />

        <div className="fire-fires">
          {LAYERS.map((layer) => (
            <FireLayer key={layer.className} layer={layer} />
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
