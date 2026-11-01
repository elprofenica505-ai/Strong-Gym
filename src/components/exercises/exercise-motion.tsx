"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { ExerciseFigure } from "@/components/exercises/exercise-figure";
import { exerciseFrames, type ExerciseFrames } from "@/lib/exercises/figure";

/**
 * El movimiento de la ficha (EX-01), con su interruptor.
 *
 * La imagen se mueve sola en todos los dispositivos: el cambio de foto lo hace
 * el componente, no una animación de CSS que dependa de la configuración del
 * teléfono. Este botón sirve para lo contrario que antes: **parar** el
 * movimiento si a alguien le molesta.
 */
export function ExerciseMotion({
  name,
  frames,
  className = "",
  tone,
}: {
  name: string;
  frames: ExerciseFrames;
  className?: string;
  /** Color de la familia de equipo: mismo lenguaje que la grilla. */
  tone?: string;
}) {
  const [playing, setPlaying] = useState(true);
  const { animated } = exerciseFrames(frames);

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        {tone ? <span aria-hidden="true" className="block h-[3px] w-full" style={{ backgroundColor: tone }} /> : null}
        <ExerciseFigure name={name} frames={frames} className={className} playing={playing} />
      </div>
      {animated ? (
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
