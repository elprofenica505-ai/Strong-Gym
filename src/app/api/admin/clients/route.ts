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
function failure(error: { code?: string; message?: string }) {
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
  };
  const match = known[error.message ?? ""];
  if (match) return reply({ error: match[0] }, match[1]);
  console.error("[crm] Error de base", { code: error.code });
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? ""))
    return reply(
      {
        error:
          "Falta instalar FASE 2 en Supabase. Aplicá supabase/FASE2.sql; no SETUP.sql.",
      },
      503,
    );
  return reply(
    {
      error:
        "No se pudo completar la operación. Revisá los datos y la conexión; no se confirmó ningún resultado.",
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
      const [plans, methods, accounts] = await Promise.all([
        ctx.db
          .from("plans")
          .select("id,name_es")
          .eq("is_active", true)
          .order("sort_order"),
        ctx.db
          .from("payment_methods")
          .select("id,name_es,accepts_nio,accepts_usd")
          .eq("is_active", true)
          .order("sort_order"),
        ctx.db
          .from("accounts")
          .select("id,name,currency")
          .eq("is_active", true),
      ]);
      const error = plans.error ?? methods.error ?? accounts.error;
      return error
        ? failure(error)
        : reply({
            plans: plans.data,
            methods: methods.data,
            accounts: accounts.data,
          });
    }
    const id = url.searchParams.get("id");
    if (id) {
      if (!z.string().uuid().safeParse(id).success)
        return reply({ error: "Identificador inválido." }, 422);
      const { data, error } = await ctx.db.rpc("crm_detail", { p_id: id });
      return error ? failure(error) : reply(data);
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
    return error ? failure(error) : reply(data);
  } catch {
    return reply(
      { error: "Sin conexión con el servidor. Reintentá cuando tengas red." },
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
        name = "crm_record_payment";
        args = {
          p_id: d.id,
          p_request: d.requestId,
          p_amount: d.amount,
          p_currency: d.currency,
          p_method: d.method,
          p_account: d.account,
          p_concept: d.concept,
          p_fx: d.fx,
        };
        break;
    }
    const { data, error } = await ctx.db.rpc(name, args);
    return error ? failure(error) : reply({ data });
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
