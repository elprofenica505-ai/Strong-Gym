"use client";

import { useState } from "react";
import { Play, Square } from "lucide-react";
import { ExerciseFigure, exerciseFrames, type ExerciseFrames } from "@/components/exercises/exercise-figure";

/**
 * El movimiento de la ficha (EX-01), a pedido.
 *
 * El catálogo publica dos fotos de cada ejercicio —posición inicial y final— y
 * la pantalla las alterna sola. Pero si el teléfono tiene activado «reducir
 * movimiento», la animación queda apagada por accesibilidad, y el socio cree
 * que la imagen está rota. Este botón le devuelve el control: él decide si
 * quiere ver el movimiento.
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
  const [force, setForce] = useState(false);
  const { animated } = exerciseFrames(frames);

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        {tone ? <span aria-hidden="true" className="block h-[3px] w-full" style={{ backgroundColor: tone }} /> : null}
        <ExerciseFigure name={name} frames={frames} className={className} force={force} />
      </div>
      {animated ? (
        <button
          type="button"
          onClick={() => setForce((value) => !value)}
          aria-pressed={force}
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-brand"
        >
          {force ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
          {force ? "Detener movimiento" : "Ver movimiento"}
        </button>
      ) : null}
    </div>
  );
}
