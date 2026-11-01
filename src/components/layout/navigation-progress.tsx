"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";

/**
 * Barra de avance al cambiar de pantalla.
 *
 * El problema que resuelve: en el celular, tocar una tarjeta o un módulo dejaba
 * la pantalla quieta uno o dos segundos —a veces más— sin ninguna señal. La
 * persona creía que la app se había pegado y volvía a tocar, y así se pedían dos
 * pantallas a la vez.
 *
 * Cómo funciona: escucha el toque en cualquier enlace interno y, **sin cancelar
 * nada**, muestra arriba una cinta de brasas y un cartelito con «Cargando…»
 * hasta que la dirección del navegador cambia. Si algo falla y la dirección no
 * cambia, se apaga sola a los 12 segundos para no quedarse pegada mintiendo.
 *
 * Lo que **no** hace: no tapa la pantalla ni la vacía. Lo que había sigue a la
 * vista, legible, mientras se trae lo nuevo. Nada de bloques grises: el
 * reemplazo por esqueletos se probó y daba sensación de pausa y de lentitud;
 * el gimnasio pidió volver a ver el contenido con un aviso mínimo encima.
 *
 * Lo que no hace: no bloquea el enlace, no cambia la navegación y no toca el
 * teclado ni los formularios.
 */

const GIVE_UP_MS = 12_000;

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
  const current = `${window.location.pathname}${window.location.search}`;
  if (`${url.pathname}${url.search}` === current) return null;
  return `${url.pathname}${url.search}`;
}

export function NavigationProgress() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let target: string | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let giveUp: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      target = null;
      if (timer) clearInterval(timer);
      if (giveUp) clearTimeout(giveUp);
      timer = null;
      giveUp = null;
      setPending(false);
    };

    const start = (destination: string) => {
      if (timer) clearInterval(timer);
      if (giveUp) clearTimeout(giveUp);
      target = destination;
      setPending(true);
      // La dirección cambia cuando la navegación se confirma; ahí se apaga.
      timer = setInterval(() => {
        const here = `${window.location.pathname}${window.location.search}`;
        if (target === null || here === target) stop();
      }, 250);
      giveUp = setTimeout(stop, GIVE_UP_MS);
    };

    const onClick = (event: MouseEvent) => {
      const destination = navigationTarget(event);
      if (destination) start(destination);
    };
    // Volver atrás no dispara un toque: también se confirma al cambiar la URL.
    const onPopState = () => start(`${window.location.pathname}${window.location.search}`);

    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", stop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", stop);
      if (timer) clearInterval(timer);
      if (giveUp) clearTimeout(giveUp);
    };
  }, []);

  if (!pending) return null;

  return (
    <div role="status" aria-live="polite" className="pointer-events-none">
      {/*
        Cascada de brasas: dos capas de gradiente a distinta velocidad sobre el
        borde de arriba. Es fuego de marca —rojo, naranja y ámbar—, ocupa 3 px y
        no tapa nada de lo que se está leyendo.
      */}
      <div className="fire-bar fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
        <span className="fire-bar-slow absolute inset-0" aria-hidden="true" />
        <span className="fire-bar-fast absolute inset-0" aria-hidden="true" />
        <span className="fire-spark fire-spark-1" aria-hidden="true" />
        <span className="fire-spark fire-spark-2" aria-hidden="true" />
        <span className="fire-spark fire-spark-3" aria-hidden="true" />
      </div>

      {/* El cartelito va abajo y no arriba: arriba está el logo y el menú, y
          taparlos con un aviso se siente peor que no tener aviso. */}
      <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-card/95 px-3 py-1.5 text-[0.75rem] font-semibold text-ink shadow-[0_8px_22px_-10px_rgba(249,115,22,0.8)] backdrop-blur-sm">
          <Flame className="fire-flame size-3.5 text-amber-400" aria-hidden="true" />
          Cargando…
        </span>
      </div>
    </div>
  );
}
