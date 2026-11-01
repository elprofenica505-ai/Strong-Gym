"use client";

import { useLinkStatus } from "next/link";
import { Flame } from "lucide-react";

/**
 * Giro que se dibuja **sólo mientras ese enlace está navegando**.
 *
 * Se pone adentro del propio `<Link>`: la persona toca una tarjeta, esa tarjeta
 * —y no otra— muestra que está abriendo, y deja de parecer que el toque no
 * entró. Es la respuesta local; la barra de arriba (`NavigationProgress`) da la
 * respuesta general para cualquier enlace.
 */
export function LinkPending({ label = "Cargando…" }: { label?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="inline-flex items-center" role="status">
      <Flame className="fire-flame size-3.5 text-amber-400" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
