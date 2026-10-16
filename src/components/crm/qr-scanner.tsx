"use client";
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { parseCard } from "@/lib/crm/types";
export function QrScanner({
  onRead,
  disabled = false,
}: {
  onRead: (token: string) => Promise<void>;
  disabled?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation = useRef(0);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [value, setValue] = useState("");
  const stop = () => {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject;
    if (typeof MediaStream !== "undefined" && stream instanceof MediaStream)
      stream.getTracks().forEach((track) => track.stop());
    if (video.current) video.current.srcObject = null;
    setRunning(false);
  };
  useEffect(
    () => () => {
      generation.current++;
      controls.current?.stop();
      const stream = video.current?.srcObject;
      if (stream && typeof (stream as MediaStream).getTracks === "function")
        (stream as MediaStream).getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function submit(raw: string) {
    if (disabled) return;
    stop();
    const token = parseCard(raw);
    if (!token) {
      setMessage("Este no es un QR de cliente Strong. Usá la búsqueda manual.");
      return;
    }
    try {
      await onRead(token);
      setMessage(
        "QR leído. Confirmá el nombre antes de registrar la entrada o cobrar.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo buscar el QR.");
    }
  }
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setMessage("Cámara no disponible. Usá HTTPS o la búsqueda manual.");
      return;
    }
    setRunning(true);
    setMessage("");
    const attempt = ++generation.current;
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (generation.current !== attempt || !video.current) return;
      let read = false;
      const ctl = await new BrowserQRCodeReader().decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video.current,
        (result, _error, scanner) => {
          if (!result || read || generation.current !== attempt) return;
          read = true;
          scanner.stop();
          void submit(result.getText());
        },
      );
      if (generation.current !== attempt) ctl.stop();
      else controls.current = ctl;
    } catch {
      if (generation.current === attempt) {
        stop();
        setMessage(
          "No pudimos abrir la cámara. Revisá el permiso o buscá al cliente manualmente.",
        );
      }
    }
  }
  return (
    <section
      className="rounded-2xl border border-line bg-card p-5 space-y-3"
      aria-label="Escáner de recepción"
    >
      <h2 className="text-lg font-bold">Escanear en caja / recepción</h2>
      <p className="text-sm text-fog">
        El QR sólo abre la ficha. No registra entradas ni cobra automáticamente.
      </p>
      <video
        ref={video}
        muted
        playsInline
        className={
          running ? "aspect-video w-full rounded-xl bg-black" : "hidden"
        }
        aria-label="Vista de cámara para escanear QR"
      />
      <Button
        type="button"
        disabled={disabled}
        onClick={() => (running ? stop() : void start())}
      >
        {running ? "Detener cámara" : "Abrir cámara"}
      </Button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(value);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label className="flex-1 text-xs text-fog">
          Lector USB o código copiado
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-line bg-paper p-3 text-ink"
            placeholder="strong-gym:client:…"
            maxLength={100}
          />
        </label>
        <Button
          type="submit"
          disabled={disabled}
          variant="outline"
          className="self-end"
        >
          Buscar QR
        </Button>
      </form>
      {message && (
        <p role="status" className="text-sm text-brand-300">
          {message}
        </p>
      )}
    </section>
  );
}
