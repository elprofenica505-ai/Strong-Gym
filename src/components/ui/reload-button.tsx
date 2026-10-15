"use client";

import { Button } from "@/components/ui/button";

/**
 * Botón que recarga la página actual. Útil para la pantalla offline:
 * el SW no puede reintentar solo cuando vuelve la red, así que le
 * damos al usuario un botón explícito que dispara `location.reload()`.
 */
export function ReloadButton({ label }: { label: string }) {
  return (
    <Button
      size="lg"
      onClick={() => {
        // `typeof window` no hace falta acá porque el componente es
        // client y solo se renderiza en el navegador.
        window.location.reload();
      }}
    >
      {label}
    </Button>
  );
}
