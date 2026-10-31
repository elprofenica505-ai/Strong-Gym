import { NextResponse } from "next/server";
import { canAccessPanel, isAdminRole } from "@/lib/auth/current-user";
import {
  adminFutureSessionsRequestSchema,
  adminFutureSessionsResultSchema,
} from "@/lib/admin/future-sessions";
import { getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

const messages: Record<string, [string, number]> = {
  AUTH: [
    "Sólo administración con verificación en dos pasos puede generar sesiones futuras.",
    403,
  ],
  INVALID_FUTURE_WEEKS: [
    "La cantidad de semanas no es válida. No se generó ninguna sesión.",
    422,
  ],
  SETUP_REQUIRED: [
    "Falta instalar la actualización de sesiones futuras en la base. No se generó ninguna sesión.",
    503,
  ],
};

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}


/**
 * Genera semanas completas futuras reutilizando la grilla existente.
 * La API exige administración con MFA y la RPC vuelve a validar el rol,
 * ordena generaciones simultáneas y evita duplicados.
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
  if (!user || !canAccessPanel(user) || !isAdminRole(user.role)) {
    return reply({ error: "AUTH", message: messages.AUTH[0] }, 403);
  }

  const parsed = adminFutureSessionsRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return reply(
      {
        error: "INVALID_FUTURE_WEEKS",
        message: messages.INVALID_FUTURE_WEEKS[0],
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
    .rpc("admin_generate_future_sessions", {
      p_weeks: parsed.data.weeks,
    })
    .abortSignal(AbortSignal.timeout(15000));

  if (error) return failure(error);

  const result = adminFutureSessionsResultSchema.safeParse(data);
  if (!result.success || result.data.weeks !== parsed.data.weeks) {
    console.error("[admin/sessions/generate] respuesta inválida de la RPC");
    return reply(
      {
        error: "UNKNOWN",
        message:
          "No pudimos confirmar cuántas sesiones se generaron. Revisá Horarios antes de repetir la generación.",
      },
      500,
    );
  }

  return reply({
    ok: true,
    weeks: result.data.weeks,
    firstMonday: result.data.first_monday,
    lastSunday: result.data.last_sunday,
    createdCount: result.data.created_count,
    scheduledCount: result.data.scheduled_count,
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

  console.error("[admin/sessions/generate] admin_generate_future_sessions falló", {
    code: error.code,
  });
  return reply(
    {
      error: "UNKNOWN",
      message:
        "No se pudo confirmar la generación de sesiones. Revisá Horarios antes de reintentar.",
    },
    500,
  );
}
