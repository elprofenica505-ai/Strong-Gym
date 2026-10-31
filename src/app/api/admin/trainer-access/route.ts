import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  CASHIER_PERMISSION_FIELDS,
  CASHIER_PERMISSION_KEYS,
} from "@/lib/finance/cashier-permissions";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("decide"),
    requestId: z.string().uuid(),
    decision: z.enum(["approved", "rejected", "revoked"]),
  }),
  z.object({
    action: z.literal("toggle"),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("toggle_cashier_daily_close"),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("toggle_cashier_permission"),
    permission: z.enum(CASHIER_PERMISSION_FIELDS),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("assign"),
    trainerId: z.string().uuid(),
    clientId: z.string().uuid(),
  }),
]);

const messages: Record<string, [string, number]> = {
  AUTH: ["Sólo un administrador con verificación en dos pasos puede cambiar los accesos de entrenadores.", 403],
  NOT_FOUND: ["No encontramos ese pedido. Puede que ya no exista.", 404],
  INVALID_STATE: ["Ese pedido ya fue decidido. Recargá la página para ver su estado actual.", 409],
  INVALID_DECISION: ["Decisión no válida.", 422],
  INVALID_TRAINER: ["Esa cuenta no es de entrenador.", 409],
  INACTIVE_CLIENT: ["Ese cliente no está activo.", 409],
};

/**
 * Acciones del administrador sobre accesos: aprobar, rechazar o revocar un
 * pedido de entrenador y activar o desactivar interruptores del personal.
 * La regla vive en la base (admin_decide_trainer_access y RLS de
 * staff_permissions). El cliente nunca envía la clave SQL: solo el nombre
 * corto permitido y esta ruta lo traduce a una clave conocida.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "ORIGIN" }, { status: 403, headers });
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mfa !== "ok") {
    return NextResponse.json({ error: "AUTH", message: messages.AUTH[0] }, { status: 403, headers });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_DECISION", message: messages.INVALID_DECISION[0] },
      { status: 422, headers },
    );
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "UNAVAILABLE", message: "No hay conexión con la base de datos." },
      { status: 503, headers },
    );
  }

  const body = parsed.data;
  if (body.action === "decide") {
    const { error } = await supabase.rpc("admin_decide_trainer_access", {
      p_id: body.requestId,
      p_decision: body.decision,
    });
    if (error) return failure(error, "admin/trainer-access decide");
    return NextResponse.json({ ok: true, requestId: body.requestId, status: body.decision }, { headers });
  }

  if (body.action === "assign") {
    const { data, error } = await supabase.rpc("admin_assign_trainer_client", {
      p_trainer: body.trainerId,
      p_client: body.clientId,
    });
    if (error) return failure(error, "admin/trainer-access assign");
    return NextResponse.json({ ok: true, requestId: data, status: "approved" }, { headers });
  }

  // Interruptores de staff_permissions: entrenadores y permisos de caja.
  const key =
    body.action === "toggle_cashier_permission"
      ? CASHIER_PERMISSION_KEYS[body.permission]
      : body.action === "toggle_cashier_daily_close"
        ? CASHIER_PERMISSION_KEYS.dailyClose
        : "trainer_can_request_clients";
  const { data, error } = await supabase
    .from("staff_permissions")
    .update({ enabled: body.enabled, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("key", key)
    .select("key");
  if (error) return failure(error, `admin/trainer-access toggle ${key}`);
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "No encontramos el interruptor. No se cambió nada." },
      { status: 404, headers },
    );
  }
  return NextResponse.json({ ok: true, enabled: body.enabled }, { headers });
}

function failure(error: { code?: string; message?: string }, where: string) {
  const code = /^[A-Z_]{3,30}$/.test(error.message ?? "") ? (error.message as string) : "UNKNOWN";
  const known = messages[code];
  if (known) return NextResponse.json({ error: code, message: known[0] }, { status: known[1], headers });
  console.error(`[${where}] falló`, { code: error.code });
  return NextResponse.json(
    { error: "UNKNOWN", message: "No se pudo guardar el cambio. No se modificó ninguna cuenta." },
    { status: 500, headers },
  );
}
