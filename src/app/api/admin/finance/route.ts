import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { canManageFinance } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  financeOptionsSchema,
  movementResultSchema,
  movementSchema,
  receiptSchema,
} from "@/lib/finance/movements";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const messages: Record<string, string> = {
  AUTH: "No tenés acceso a movimientos financieros.",
  INVALID_ACCOUNT: "Elegí una cuenta activa de la misma moneda.",
  INVALID_METHOD: "El método no está habilitado para esta moneda.",
  INVALID_CATEGORY: "Elegí una categoría de gastos existente.",
  INVALID_PAYMENT:
    "Revisá monto, tasa, moneda y concepto; el equivalente o saldo resultante puede exceder el límite admitido.",
  NOT_FOUND:
    "No encontramos la ficha del cliente. No la vuelvas a crear sin buscarla.",
  REQUEST_CONFLICT:
    "Esta referencia ya pertenece a otro movimiento. Revisá el comprobante antes de repetir.",
  RECEIPT_NOT_FOUND:
    "Este movimiento no tiene un comprobante del nuevo registro. No significa que no exista en el historial.",
  FINANCE_REVIEW_REQUIRED:
    "La escritura no está habilitada con esta configuración. Revisá permisos y disparadores; no se registró un movimiento nuevo por este rechazo.",
  CLIENT_REQUIRED: "Elegí primero la ficha del cliente para registrar este cobro.",
  INVALID_ITEMS:
    "Revisá los productos y cantidades elegidos. No se registró el cobro.",
  PRODUCT_NOT_FOUND:
    "Uno de los productos elegidos ya no existe en el catálogo. Actualizá la lista; no se registró el cobro.",
  PRODUCT_INACTIVE:
    "Uno de los productos elegidos está inactivo. Actualizá la lista; no se registró el cobro.",
  INVALID_PRODUCT_PRICE:
    "Uno de los productos elegidos no tiene un precio válido. Corregilo en Productos y stock; no se registró el cobro.",
  PRICE_CHANGED:
    "El precio de un producto cambió mientras armabas el cobro. Revisá el total nuevo antes de confirmar; no se registró nada.",
  SIN_STOCK:
    "Ya no hay suficiente stock de uno de los productos. Revisá las cantidades; no se registró el cobro.",
  PLAN_NOT_FOUND:
    "El plan elegido ya no existe. Actualizá la lista; no se registró el cobro.",
  PLAN_TERMS_INVALID:
    "Ese plan no tiene una vigencia definida. Elegí una tarifa con duración o cobrá sin plan; no se registró el cobro.",
  PLAN_PRICE_MISSING:
    "Ese plan no tiene una tarifa publicada. Definí el precio antes de cobrarlo; no se registró el cobro.",
  PLAN_PRICE_MISMATCH:
    "El importe o la moneda no coinciden con la tarifa vigente del plan. Revisá el monto antes de confirmar; no se registró el cobro.",
  PLAN_NOT_COMBINABLE:
    "Boxeo se cobra solo, sin productos, porque su tarifa está en dólares. Quitá los productos; no se registró el cobro.",
};
function failure(error: { code?: string; message?: string }) {
  const code = /^[A-Z0-9]{5,12}$/.test(error.code ?? "")
    ? error.code!
    : "UNKNOWN";
  const message = Object.hasOwn(messages, error.message ?? "")
    ? messages[error.message!]
    : undefined;
  if (message)
    return reply(
      { error: message, code: `FIN_WRITE_${code}` },
      error.message === "AUTH"
        ? 403
        : error.message === "RECEIPT_NOT_FOUND"
          ? 404
          : error.message === "REQUEST_CONFLICT"
            ? 409
            : 422,
    );
  if (["PGRST202", "42883", "42P01"].includes(code))
    return reply(
      {
        error:
          "Falta la actualización COBROS-GASTOS.sql. No reinstalés la base. Si intentaste guardar, revisá el historial antes de reintentar con la misma referencia.",
        code: `FIN_SETUP_${code}`,
      },
      503,
    );
  return reply(
    {
      error:
        "No se pudo confirmar la operación financiera. Revisá el historial; un reintento debe conservar la misma referencia.",
      code: `FIN_WRITE_${code}`,
    },
    503,
  );
}
async function context() {
  if (!isSupabaseConfigured)
    return {
      response: reply(
        {
          error: "Conectá Supabase; no se guardan movimientos de demostración.",
        },
        503,
      ),
      db: null,
    };
  if (!canManageFinance(await getCurrentUser()))
    return { response: reply({ error: messages.AUTH }, 403), db: null };
  const db = await getSupabaseServerClient();
  return db
    ? { db, response: null }
    : {
        db: null,
        response: reply({ error: "No se pudo confirmar la conexión." }, 503),
      };
}
export async function GET(request: Request) {
  try {
    const ctx = await context();
    if (!ctx.db) return ctx.response;
    const params = new URL(request.url).searchParams;
    const kind = params.get("history");
    if (kind !== null) {
      const client = params.get("client");
      if (
        !["service_income", "expense"].includes(kind) ||
        (kind === "service_income"
          ? !z.string().uuid().safeParse(client).success
          : client !== null)
      )
        return reply({ error: "Filtro de comprobantes inválido." }, 422);
      const { data, error } = await ctx.db
        .rpc("finance_recent_receipts", { p_kind: kind, p_client: client })
        .abortSignal(AbortSignal.timeout(15000));
      if (error) return failure(error);
      const parsed = z.array(receiptSchema).safeParse(data);
      return parsed.success
        ? reply(parsed.data)
        : reply(
            {
              error: "No se pudo confirmar la lectura de comprobantes.",
              code: "FIN_RESPONSE_INVALID",
            },
            503,
          );
    }
    const id = params.get("receipt");
    if (id !== null && !z.string().uuid().safeParse(id).success)
      return reply({ error: "Referencia inválida." }, 422);
    const { data, error } = await ctx.db
      .rpc(
        id === null ? "finance_options" : "finance_receipt",
        id === null ? {} : { p_id: id },
      )
      .abortSignal(AbortSignal.timeout(15000));
    if (error) return failure(error);
    const parsed =
      id === null
        ? financeOptionsSchema.safeParse(data)
        : receiptSchema.safeParse(data);
    return parsed.success
      ? reply(parsed.data)
      : reply(
          {
            error:
              "La respuesta financiera está incompleta. No se puede confirmar el resultado.",
            code: "FIN_RESPONSE_INVALID",
          },
          503,
        );
  } catch {
    return failure({});
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      return reply({ error: "Origen no permitido." }, 403);
    if (origin) {
      let allowed = false;
      try {
        const url = new URL(origin);
        allowed =
          url.origin === new URL(request.url).origin ||
          url.host === request.headers.get("host");
      } catch {}
      if (!allowed) return reply({ error: "Origen no permitido." }, 403);
    }
    const ctx = await context();
    if (!ctx.db) return ctx.response;
    const parsed = movementSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return reply(
        {
          error:
            "Revisá monto, tasa NIO por USD, cuenta, método, concepto y cliente o categoría.",
        },
        422,
      );
    const d = parsed.data;
    const planId = d.kind === "service_income" ? d.planId : undefined;
    if (d.kind === "service_income" && d.items.length > 0) {
      const { data, error } = await ctx.db
        .rpc(planId ? "finance_record_checkout_plan" : "finance_record_checkout", {
          p_request: d.requestId,
          p_client: d.clientId,
          p_service_amount: d.amount,
          p_service_concept: d.concept,
          p_currency: d.currency,
          p_method: d.method,
          p_account: d.account,
          p_fx: d.fx,
          p_items: d.items.map((item) => ({
            product: item.product,
            qty: item.qty,
            unit_price: item.unitPrice,
          })),
          ...(planId ? { p_plan: planId } : {}),
        })
        .abortSignal(AbortSignal.timeout(25000));
      if (error) return failure(error);
      const result = movementResultSchema.safeParse(data);
      return result.success
        ? reply(result.data)
        : reply(
            {
              error:
                "No se pudo confirmar la referencia. Revisá el historial y conservá el mismo intento.",
              code: "FIN_RESPONSE_INVALID",
            },
            503,
          );
    }
    if (d.kind === "service_income" && planId) {
      const { data, error } = await ctx.db
        .rpc("finance_record_movement_plan", {
          p_request: d.requestId,
          p_client: d.clientId,
          p_amount: d.amount,
          p_currency: d.currency,
          p_method: d.method,
          p_account: d.account,
          p_concept: d.concept,
          p_fx: d.fx,
          p_plan: planId,
        })
        .abortSignal(AbortSignal.timeout(25000));
      if (error) return failure(error);
      const result = movementResultSchema.safeParse(data);
      return result.success
        ? reply(result.data)
        : reply(
            {
              error:
                "No se pudo confirmar la vigencia del plan. Revisá el historial y conservá el mismo intento.",
              code: "FIN_RESPONSE_INVALID",
            },
            503,
          );
    }
    const { data, error } = await ctx.db
      .rpc("finance_record_movement", {
        p_request: d.requestId,
        p_kind: d.kind,
        p_client: d.kind === "service_income" ? d.clientId : null,
        p_amount: d.amount,
        p_currency: d.currency,
        p_method: d.method,
        p_account: d.account,
        p_concept: d.concept,
        p_fx: d.fx,
        p_category: d.kind === "expense" ? d.category : null,
      })
      .abortSignal(AbortSignal.timeout(25000));
    if (error) return failure(error);
    return z.string().uuid().safeParse(data).success
      ? reply({ id: data })
      : reply(
          {
            error:
              "No se pudo confirmar la referencia. Revisá el historial y conservá el mismo intento.",
            code: "FIN_RESPONSE_INVALID",
          },
          503,
        );
  } catch {
    return failure({});
  }
}
