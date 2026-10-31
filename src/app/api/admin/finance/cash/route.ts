import { NextResponse } from "next/server";
import { canManageFinance } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  cashError,
  cashRequestSchema,
  parseCashSession,
  parseCashState,
} from "@/lib/finance/cash-session";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

/**
 * Cierre y arqueo de caja (FIN-04).
 *
 * - `GET` devuelve la caja abierta (si hay), sus movimientos de efectivo en
 *   curso y las últimas cajas cerradas con su arqueo.
 * - `POST` abre o cierra una caja.
 *
 * La ruta no decide nada de negocio: valida la forma del pedido y llama a las
 * funciones de la base, que comprueban rol con segundo factor, dueño de la
 * caja, montos, caja única y motivo del faltante. Un fallo de lectura responde
 * 503 con su código: **nunca** un estado vacío, porque «no hay caja» y «no
 * pudimos leer» no son lo mismo.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageFinance(user)) return reply({ code: "AUTH" }, 403);

  const supabase = await getSupabaseServerClient();
  if (!supabase) return reply({ code: "DEMO" }, 503);

  const { data, error } = await supabase.rpc("finance_cash_state");
  if (error) {
    const { code } = cashError(error.message);
    return reply({ code, message: cashError(error.message).message }, code === "AUTH" ? 403 : 503);
  }
  const state = parseCashState(data);
  if (!state) {
    return reply(
      {
        code: "CASH_STATE_UNREADABLE",
        message:
          "No pudimos interpretar el estado de la caja. No se muestra «sin caja abierta» para no hacerte creer que no hay nada.",
      },
      503,
    );
  }
  return reply({ ok: true, state });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ code: "ORIGIN" }, 403);

  const user = await getCurrentUser();
  if (!user || !canManageFinance(user)) return reply(cashError("AUTH"), 403);

  const body: unknown = await request.json().catch(() => null);
  const parsed = cashRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message;
    return reply(
      {
        code: "INVALID",
        message:
          issue && issue !== "Invalid input"
            ? issue
            : "Revisá los montos de la caja: no pueden ser negativos y llevan hasta dos decimales.",
      },
      422,
    );
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return reply({ code: "DEMO", message: "La caja solo funciona con Supabase conectado." }, 503);

  const data = parsed.data;
  const result =
    data.action === "open"
      ? await supabase.rpc("finance_cash_open", {
          p_request: data.requestId,
          p_open_nio: data.openNio ?? 0,
          p_open_usd: data.openUsd ?? 0,
          p_notes: data.notes ?? "",
        })
      : await supabase.rpc("finance_cash_close", {
          p_request: data.requestId,
          p_session: data.sessionId,
          p_counted_nio: data.countedNio,
          p_counted_usd: data.countedUsd,
          p_notes: data.notes ?? "",
        });

  if (result.error) {
    const mapped = cashError(result.error.message);
    const status =
      mapped.code === "AUTH"
        ? 403
        : mapped.code === "NOT_FOUND"
          ? 404
          : mapped.code === "CASH_ALREADY_OPEN" ||
              mapped.code === "CASH_ALREADY_CLOSED" ||
              mapped.code === "CASH_NOT_YOURS" ||
              mapped.code === "CASH_DIFFERENCE_REASON_REQUIRED"
            ? 409
            : mapped.code === "INVALID_AMOUNT" || mapped.code === "INVALID_NOTES"
              ? 422
              : 503;
    if (mapped.code === "UNKNOWN") {
      console.error("[caja] arqueo", { action: data.action, code: result.error.code });
    }
    return reply(mapped, status);
  }

  const session = parseCashSession(result.data);
  if (!session) {
    return reply(
      {
        code: "CASH_UNCONFIRMED",
        message:
          "La caja se guardó o no, pero no pudimos leer el resultado. Volvé a abrir esta pantalla antes de reintentar: el mismo pedido no duplica la caja.",
      },
      503,
    );
  }
  return reply({ ok: true, session });
}
