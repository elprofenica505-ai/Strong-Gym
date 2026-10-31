import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/security/same-origin";
import { parsePlanUsage } from "@/lib/plans/usage";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

/**
 * Catálogo de planes y modalidades (CLI-06). Solo administrador con MFA.
 * La vigencia se guarda como datos del plan: acceso, disciplina, duración,
 * moneda e importe. Así un plan nuevo se cobra sin tocar código.
 */
const planSchema = z
  .object({
    action: z.literal("save"),
    id: z.string().min(1).max(64).nullable().optional(),
    nameEs: z.string().trim().min(2).max(80),
    nameEn: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(48)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    period: z.enum(["session", "week", "fortnight", "month"]),
    priceNio: z.number().positive().max(99999999).multipleOf(0.01).nullable(),
    accessKind: z.enum(["gym", "class"]).nullable(),
    classId: z.string().min(1).max(64).nullable(),
    durationDays: z.number().int().min(1).max(3660).nullable(),
    validityCurrency: z.enum(["NIO", "USD"]).nullable(),
    validityAmount: z.number().positive().max(99999999).multipleOf(0.01).nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(9999),
  })
  .strict()
  .refine(
    (p) =>
      p.durationDays === null
        ? p.accessKind === null && p.validityCurrency === null && p.validityAmount === null && p.classId === null
        : p.accessKind !== null && p.validityCurrency !== null && p.validityAmount !== null,
    { message: "INVALID_VALIDITY" },
  )
  .refine((p) => p.accessKind !== "class" || !!p.classId, {
    message: "INVALID_CLASS",
  })
  .refine((p) => p.accessKind !== "gym" || p.classId === null, {
    message: "INVALID_CLASS",
  });

const messages: Record<string, [string, number]> = {
  AUTH: ["Solo un administrador con verificación en dos pasos puede cambiar los planes.", 403],
  INVALID_NAME: ["Escribí un nombre de entre 2 y 80 caracteres.", 422],
  INVALID_SLUG: ["El identificador solo admite minúsculas, números y guiones.", 422],
  INVALID_PERIOD: ["Elegí un periodo válido: visita, semana, quincena o mes.", 422],
  INVALID_PRICE: ["El precio en córdobas debe ser positivo y con dos decimales.", 422],
  INVALID_ACCESS: ["Elegí si el plan da acceso a todo el gimnasio o a una disciplina.", 422],
  INVALID_CLASS: ["Elegí la disciplina del plan o quitá la vigencia por disciplina.", 422],
  INVALID_DURATION: ["La duración debe estar entre 1 y 3660 días.", 422],
  INVALID_CURRENCY: ["Elegí la moneda de la vigencia: córdobas o dólares.", 422],
  INVALID_AMOUNT: ["El importe de vigencia debe ser positivo y con dos decimales.", 422],
  INVALID_VALIDITY: ["Sin duración no se guarda moneda ni importe de vigencia.", 422],
  PLAN_EXISTS: ["Ya existe un plan con ese identificador. Elegí otro.", 409],
  NOT_FOUND: ["No encontramos ese plan. Recargá antes de reintentar.", 404],
};

function failure(
  error: { code?: string; message?: string },
  fallback = "No se pudo guardar el plan. Recargá antes de repetir.",
) {
  const message = Object.hasOwn(messages, error.message ?? "")
    ? messages[error.message!]
    : null;
  if (message) {
    return NextResponse.json(
      { error: error.message, message: message[0] },
      { status: message[1], headers },
    );
  }
  console.error("[admin/plans] error", error.code, error.message);
  return NextResponse.json({ error: "UNKNOWN", message: fallback }, { status: 503, headers });
}

/**
 * GET: catálogo completo, o el uso de un plan concreto.
 *
 * `?plan=<id>` devuelve quiénes tienen ese plan y qué precios tuvo antes; sin
 * parámetro, el catálogo. Es la misma ruta a propósito: es la misma pantalla y
 * el mismo permiso, así que no hace falta una segunda puerta que se pueda
 * quedar sin proteger.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mfa !== "ok") {
    return NextResponse.json({ error: "AUTH", message: messages.AUTH[0] }, { status: 403, headers });
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "UNAVAILABLE", message: "No hay conexión con la base de datos." },
      { status: 503, headers },
    );
  }

  const plan = new URL(request.url).searchParams.get("plan");
  if (plan) {
    if (plan.length > 64) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "No encontramos ese plan. Recargá la lista." },
        { status: 404, headers },
      );
    }
    const { data, error } = await supabase
      .rpc("admin_plan_usage", { p_plan: plan })
      .abortSignal(AbortSignal.timeout(15000));
    if (error) return failure(error, "No pudimos leer quiénes tienen este plan. Probá de nuevo.");
    const usage = parsePlanUsage(data);
    if (!usage) {
      // Nunca una lista vacía como si nadie tuviera el plan.
      return NextResponse.json(
        {
          error: "UNCONFIRMED",
          message: "No pudimos confirmar quiénes tienen este plan. No se muestra una lista vacía.",
        },
        { status: 503, headers },
      );
    }
    return NextResponse.json({ ok: true, usage }, { headers });
  }

  const { data, error } = await supabase
    .rpc("admin_plans_catalog")
    .abortSignal(AbortSignal.timeout(15000));
  if (error) return failure(error);
  return NextResponse.json(data, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "ORIGIN" }, { status: 403, headers });

  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mfa !== "ok") {
    return NextResponse.json({ error: "AUTH", message: messages.AUTH[0] }, { status: 403, headers });
  }

  const parsed = planSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? "INVALID_NAME";
    return failure({ message: issue });
  }
  const d = parsed.data;

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "UNAVAILABLE", message: "No hay conexión con la base de datos." },
      { status: 503, headers },
    );
  }

  const { data, error } = await supabase
    .rpc("admin_save_plan", {
      p_id: d.id ?? null,
      p_name_es: d.nameEs,
      p_name_en: d.nameEn,
      p_slug: d.slug,
      p_period: d.period,
      p_price_nio: d.priceNio,
      p_access_kind: d.accessKind,
      p_class_id: d.classId,
      p_duration_days: d.durationDays,
      p_validity_currency: d.validityCurrency,
      p_validity_amount: d.validityAmount,
      p_is_active: d.isActive,
      p_sort_order: d.sortOrder,
    })
    .abortSignal(AbortSignal.timeout(15000));
  if (error) return failure(error);

  const saved = data as { id?: unknown; slug?: unknown } | null;
  if (!saved || typeof saved.id !== "string" || saved.slug !== d.slug) {
    console.error("[admin/plans save] respuesta inválida");
    return NextResponse.json(
      { error: "UNCONFIRMED", message: "No pudimos confirmar el plan guardado. Recargá antes de repetir." },
      { status: 503, headers },
    );
  }
  return NextResponse.json({ ok: true, plan: saved }, { headers });
}
