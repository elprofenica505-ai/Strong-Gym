import { NextResponse } from "next/server";
import { canAccessPanel, isAdminRole } from "@/lib/auth/current-user";
import {
  adminClassActiveRequestSchema,
  adminClassActiveResultSchema,
} from "@/lib/admin/class-active";
import { getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

const messages: Record<string, [string, number]> = {
  AUTH: [
    "Sólo administración con verificación en dos pasos puede activar o desactivar disciplinas.",
    403,
  ],
  INVALID_ACTIVE_STATE: [
    "Ese estado de la disciplina no es válido. No se cambió nada.",
    422,
  ],
  STALE_ACTIVE_STATE: [
    "Otra persona ya cambió esta disciplina. Revisá su estado actual antes de volver a tocarla.",
    409,
  ],
  NOT_FOUND: ["No encontramos esa disciplina. No se cambió nada.", 404],
  SETUP_REQUIRED: [
    "Falta instalar la actualización de disciplinas activas en la base. No se cambió la disciplina.",
    503,
  ],
};

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (
      url.origin === new URL(request.url).origin ||
      url.host === request.headers.get("host")
    );
  } catch {
    return false;
  }
}

/**
 * Activa o desactiva una disciplina. La API exige administración con MFA y
 * la RPC vuelve a validar el rol, el estado esperado y la idempotencia.
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

  const parsed = adminClassActiveRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return reply(
      {
        error: "INVALID_ACTIVE_STATE",
        message: messages.INVALID_ACTIVE_STATE[0],
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
    .rpc("admin_set_class_active", {
      p_class_id: parsed.data.classId,
      p_is_active: parsed.data.isActive,
      p_expected_is_active: parsed.data.expectedIsActive,
    })
    .abortSignal(AbortSignal.timeout(15000));

  if (error) return failure(error);

  const result = adminClassActiveResultSchema.safeParse(data);
  if (
    !result.success ||
    result.data.id !== parsed.data.classId ||
    result.data.is_active !== parsed.data.isActive ||
    (result.data.changed &&
      result.data.previous_is_active !== parsed.data.expectedIsActive)
  ) {
    console.error("[admin/classes] respuesta inválida de la RPC");
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
    classId: result.data.id,
    isActive: result.data.is_active,
    previousIsActive: result.data.previous_is_active,
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

  console.error("[admin/classes] admin_set_class_active falló", {
    code: error.code,
  });
  return reply(
    {
      error: "UNKNOWN",
      message:
        "No se pudo guardar el estado de la disciplina. Quedó como estaba; recargá antes de reintentar.",
    },
    500,
  );
}
