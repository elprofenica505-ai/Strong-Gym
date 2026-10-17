import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

/**
 * Endpoint antiguo retirado definitivamente. Inferir propiedad de datos por
 * correo, concepto o IDs de entrenadores no permite una limpieza segura.
 * La entrega usa SQL revisado, respaldo y aprobación explícita del dueño.
 * No importar aquí un cliente de escritura ni restaurar el borrado por prefijos.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      {
        error: "AUTH",
        message: "Sólo el administrador puede preparar la entrega.",
      },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json(
    {
      error: "RESET_RETIRED",
      message:
        "El borrado automático por correos, prefijos o IDs fue retirado por seguridad. La limpieza final requiere respaldo, revisión de relaciones y saldos, acceso del dueño verificado y SQL aprobado. No se borró ningún dato.",
    },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}
