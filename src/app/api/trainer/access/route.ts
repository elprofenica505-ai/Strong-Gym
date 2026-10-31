import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("search"),
    query: z.string().trim().min(3).max(60),
  }),
  z.object({
    action: z.literal("request"),
    clientId: z.string().uuid(),
  }),
]);

const messages: Record<string, [string, number]> = {
  AUTH: ["Sólo un entrenador con verificación en dos pasos puede pedir clientes.", 403],
  PERMISSION_DISABLED: ["El administrador desactivó la búsqueda de clientes por ahora.", 403],
  QUERY_TOO_SHORT: ["Escribí al menos 3 letras del nombre.", 422],
  NOT_FOUND: ["No encontramos ese cliente.", 404],
  INACTIVE_CLIENT: ["Ese cliente no está activo. No se puede pedir.", 409],
  ALREADY_APPROVED: ["Ya tenés asignado a ese cliente.", 409],
  INVALID_TRAINER: ["Tu cuenta no está configurada como entrenador.", 409],
};

/**
 * Entrenador: busca clientes para pedirlos y registra el pedido. Nunca aprueba.
 * Las reglas (interruptor, estado activo, sin duplicar, sólo aprobación del
 * administrador) viven en la base: search y request usan sus funciones.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "ORIGIN" }, { status: 403, headers });
  const user = await getCurrentUser();
  if (!user || user.role !== "trainer" || user.mfa !== "ok") {
    return NextResponse.json({ error: "AUTH", message: messages.AUTH[0] }, { status: 403, headers });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "QUERY_TOO_SHORT", message: messages.QUERY_TOO_SHORT[0] },
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
  if (body.action === "search") {
    const { data, error } = await supabase.rpc("trainer_search_clients", { p_query: body.query });
    if (error) return failure(error, "trainer/access search");
    const results = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      clientId: row.client_id as string,
      fullName: (row.full_name as string | null) ?? "Sin nombre",
      myStatus: (row.my_status as string | null) ?? null,
    }));
    return NextResponse.json({ ok: true, results }, { headers });
  }

  const { data, error } = await supabase.rpc("request_trainer_access", {
    p_trainer: user.id,
    p_client: body.clientId,
    p_reason: null,
  });
  if (error) return failure(error, "trainer/access request");
  return NextResponse.json({ ok: true, requestId: data, status: "pending" }, { headers });
}

function failure(error: { code?: string; message?: string }, where: string) {
  const code = /^[A-Z_]{3,30}$/.test(error.message ?? "") ? (error.message as string) : "UNKNOWN";
  const known = messages[code];
  if (known) return NextResponse.json({ error: code, message: known[0] }, { status: known[1], headers });
  console.error(`[${where}] falló`, { code: error.code });
  return NextResponse.json(
    { error: "UNKNOWN", message: "No se pudo completar. Intentá de nuevo en un momento." },
    { status: 500, headers },
  );
}
