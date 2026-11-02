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
 * El fuego son **lenguas dibujadas**, no manchas: cada llama es una silueta
 * ondulada con punta afilada —la forma de la referencia que aprobó el
 * gimnasio—, siete principales y cuatro mechones sueltos arriba. Cada una se
 * mece a su propio ritmo (1.4–1.9 s), cambia de ancho y de alto, y lleva encima
 * un núcleo amarillo y un halo naranja. Nada de esferas grandes abajo: en la
 * versión anterior eso se veía como una «pelota de fuego» y no le gustó.
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
 * Una lengua del fuego.
 *
 *   left    centro de la llama, % del ancho de la pantalla
 *   height  alto, % del alto de la pantalla
 *   width   ancho, % del ancho de la pantalla
 *   sway    cuánto se mece la punta (fracción del alto)
 *   waves   cantidad de ondas de la silueta: más ondas, llama más retorcida
 *   phase   desfase de la ondulación, para que no sean todas iguales
 *   lean    inclinación general de la punta (fracción del ancho)
 *   dur/de  ritmo del mecido y retraso (en negativo: arrancan desfasadas)
 *   motion  cuál de los tres mecidos usa (a/b/c), para que no vayan al unísono
 */
type Flame = {
  left: number;
  height: number;
  width: number;
  sway: number;
  waves: number;
  phase: number;
  lean: number;
  dur: number;
  delay: number;
  motion: "a" | "b" | "c";
};

/** Las siete lenguas principales, repartidas de borde a borde y traslapadas
 *  para que el pie del fuego se lea como una masa continua, sin huecos. */
const FLAMES: readonly Flame[] = [
  { left: 3, height: 26, width: 34, sway: 0.16, waves: 1.1, phase: 0.4, lean: -0.03, dur: 1.9, delay: -0.3, motion: "a" },
  { left: 19, height: 40, width: 38, sway: 0.2, waves: 1.3, phase: 1.6, lean: 0.02, dur: 1.5, delay: -1.1, motion: "b" },
  { left: 34, height: 33, width: 36, sway: 0.15, waves: 1.05, phase: 2.6, lean: -0.02, dur: 1.7, delay: -0.6, motion: "c" },
  { left: 50, height: 46, width: 42, sway: 0.22, waves: 1.25, phase: 0.9, lean: 0.01, dur: 1.45, delay: -1.6, motion: "a" },
  { left: 66, height: 36, width: 38, sway: 0.18, waves: 1.15, phase: 2.1, lean: -0.02, dur: 1.65, delay: -0.9, motion: "b" },
  { left: 81, height: 42, width: 38, sway: 0.2, waves: 1.35, phase: 1.2, lean: 0.03, dur: 1.55, delay: -1.4, motion: "c" },
  { left: 97, height: 28, width: 34, sway: 0.17, waves: 1.05, phase: 3, lean: -0.02, dur: 1.85, delay: -0.2, motion: "a" },
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

/**
 * Silueta de una llama, en una caja de 0 a 100 (se estira a la caja real).
 *
 * Se dibuja una columna de puntos: en cada altura `t` se calcula cuánto se
 * desvía el centro (la espina ondulada) y cuánto mide el ancho. El ancho nace
 * grande en la base, hace cintura y termina en punta, así la forma se lee como
 * una llama y no como un óvalo.
 */
function flamePath({ sway, waves, phase, lean }: Pick<Flame, "sway" | "waves" | "phase" | "lean">): string {
  const STEPS = 40;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS; // 0 = base, 1 = punta
    const y = 100 - 100 * t;
    // La ondulación crece hacia arriba: en la base el fuego es ancho y quieto.
    const wobble = Math.sin(t * Math.PI * 2 * waves + phase);
    const drift = lean * 100 * Math.pow(t, 1.7) + sway * 100 * wobble * Math.pow(t, 1.3);
    const x = 50 + drift;
    // Perfil: base llena —las llamas se tocan entre sí, sin huecos oscuros al
    // pie—, un ensanche redondeado a un tercio de altura y una punta larga que
    // se afina hasta desaparecer. Con una punta corta la forma se leía como un
    // huevo, no como una llama.
    const body = Math.min(1, Math.pow(1 - t, 1.3) * (0.85 + 0.35 * Math.sin(Math.PI * t * 1.2 + 0.4)));
    const half = 50 * Math.max(body, 0.002);
    left.push([x - half, y]);
    right.push([x + half, y]);
  }
  const pt = ([x, y]: [number, number]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return [
    `M ${pt(left[0])}`,
    ...left.slice(1).map((p) => `L ${pt(p)}`),
    ...right.slice(0, -1).reverse().map((p) => `L ${pt(p)}`),
    "Z",
  ].join(" ");
}

/** Una llama completa: halo, cuerpo y núcleo, en su caja. */
function FlameShape({ flame }: { flame: Flame }) {
  const d = flamePath(flame);
  return (
    <span
      className="fire-flame-tongue"
      style={
        {
          left: `${flame.left}%`,
          width: `${flame.width}vw`,
          height: `${flame.height}vh`,
          "--dur": `${flame.dur}s`,
          "--delay": `${flame.delay}s`,
          "--motion": `flame-${flame.motion}`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Halo ancho y tenue: da volumen sin ningún desenfoque. */}
        <path d={d} transform="translate(50 100) scale(1.9 1.05) translate(-50 -100)" fill="url(#fire-halo)" opacity="0.16" />
        {/* Cuerpo de la llama. */}
        <path d={d} fill="url(#fire-flame)" />
        {/* Núcleo caliente: más angosto y más bajo. */}
        <path d={d} transform="translate(50 100) scale(0.5 0.8) translate(-50 -100)" fill="url(#fire-core)" opacity="0.9" />
      </svg>
    </span>
  );
}

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
        {/* Los degradados del fuego. Van una sola vez: las siete lenguas los
            comparten por id. */}
        <svg className="fire-defs" width="0" height="0" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="fire-flame" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#fde68a" stopOpacity="0.98" />
              <stop offset="0.16" stopColor="#fbbf24" stopOpacity="0.97" />
              <stop offset="0.34" stopColor="#f97316" stopOpacity="0.94" />
              <stop offset="0.52" stopColor="#ea580c" stopOpacity="0.86" />
              <stop offset="0.7" stopColor="#dc2626" stopOpacity="0.62" />
              <stop offset="0.86" stopColor="#b91c1c" stopOpacity="0.3" />
              <stop offset="1" stopColor="#7f1d1d" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="fire-core" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#fffbeb" stopOpacity="1" />
              <stop offset="0.35" stopColor="#fef08a" stopOpacity="0.9" />
              <stop offset="0.7" stopColor="#fdba74" stopOpacity="0.45" />
              <stop offset="1" stopColor="#f97316" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="fire-halo" cx="0.5" cy="1" r="0.75">
              <stop offset="0" stopColor="#f97316" stopOpacity="0.6" />
              <stop offset="0.45" stopColor="#ea580c" stopOpacity="0.28" />
              <stop offset="1" stopColor="#b91c1c" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>

        {/* Calor del piso: un resplandor suave detrás de las llamas, sin esferas. */}
        <div className="fire-glow" />

        <div className="fire-fires">
          {FLAMES.map((flame, index) => (
            <FlameShape key={`flame-${index}`} flame={flame} />
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
