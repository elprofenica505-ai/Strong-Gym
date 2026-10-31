import { NextResponse } from "next/server";
import {
  canAccessPanel,
  isFinanceRole,
} from "@/lib/auth/current-user";
import {
  staffBookingStatusRequestSchema,
  staffBookingStatusResultSchema,
} from "@/lib/admin/booking-status";
import { getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

const messages: Record<string, [string, number]> = {
  AUTH: [
    "Sólo administración o caja con verificación en dos pasos puede cambiar el estado de una reserva.",
    403,
  ],
  INVALID_STATUS: [
    "Ese estado de reserva no es válido. No se cambió la reserva.",
    422,
  ],
  INVALID_TRANSITION: [
    "Una reserva cancelada no se puede cambiar desde Operación. La persona debe volver a reservar si todavía hay lugar.",
    409,
  ],
  STALE_STATUS: [
    "Otra persona ya cambió esta reserva. Revisá su estado actual antes de volver a tocarla.",
    409,
  ],
  NOT_FOUND: ["No encontramos esa reserva. No se cambió nada.", 404],
  FULL: [
    "No se puede volver a marcar como asistida porque el cupo de la clase ya está completo.",
    409,
  ],
  SESSION_CANCELLED: [
    "La clase fue cancelada por el gimnasio; esa reserva sólo puede quedar cancelada.",
    409,
  ],
  SESSION_ENDED: [
    "La clase ya terminó. Marcá la reserva como asistida o ausente, no como cancelada.",
    409,
  ],
  SETUP_REQUIRED: [
    "Falta instalar la actualización de estados de reservas en la base. No se cambió la reserva.",
    503,
  ],
};

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}


/**
 * Cambia una reserva a asistida, ausente o cancelada por administración.
 * La API exige la misma sesión que la pantalla de Operación y la RPC vuelve
 * a validar rol+MFA, transición, estado esperado, sesión y cupo.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return reply({ error: "AUTH", message: "Origen no permitido." }, 403);
  }

  if (!isSupabaseConfigured) {
    return reply(
      {
        error: "SETUP_REQUIRED",
        message: messages.SETUP_REQUIRED[0],
      },
      503,
    );
  }

  const user = await getCurrentUser();
  if (!user || !canAccessPanel(user) || !isFinanceRole(user.role)) {
    return reply({ error: "AUTH", message: messages.AUTH[0] }, 403);
  }

  const parsed = staffBookingStatusRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return reply(
      { error: "INVALID_STATUS", message: messages.INVALID_STATUS[0] },
      422,
    );
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return reply(
      { error: "SETUP_REQUIRED", message: messages.SETUP_REQUIRED[0] },
      503,
    );
  }

  const { data, error } = await supabase
    .rpc("staff_set_booking_status", {
      p_booking_id: parsed.data.bookingId,
      p_status: parsed.data.status,
      p_expected_status: parsed.data.expectedStatus,
    })
    .abortSignal(AbortSignal.timeout(15000));

  if (error) return failure(error);

  const result = staffBookingStatusResultSchema.safeParse(data);
  if (
    !result.success ||
    result.data.id !== parsed.data.bookingId ||
    result.data.status !== parsed.data.status
  ) {
    console.error("[admin/bookings] respuesta inválida de la RPC");
    return reply(
      {
        error: "UNKNOWN",
        message:
          "No pudimos confirmar el estado guardado. Recargá la página antes de repetir el cambio.",
      },
      500,
    );
  }

  return reply({
    ok: true,
    bookingId: result.data.id,
    sessionId: result.data.session_id,
    status: result.data.status,
    previousStatus: result.data.previous_status,
    changed: result.data.changed,
    cancelledAt: result.data.cancelled_at,
  });
}

function failure(error: { code?: string; message?: string }) {
  if (["PGRST202", "42883"].includes(error.code ?? "")) {
    return reply(
      { error: "SETUP_REQUIRED", message: messages.SETUP_REQUIRED[0] },
      503,
    );
  }

  const code = /^[A-Z_]{3,30}$/.test(error.message ?? "")
    ? (error.message as string)
    : "UNKNOWN";
  const known = messages[code];
  if (known) return reply({ error: code, message: known[0] }, known[1]);

  console.error("[admin/bookings] staff_set_booking_status falló", {
    code: error.code,
  });
  return reply(
    {
      error: "UNKNOWN",
      message:
        "No se pudo guardar el estado de la reserva. Quedó como estaba; recargá antes de reintentar.",
    },
    500,
  );
}
