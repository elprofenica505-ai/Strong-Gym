"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { ExerciseFigure } from "@/components/exercises/exercise-figure";
import { figureMotion, type ExerciseFrames } from "@/lib/exercises/figure";

/**
 * El movimiento de la ficha (EX-01), con su interruptor.
 *
 * La imagen se mueve sola en todos los dispositivos: el movimiento lo hace el
 * componente, no una animación de CSS que dependa de la configuración del
 * teléfono. Da igual si la ficha tiene dos fotos para alternar o una sola que
 * se acerca y se aleja: en los dos casos hay botón. Este botón sirve para lo
 * contrario que antes: **parar** el movimiento si a alguien le molesta.
 */
export function ExerciseMotion({
  name,
  frames,
  className = "",
  tone,
  variant = "detail",
}: {
  name: string;
  frames: ExerciseFrames;
  className?: string;
  /** Color de la familia de equipo: mismo lenguaje que la grilla. */
  tone?: string;
  /** En la ficha se pide la foto grande; la tarjeta usa la chica. */
  variant?: "card" | "detail";
}) {
  const [playing, setPlaying] = useState(true);
  // El botón sirve para las dos formas de movimiento: alternar dos fotos y el
  // acercamiento suave de las fichas que sólo tienen una.
  const seMueve = figureMotion(frames) !== "none";

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        {tone ? <span aria-hidden="true" className="block h-[3px] w-full" style={{ backgroundColor: tone }} /> : null}
        <ExerciseFigure name={name} frames={frames} className={className} playing={playing} variant={variant} />
      </div>
      {seMueve ? (
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          aria-pressed={!playing}
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-brand"
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {playing ? "Pausar movimiento" : "Ver movimiento"}
        </button>
      ) : null}
    </div>
  );
}
