"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cronómetro de descanso (EX-01).
 *
 * El socio lo arranca al terminar la serie y le avisa cuándo seguir. No guarda
 * nada ni suena si el teléfono está en silencio: la cuenta vive en la pantalla
 * y, al llegar a cero, muestra «Descanso terminado» y vibra si el navegador lo
 * permite.
 */
export function ExerciseTimer({ seconds = 60 }: { seconds?: number }) {
  const [total, setTotal] = useState(seconds);
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const announced = useRef(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((current) => {
        if (current <= 1) {
          setRunning(false);
          setDone(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Un aviso corto al terminar: no suena música ni abre diálogos.
  useEffect(() => {
    if (!done || announced.current) return;
    announced.current = true;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // Sin vibración: el texto igual avisa.
    }
  }, [done]);

  const reset = (next = total) => {
    setRunning(false);
    setDone(false);
    announced.current = false;
    setLeft(next);
  };

  const minutes = Math.floor(left / 60);
  const secondsLeft = left % 60;
  const label = `${minutes}:${String(secondsLeft).padStart(2, "0")}`;
  const progress = total > 0 ? 1 - left / total : 0;

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        <Timer className="size-4 text-brand" aria-hidden="true" />
        <p className="text-sm font-semibold text-ink">Reloj de descanso</p>
      </div>
      <p
        className={cn(
          "mt-2 font-mono text-[2.5rem] leading-none font-bold tabular-nums",
          done ? "text-brand-300" : "text-ink",
        )}
        role="timer"
        aria-live="polite"
      >
        {label}
      </p>
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-[0.75rem] text-fog">
        {done ? "Descanso terminado: seguí con la próxima serie." : "Arrancalo cuando termines la serie."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setDone(false);
            announced.current = false;
            setRunning((value) => !value);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-onbrand transition-opacity hover:opacity-90"
        >
          {running ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          {running ? "Pausar" : left === 0 ? "Otra vez" : "Arrancar"}
        </button>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Reiniciar
        </button>
        {[45, 60, 90, 120].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setTotal(option);
              reset(option);
            }}
            aria-pressed={total === option}
            className={cn(
              "rounded-full px-3 py-2 text-xs font-semibold transition-colors",
              total === option
                ? "bg-brand text-onbrand"
                : "border border-line bg-paper text-ink hover:border-brand",
            )}
          >
            {option < 60 ? `${option} s` : `${option / 60} min`}
          </button>
        ))}
      </div>
    </div>
  );
}
