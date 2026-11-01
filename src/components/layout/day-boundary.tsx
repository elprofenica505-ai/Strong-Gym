"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  dayChanged,
  managuaDayKey,
  msUntilNextDayChange,
} from "@/lib/time/day-boundary";

/**
 * Refresca las pantallas cuando cambia el día en Managua (OP-07).
 *
 * Por qué existe: Horarios, el Panel y Mi cuenta calculan «hoy» al montar. Si
 * la tablet del gimnasio queda abierta y pasa la medianoche, la pantalla sigue
 * mostrando el día anterior.
 *
 * Cómo funciona:
 *   · Guarda la fecha de Managua con la que se pintó la pantalla.
 *   · Programa un temporizador hasta la próxima medianoche (con tope de 15
 *     minutos, por si el aparato estuvo suspendido).
 *   · Al dispararse, y también cuando la pestaña vuelve a primer plano, si la
 *     fecha cambió pide `router.refresh()`: se vuelven a leer los datos del
 *     servidor **sin recargar** y sin perder lo que se estaba escribiendo.
 *   · Si la fecha no cambió, no hace nada: no hay refrescos de más.
 */
export function DayBoundary() {
  const router = useRouter();
  const currentDay = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentDay.current = managuaDayKey();

    const check = () => {
      if (dayChanged(currentDay.current)) {
        currentDay.current = managuaDayKey();
        router.refresh();
      }
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        check();
        schedule();
      }, msUntilNextDayChange());
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        check();
        schedule();
      }
    };

    const onFocus = () => {
      check();
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [router]);

  return null;
}
