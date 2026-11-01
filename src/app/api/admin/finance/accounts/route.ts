import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import {
  ACCOUNT_AMOUNT_MAX,
  ACCOUNT_NAME_MAX,
  CATEGORY_NAME_MAX,
  DEFAULT_FX,
  FX_MAX,
  FX_MIN,
  METHOD_NAME_MAX,
  TRANSFER_CONCEPT_MAX,
  accountsErrorMessage,
  parseAccountsState,
  parseTransferReceipt,
} from "@/lib/finance/accounts";
import { sameOrigin } from "@/lib/security/same-origin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

const money = z.number().positive().max(ACCOUNT_AMOUNT_MAX).multipleOf(0.01);

const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save_account"),
      id: z.string().min(1).max(60).nullable().optional(),
      name: z.string().trim().min(1).max(ACCOUNT_NAME_MAX),
      accountType: z.enum(["caja_fuerte", "banco", "billetera"]),
      currency: z.enum(["NIO", "USD"]),
      bankName: z.string().max(60).nullable().optional(),
      accountNumber: z.string().max(40).nullable().optional(),
      displayOrder: z.number().int().min(0).max(9999).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("save_method"),
      id: z.string().min(1).max(60).nullable().optional(),
      name: z.string().trim().min(1).max(METHOD_NAME_MAX),
      currency: z.enum(["NIO", "USD", "BOTH"]),
      feePct: z.number().min(0).max(100).multipleOf(0.01).optional(),
      displayOrder: z.number().int().min(0).max(9999).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("save_category"),
      id: z.string().min(1).max(60).nullable().optional(),
      name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "El color va en formato #RRGGBB"),
      budgetMonthly: z.number().min(0).max(ACCOUNT_AMOUNT_MAX).multipleOf(0.01).nullable().optional(),
      displayOrder: z.number().int().min(0).max(9999).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("transfer"),
      requestId: z.uuid(),
      from: z.string().min(1).max(60),
      to: z.string().min(1).max(60),
      amount: money,
      fx: z.number().min(FX_MIN).max(FX_MAX).multipleOf(0.0001).optional(),
      concept: z.string().trim().min(2).max(TRANSFER_CONCEPT_MAX),
    })
    .strict(),
  z
    .object({
      action: z.literal("void_transfer"),
      requestId: z.uuid(),
      transferId: z.uuid(),
      reason: z.string().trim().min(5).max(300),
    })
    .strict(),
]);

/**
 * Cuentas, métodos, categorías y transferencias (FIN-03).
 *
 * `GET` devuelve el mismo estado que pinta la pantalla, por si hay que
 * refrescarlo sin recargar. `POST` hace una sola cosa por pedido.
 *
 * Reglas que no se negocian acá:
 *   · Sólo administrador con segundo factor (`AUTH`). La base lo vuelve a
 *     comprobar en cada función, así que esta ruta no es la única defensa.
 *   · Una transferencia no es ingreso ni gasto: no toca los totales del día.
 *   · Nada se borra: se apaga. Una transferencia se anula con contra-asiento y
 *     motivo escrito.
 *   · Si la base no confirma, no se dice que se guardó. El texto de error sale
 *     del código que devuelve la base y no inventa un resultado.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mfa !== "ok") {
    return reply({ code: "AUTH" }, 403);
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return reply({ code: "DEMO" }, 503);

  const { data, error } = await supabase
    .rpc("finance_accounts_state", { p_limit: 20 })
    .abortSignal(AbortSignal.timeout(15000));
  if (error) {
    const code = error.code === "42501" ? "AUTH" : "UNAVAILABLE";
    return reply({ code, message: accountsErrorMessage(code) }, code === "AUTH" ? 403 : 503);
  }
  const state = parseAccountsState(data);
  if (!state) {
    return reply({ code: "INVALID", message: accountsErrorMessage("INVALID") }, 503);
  }
  return reply({ ok: true, state });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ code: "ORIGIN" }, 403);

  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mfa !== "ok") {
    return reply({ code: "AUTH", message: accountsErrorMessage("AUTH") }, 403);
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return reply(
      {
        code: "INVALID",
        message:
          issue && typeof issue.message === "string" && issue.message !== "Invalid input"
            ? issue.message
            : accountsErrorMessage("INVALID"),
      },
      422,
    );
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return reply({ code: "DEMO", message: "Las cuentas sólo funcionan con Supabase conectado." }, 503);
  }

  const data = parsed.data;

  try {
    if (data.action === "save_account") {
      const { data: row, error } = await supabase.rpc("finance_account_save", {
        p_id: data.id ?? null,
        p_name: data.name,
        p_account_type: data.accountType,
        p_currency: data.currency,
        p_bank_name: data.bankName ?? null,
        p_account_number: data.accountNumber ?? null,
        p_display_order: data.displayOrder ?? 100,
        p_is_active: data.isActive ?? true,
      });
      if (error) return failure(error.message);
      if (!row || typeof row !== "object") return failure("INVALID");
      return reply({ ok: true, account: row });
    }

    if (data.action === "save_method") {
      const { data: row, error } = await supabase.rpc("finance_method_save", {
        p_id: data.id ?? null,
        p_name: data.name,
        p_currency: data.currency,
        p_fee_pct: data.feePct ?? 0,
        p_display_order: data.displayOrder ?? 100,
        p_is_active: data.isActive ?? true,
      });
      if (error) return failure(error.message);
      if (!row || typeof row !== "object") return failure("INVALID");
      return reply({ ok: true, method: row });
    }

    if (data.action === "save_category") {
      const { data: row, error } = await supabase.rpc("finance_category_save", {
        p_id: data.id ?? null,
        p_name: data.name,
        p_color: data.color,
        p_budget_monthly: data.budgetMonthly ?? null,
        p_display_order: data.displayOrder ?? 100,
        p_is_active: data.isActive ?? true,
      });
      if (error) return failure(error.message);
      if (!row || typeof row !== "object") return failure("INVALID");
      return reply({ ok: true, category: row });
    }

    if (data.action === "transfer") {
      const { data: receipt, error } = await supabase.rpc("finance_transfer_create", {
        p_request: data.requestId,
        p_from: data.from,
        p_to: data.to,
        p_amount: data.amount,
        p_fx: data.fx ?? DEFAULT_FX,
        p_concept: data.concept,
      });
      if (error) return failure(error.message);
      const parsedReceipt = parseTransferReceipt(receipt);
      if (!parsedReceipt) {
        return reply(
          {
            code: "INVALID",
            message:
              "La base no devolvió el comprobante de la transferencia. Recargá la pantalla antes de repetir: puede que sí se haya registrado.",
          },
          503,
        );
      }
      return reply({ ok: true, receipt: parsedReceipt });
    }

    const { data: receipt, error } = await supabase.rpc("finance_transfer_void", {
      p_request: data.requestId,
      p_transfer: data.transferId,
      p_reason: data.reason,
    });
    if (error) return failure(error.message);
    const parsedReceipt = parseTransferReceipt(receipt);
    if (!parsedReceipt) {
      return reply(
        {
          code: "INVALID",
          message:
            "La base no devolvió el comprobante de la anulación. Recargá la pantalla antes de repetir.",
        },
        503,
      );
    }
    return reply({ ok: true, receipt: parsedReceipt });
  } catch {
    return reply(
      {
        code: "UNAVAILABLE",
        message:
          "No hubo respuesta de la base. No podemos confirmar si se guardó: recargá la pantalla antes de repetir.",
      },
      503,
    );
  }
}

/** Traduce el código que lanza la función de la base al estado HTTP y al texto. */
function failure(rawMessage: string) {
  const code = (rawMessage || "").trim().split("\n")[0]?.trim() || "INVALID";
  const message = accountsErrorMessage(code);
  const status =
    code === "AUTH"
      ? 403
      : code === "NOT_FOUND"
        ? 404
        : code === "REQUEST_CONFLICT" ||
            code === "NOT_ALLOWED" ||
            code === "ACCOUNT_NAME_TAKEN" ||
            code === "METHOD_NAME_TAKEN" ||
            code === "CATEGORY_NAME_TAKEN" ||
            code === "ACCOUNT_CURRENCY_LOCKED" ||
            code === "ACCOUNT_IN_OPEN_CASH"
          ? 409
          : code === "INVALID" ||
              code.startsWith("INVALID_") ||
              code.endsWith("_PREREQUISITE_MISSING")
            ? 422
            : 503;
  return NextResponse.json({ code, message }, { status, headers: noStore });
}
