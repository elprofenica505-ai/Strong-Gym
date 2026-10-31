import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageFinance } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import {
  parseVoidReceipt,
  voidMessage,
  voidRequestSchema,
} from "@/lib/finance/voids";
import { sameOrigin } from "@/lib/security/same-origin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

/**
 * Consulta previa: qué pasaría si se anula ese movimiento.
 * Devuelve si está permitido y, si no, el código del motivo (ya anulado,
 * es una reversa, día distinto, interruptor apagado…).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canManageFinance(user)) {
    return reply({ error: "AUTH", message: voidMessage("AUTH") }, 403);
  }
  if (!isSupabaseConfigured) return reply({ error: "DEMO", message: "Sin Supabase conectado." }, 503);

  const id = new URL(request.url).searchParams.get("transaction");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return reply({ error: "NOT_FOUND", message: voidMessage("NOT_FOUND") }, 404);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return reply({ error: "DEMO", message: "Sin Supabase conectado." }, 503);

  const { data, error } = await supabase.rpc("finance_void_plan", {
    p_transaction: parsed.data,
  });
  if (error) {
    const code = (error.message ?? "").trim().toUpperCase();
    const known = code.startsWith("AUTH") ? "AUTH" : "NOT_FOUND";
    return reply({ error: known, message: voidMessage(known) }, known === "AUTH" ? 403 : 404);
  }
  return reply(data);
}

/**
 * Anular un movimiento sin borrarlo (FIN-01).
 *
 * La ruta no decide nada: valida la forma del pedido y llama a
 * `finance_void_movement`, que comprueba rol, MFA, interruptor, dueño del
 * movimiento y día en curso, e inserta la reversa en la misma transacción.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return reply({ error: "ORIGIN" }, 403);

  if (!isSupabaseConfigured)
    return reply({ error: "DEMO", message: "La anulación solo aplica con Supabase conectado." }, 503);

  const user = await getCurrentUser();
  if (!user || !canManageFinance(user)) {
    return reply({ error: "AUTH", message: voidMessage("AUTH") }, 403);
  }

  const parsed = voidRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? voidMessage("INVALID_REQUEST");
    return reply({ error: "INVALID", message: issue }, 422);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase)
    return reply({ error: "DEMO", message: "La anulación solo aplica con Supabase conectado." }, 503);

  const { data, error } = await supabase.rpc("finance_void_movement", {
    p_request: parsed.data.requestId,
    p_transaction: parsed.data.transactionId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const code = (error.message ?? "").trim().toUpperCase();
    const known = [
      "AUTH",
      "NOT_FOUND",
      "ALREADY_VOIDED",
      "IS_REVERSAL",
      "PERMISSION_OFF",
      "NOT_YOURS",
      "NOT_TODAY",
      "NOT_ALLOWED",
      "INVALID_REASON",
      "REQUEST_CONFLICT",
      "INVALID_REQUEST",
      "INVALID_ACCOUNT",
      "INVALID_PAYMENT",
      "FINANCE_REVIEW_REQUIRED",
    ];
    const match = known.find((item) => code.startsWith(item));
    if (match) {
      const status =
        match === "AUTH"
          ? 403
          : match === "NOT_FOUND"
            ? 404
            : match === "REQUEST_CONFLICT" || match === "ALREADY_VOIDED"
              ? 409
              : match === "INVALID_REASON" || match === "INVALID_REQUEST"
                ? 422
                : match === "NOT_ALLOWED" ||
                    match === "PERMISSION_OFF" ||
                    match === "NOT_YOURS" ||
                    match === "NOT_TODAY"
                  ? 403
                  : 409;
      return reply({ error: match, message: voidMessage(match) }, status);
    }
    console.error("[finance] anulación", { code: error.code });
    return reply({ error: "UNKNOWN", message: voidMessage("UNKNOWN") }, 500);
  }

  const receipt = parseVoidReceipt(data);
  if (!receipt) {
    return reply(
      {
        error: "UNCONFIRMED",
        message:
          "La base no devolvió un comprobante completo. Recargá Caja: si la anulación existe, aparece en el historial y no se repite.",
      },
      503,
    );
  }

  return reply({ ok: true, receipt });
}
