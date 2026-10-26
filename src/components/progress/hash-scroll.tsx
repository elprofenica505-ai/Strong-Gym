"use client";

import { useEffect } from "react";

/**
 * Al llegar a la página con un destino en la dirección (por ejemplo
 * #asistencia desde la ficha del cliente), baja hasta esa sección.
 * La navegación interna de la app no siempre hace ese salto sola y la
 * persona quedaba arriba, en Medidas, creyendo que abrió otra cosa.
 */
export function HashScroll() {
  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id) return;
    const go = () =>
      document.getElementById(id)?.scrollIntoView?.({ block: "start" });
    go();
    const timer = setTimeout(go, 350);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
