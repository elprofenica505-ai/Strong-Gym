import { NextResponse } from "next/server";
import { canAccessPanel, isFinanceRole } from "@/lib/auth/current-user";
import {
  staffMessageReadRequestSchema,
  staffMessageReadResultSchema,
} from "@/lib/admin/message-read";
import { getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

const messages: Record<string, [string, number]> = {
  AUTH: [
    "Sólo administración o caja con verificación en dos pasos puede marcar consultas como leídas o no leídas.",
    403,
  ],
  INVALID_READ_STATE: [
    "Ese estado de lectura no es válido. No se cambió la consulta.",
    422,
  ],
  STALE_READ_STATE: [
    "Otra persona ya cambió esta consulta. Revisá su estado actual antes de volver a tocarla.",
    409,
  ],
  NOT_FOUND: ["No encontramos esa consulta. No se cambió nada.", 404],
  SETUP_REQUIRED: [
    "Falta instalar la actualización de consultas leídas en la base. No se cambió la consulta.",
    503,
  ],
};

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}


/**
 * Marca una consulta como leída o no leída. La API exige la misma sesión de
 * Operación y la RPC vuelve a validar rol+MFA, estado esperado e idempotencia.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return reply({ error: "AUTH", message: "Origen no permitido." }, 403);
  }

  if (!isSupabaseConfigured) {
    return reply(
      { error: "SETUP_REQUIRED", message: messages.SETUP_REQUIRED[0] },
      503,
    );
  }

  const user = await getCurrentUser();
  if (!user || !canAccessPanel(user) || !isFinanceRole(user.role)) {
    return reply({ error: "AUTH", message: messages.AUTH[0] }, 403);
  }

  const parsed = staffMessageReadRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return reply(
      {
        error: "INVALID_READ_STATE",
        message: messages.INVALID_READ_STATE[0],
      },
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
    .rpc("staff_set_message_read", {
      p_message_id: parsed.data.messageId,
      p_is_read: parsed.data.isRead,
      p_expected_is_read: parsed.data.expectedIsRead,
    })
    .abortSignal(AbortSignal.timeout(15000));

  if (error) return failure(error);

  const result = staffMessageReadResultSchema.safeParse(data);
  if (
    !result.success ||
    result.data.id !== parsed.data.messageId ||
    result.data.is_read !== parsed.data.isRead ||
    (result.data.changed &&
      result.data.previous_is_read !== parsed.data.expectedIsRead)
  ) {
    console.error("[admin/messages] respuesta inválida de la RPC");
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
    messageId: result.data.id,
    isRead: result.data.is_read,
    previousIsRead: result.data.previous_is_read,
    changed: result.data.changed,
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

  console.error("[admin/messages] staff_set_message_read falló", {
    code: error.code,
  });
  return reply(
    {
      error: "UNKNOWN",
      message:
        "No se pudo guardar el estado de la consulta. Quedó como estaba; recargá antes de reintentar.",
    },
    500,
  );
}
