import { NextResponse } from "next/server";
import { canAccessPanel } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { crmActionSchema } from "@/lib/crm/schemas";
import { z } from "zod";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers });
function failure(
  error: { code?: string; message?: string },
  operation: string,
) {
  const safeCode = /^[A-Z0-9]{5,12}$/.test(error.code ?? "")
    ? error.code!
    : "UNKNOWN";
  const code = `CRM_${operation}_${safeCode}`;

  const known: Record<string, [string, number]> = {
    DUPLICATE_CLIENT: [
      "Hay una ficha con nombre/teléfono o correo coincidente. Buscala antes de crear otra; si es otra persona, confirmá la casilla de revisión.",
      409,
    ],
    AUTH: ["No tenés acceso a recepción.", 403],
    ADMIN_ONLY: ["Sólo un administrador puede cambiar las etiquetas.", 403],
    NOT_FOUND: ["No encontramos el cliente.", 404],
    INVALID_CARD: ["QR inválido o reemplazado. Usá la búsqueda manual.", 422],
    INACTIVE: [
      "El cliente está congelado o cancelado. Revisá su estado antes de registrar entrada.",
      409,
    ],
    REQUEST_CONFLICT: [
      "El intento de cobro cambió. Revisá el historial antes de volver a cobrar.",
      409,
    ],
    INVALID_ACCOUNT: ["Elegí una cuenta activa de la misma moneda.", 422],
    INVALID_METHOD: ["El método no está habilitado para esta moneda.", 422],
    INVALID_PAYMENT: ["Revisá monto, moneda, concepto y tipo de cambio.", 422],
    INVALID_EMAIL: ["Revisá el correo.", 422],
    FINANCE_REVIEW_REQUIRED: [
      "Los cobros CRM están bloqueados en esta estructura financiera hasta revisar la actualización de Caja. No se guardó un cobro nuevo desde esta operación.",
      409,
    ],
    FINANCE_SCHEMA_UNSUPPORTED: [
      "La estructura financiera no coincide con un modelo verificado. No reinstalés la base; revisá la compatibilidad antes de cobrar.",
      503,
    ],
  };
  const match = Object.hasOwn(known, error.message ?? "")
    ? known[error.message!]
    : undefined;
  if (match) return reply({ error: match[0], code }, match[1]);
  console.error("[crm] Error de base", { operation, code: safeCode });
  const section =
    operation === "DETAIL"
      ? "la ficha"
      : operation === "OPTIONS"
        ? "los planes y métodos"
        : operation === "DIRECTORY"
          ? "el listado"
          : "la operación";
  if (safeCode === "42703")
    return reply(
      {
        error: `No se pudo leer ${section}: hay una diferencia entre las columnas de la base y las que espera la aplicación. No demuestra una desconexión; compartí el código de diagnóstico.`,
        code,
      },
      503,
    );
  if (safeCode === "42501")
    return reply(
      {
        error: `La base rechazó permisos para ${section}. No desactivés RLS; compartí el código de diagnóstico.`,
        code,
      },
      503,
    );
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(safeCode))
    return reply(
      {
        error: `No se pudo leer ${section}: falta una tabla o función requerida, o el esquema no está disponible. Revisá la instalación de FASE2.sql antes de ejecutar cambios.`,
        code,
      },
      503,
    );
  return reply(
    {
      error: `No se pudo completar ${section}. Revisá el código de diagnóstico; si intentaste guardar, comprobá el historial antes de repetir.`,
      code,
    },
    503,
  );
}
async function context() {
  const user = await getCurrentUser();
  if (!user)
    return { response: reply({ error: "Iniciá sesión para continuar." }, 401) };
  if (!canAccessPanel(user))
    return { response: reply({ error: "No tenés permisos." }, 403) };
  const db = await getSupabaseServerClient();
  if (!db)
    return {
      response: reply(
        {
          error:
            "El CRM requiere Supabase; el modo demo no guarda clientes ni pagos.",
        },
        503,
      ),
    };
  return { db };
}
export async function GET(request: Request) {
  try {
    const ctx = await context();
    if (!ctx.db) return ctx.response;
    const url = new URL(request.url);
    if (url.searchParams.get("mode") === "options") {
      const { data, error } = await ctx.db.rpc("crm_options");
      if (error && ["PGRST202", "42883"].includes(error.code ?? ""))
        return reply(
          {
            error:
              "Falta la actualización incremental de compatibilidad CRM. Revisá supabase/COMPATIBILIDAD-CRM.sql; no reinstalés SETUP ni ACTUALIZAR.",
            code: "CRM_OPTIONS_COMPAT_REQUIRED",
          },
          503,
        );
      if (error) return failure(error, "OPTIONS");
      if (
        !data ||
        !Array.isArray(data.plans) ||
        !Array.isArray(data.methods) ||
        !Array.isArray(data.accounts) ||
        typeof data.payments_enabled !== "boolean"
      )
        return reply(
          {
            error:
              "Opciones incompletas. Los cobros quedan bloqueados; reintentá la lectura.",
            code: "CRM_OPTIONS_INVALID_RESPONSE",
          },
          503,
        );
      return reply(data);
    }
    const id = url.searchParams.get("id");
    if (id) {
      if (!z.string().uuid().safeParse(id).success)
        return reply({ error: "Identificador inválido." }, 422);
      const { data, error } = await ctx.db.rpc("crm_detail", { p_id: id });
      if (error) return failure(error, "DETAIL");
      if (!data)
        return reply(
          {
            error:
              "No encontramos la ficha. No vuelvas a registrar al cliente; reintentá desde el listado.",
            code: "CRM_DETAIL_EMPTY",
          },
          404,
        );
      if (typeof data !== "object" || data.client?.id !== id)
        return reply(
          {
            error:
              "La ficha devolvió una respuesta incompleta. Reintentá sin crear otro cliente.",
            code: "CRM_DETAIL_INVALID_RESPONSE",
          },
          503,
        );
      return reply(data);
    }
    const parsed = z
      .object({
        search: z.string().max(120),
        category: z.enum(["", "client", "friend", "family"]),
        offset: z.coerce.number().int().min(0).max(1000000),
      })
      .safeParse({
        search: url.searchParams.get("search") ?? "",
        category: url.searchParams.get("category") ?? "",
        offset: url.searchParams.get("offset") ?? 0,
      });
    if (!parsed.success) return reply({ error: "Filtros inválidos." }, 422);
    const { data, error } = await ctx.db.rpc("crm_directory", {
      p_search: parsed.data.search,
      p_category: parsed.data.category,
      p_offset: parsed.data.offset,
    });
    return error ? failure(error, "DIRECTORY") : reply(data);
  } catch {
    return reply(
      {
        error:
          "No se pudo obtener la respuesta del servidor. Reintentá la lectura; esto no confirma que se haya perdido toda la conexión.",
        code: "CRM_READ_SERVER",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (
      origin &&
      new URL(origin).host !== request.headers.get("host") &&
      new URL(origin).origin !== new URL(request.url).origin
    )
      return reply({ error: "Origen no permitido." }, 403);
    const ctx = await context();
    if (!ctx.db) return ctx.response;
    const body: unknown = await request.json().catch(() => null);
    const parsed = crmActionSchema.safeParse(body);
    if (!parsed.success)
      return reply(
        {
          error:
            "Revisá los campos. Nombre y monto deben ser válidos; teléfono y correo son opcionales.",
        },
        422,
      );
    const d = parsed.data;
    let name: string;
    let args: Record<string, unknown>;
    switch (d.action) {
      case "create":
        name = "crm_create_client";
        args = {
          p_name: d.name,
          p_phone: d.phone,
          p_email: d.email,
          p_plan: d.plan,
          p_duplicate_confirmed: d.confirmDuplicate,
        };
        break;
      case "update":
        name = "crm_update_client";
        args = {
          p_id: d.id,
          p_name: d.name,
          p_phone: d.phone,
          p_email: d.email,
          p_category: d.category,
          p_status: d.status,
          p_plan: d.plan,
          p_notes: d.notes,
        };
        break;
      case "check-in":
        name = "crm_check_in";
        args = { p_id: d.id, p_source: d.source, p_token: d.token ?? null };
        break;
      case "find-card":
        name = "crm_find_card";
        args = { p_token: d.token };
        break;
      case "rotate-card":
        name = "crm_rotate_card";
        args = { p_id: d.id };
        break;
      case "payment":
        // Con plan, la RPC cobra y crea la vigencia en la misma transacción.
        name = d.planId ? "crm_record_payment_plan" : "crm_record_payment";
        args = {
          p_id: d.id,
          p_request: d.requestId,
          p_amount: d.amount,
          p_currency: d.currency,
          p_method: d.method,
          p_account: d.account,
          p_concept: d.concept,
          p_fx: d.fx,
          ...(d.planId ? { p_plan: d.planId } : {}),
        };
        break;
    }
    const { data, error } = await ctx.db.rpc(name, args);
    return error
      ? failure(error, d.action.toUpperCase().replaceAll("-", "_"))
      : reply({ data });
  } catch {
    return reply(
      {
        error:
          "No se pudo confirmar la operación. Revisá el historial antes de reintentar un cobro.",
      },
      503,
    );
  }
}
