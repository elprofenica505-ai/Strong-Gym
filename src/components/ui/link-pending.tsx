"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui/spinner";

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
  return <Spinner size="sm" label={label} className="text-current" />;
}
