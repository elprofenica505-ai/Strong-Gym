"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/layout/brand-mark";

/**
 * Transición de fuego a pantalla completa.
 *
 * El problema: al cambiar de módulo, Next tiene que renderizar la pantalla en el
 * servidor y en el celular se ve un instante de quietud. Esa pausa parece que la
 * app se colgó y la gente toca otra vez.
 *
 * Lo que hace: cubre **toda** la interfaz con una capa de fuego, el emblema y
 * «Cargando…», y la retira sola cuando la pantalla nueva está lista. Cubrir —en
 * vez de dejar ver la pantalla vieja a medio pintar— hace que el cambio se
 * sienta como una transición intencional y no como una espera.
 *
 * Se enciende **sólo si de verdad hay espera**: la capa espera 140 ms antes de
 * aparecer, así una pantalla que ya está en caché y abre al instante no muestra
 * ningún fuego. En el celular, donde el renderizado del servidor tarda, aparece
 * y se queda hasta que la pantalla nueva toma el control.
 *
 * Reglas que respeta:
 *   · Se activa con un toque en un enlace interno, con «atrás» del navegador o
 *     al volver desde otra app.
 *   · No se queda pegada: si la dirección no cambia en 8 segundos, se apaga.
 *   · Una vez visible dura al menos 480 ms y se desvanece en 260 ms, para que no
 *     parpadee.
 *   · Mientras cubre no deja tocar lo de abajo: no se abre dos veces.
 *   · No usa `filter` ni `backdrop-filter`: en celulares Android eso deja
 *     manchas y borrones de GPU. Todo el fuego son degradados y movimientos.
 */

/** Espera antes de mostrar el fuego: si la pantalla abre antes, ni se ve. */
const SHOW_DELAY_MS = 140;
/** Mínimo en pantalla una vez visible, para que no sea un parpadeo. */
const MIN_VISIBLE_MS = 480;
/** Desvanecido de salida. */
const FADE_OUT_MS = 260;
/** Si la navegación no se concreta, se apaga sola. */
const GIVE_UP_MS = 8_000;
/** Cada cuánto se mira si la dirección ya cambió. */
const POLL_MS = 160;

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
  // Los tiempos y el destino viven en refs: así el efecto no se vuelve a montar
  // en cada cambio de estado ni pierde un toque por culpa de un cierre viejo.
  const phaseRef = useRef<Phase>("idle");

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

    const reveal = () => {
      revealTimer = null;
      if (phaseRef.current !== "idle") return;
      phaseRef.current = "shown";
      shownAt = Date.now();
      setPhase("shown");
    };

    const start = (destination: string) => {
      // Si venía saliendo, se reinicia limpio para la pantalla nueva.
      if (phaseRef.current === "leaving") goIdle();
      if (phaseRef.current === "shown") return;
      clearTimers();
      target = destination;

      // Se vigila desde el primer instante: si la pantalla llega antes del
      // retardo, no se muestra nada.
      poll = setInterval(() => {
        const here = `${window.location.pathname}${window.location.search}`;
        if (target === null || here === target) hide();
      }, POLL_MS);
      giveUp = setTimeout(() => {
        hideDelay = null;
        fadeOut();
      }, GIVE_UP_MS);
      revealTimer = setTimeout(reveal, SHOW_DELAY_MS);
    };

    const onClick = (event: MouseEvent) => {
      const destination = navigationTarget(event);
      if (destination) start(destination);
    };
    // «Atrás» y «adelante» no disparan un toque.
    const onPopState = () => start(`${window.location.pathname}${window.location.search}`);
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

  if (phase === "idle") return null;

  return (
    <div
      className="fire-overlay"
      data-state={phase}
      role="status"
      aria-live="polite"
      aria-label="Cargando la pantalla"
    >
      {/* Capa de fuego: lecho de brasas, cinco lenguas que suben y se mecen, el
          núcleo caliente, chispas y un velo suave para leer el texto. Todo son
          degradados y movimiento; ningún filtro de desenfoque. */}
      <div className="fire-stage" aria-hidden="true">
        <div className="fire-bed" />
        <div className="fire-tongue fire-tongue-5" />
        <div className="fire-tongue fire-tongue-1" />
        <div className="fire-tongue fire-tongue-2" />
        <div className="fire-tongue fire-tongue-3" />
        <div className="fire-tongue fire-tongue-4" />
        <div className="fire-core" />
        <div className="fire-embers">
          <span className="fire-ember" style={{ left: "12%", animationDelay: "0s" }} />
          <span className="fire-ember" style={{ left: "26%", animationDelay: "0.7s" }} />
          <span className="fire-ember" style={{ left: "41%", animationDelay: "1.4s" }} />
          <span className="fire-ember" style={{ left: "57%", animationDelay: "0.35s" }} />
          <span className="fire-ember" style={{ left: "68%", animationDelay: "1.9s" }} />
          <span className="fire-ember" style={{ left: "83%", animationDelay: "1.05s" }} />
          <span className="fire-ember" style={{ left: "92%", animationDelay: "2.3s" }} />
        </div>
        <div className="fire-vignette" />
      </div>

      <div className="fire-content">
        <BrandMark className="size-14 drop-shadow-[0_10px_30px_rgba(216,26,34,0.55)]" />
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
