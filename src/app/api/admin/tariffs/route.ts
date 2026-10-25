import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

const tariffSlugSchema = z.enum([
  "pase-del-dia",
  "gimnasio-semanal",
  "gimnasio-quincenal",
  "gimnasio-mensual",
]);
const priceNioSchema = z
  .number()
  .positive()
  .max(99999999)
  .multipleOf(0.01)
  .nullable();
const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("set_day_pass_price"),
      priceNio: priceNioSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("set_plan_price"),
      slug: tariffSlugSchema,
      priceNio: priceNioSchema,
    })
    .strict(),
]);

const fallbackNames: Record<z.infer<typeof tariffSlugSchema>, string> = {
  "pase-del-dia": "Pase del día",
  "gimnasio-semanal": "Gimnasio semanal",
  "gimnasio-quincenal": "Gimnasio quincenal",
  "gimnasio-mensual": "Gimnasio mensual",
};

const messages: Record<string, [string, number]> = {
  AUTH: [
    "Sólo un administrador con verificación en dos pasos puede cambiar estas tarifas.",
    403,
  ],
  INVALID_PLAN: [
    "Esa tarifa no se puede editar desde esta pantalla. No se cambió ningún precio.",
    422,
  ],
  INVALID_PRICE: [
    "Escribí un precio válido en córdobas o dejá el campo vacío para quitar la tarifa rápida.",
    422,
  ],
  NOT_FOUND: [
    "No encontramos esa tarifa de pesas y máquinas. No se cambió ningún precio.",
    404,
  ],
};

/**
 * Cambia solo `plans.price_nio` de las tarifas de pesas y máquinas. La API
 * vuelve a exigir administrador con MFA y la función SQL hace la comprobación
 * final con una lista cerrada de slugs. Nunca toca `plans.price`, que sigue
 * siendo el precio histórico en USD, ni permite editar Boxeo desde acá.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mfa !== "ok") {
    return NextResponse.json(
      { error: "AUTH", message: messages.AUTH[0] },
      { status: 403, headers },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PRICE", message: messages.INVALID_PRICE[0] },
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

  const slug =
    parsed.data.action === "set_plan_price"
      ? parsed.data.slug
      : "pase-del-dia";
  const { data, error } =
    parsed.data.action === "set_plan_price"
      ? await supabase.rpc("admin_set_plan_price_nio", {
          p_slug: slug,
          p_price: parsed.data.priceNio,
        })
      : await supabase.rpc("admin_set_day_pass_price_nio", {
          p_price: parsed.data.priceNio,
        });
  if (error) return failure(error, `admin/tariffs ${parsed.data.action}`);

  const row = data as {
    slug?: unknown;
    period?: unknown;
    name_es?: unknown;
    price_nio?: unknown;
    is_active?: unknown;
  } | null;
  const savedPrice =
    row?.price_nio === null || row?.price_nio === undefined
      ? null
      : Number(row.price_nio);

  if (
    !row ||
    row.slug !== slug ||
    (savedPrice !== null && !Number.isFinite(savedPrice))
  ) {
    console.error(`[admin/tariffs ${parsed.data.action}] respuesta inválida`);
    return NextResponse.json(
      {
        error: "UNKNOWN",
        message: "No pudimos confirmar la tarifa guardada. Recargá antes de repetir.",
      },
      { status: 500, headers },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      slug,
      period: typeof row.period === "string" ? row.period : null,
      priceNio: savedPrice,
      isActive: row.is_active === true,
      nameEs: typeof row.name_es === "string" ? row.name_es : fallbackNames[slug],
    },
    { headers },
  );
}

function failure(error: { code?: string; message?: string }, where: string) {
  const code = /^[A-Z_]{3,30}$/.test(error.message ?? "")
    ? (error.message as string)
    : "UNKNOWN";
  const known = messages[code];
  if (known)
    return NextResponse.json(
      { error: code, message: known[0] },
      { status: known[1], headers },
    );
  console.error(`[${where}] falló`, { code: error.code });
  return NextResponse.json(
    {
      error: "UNKNOWN",
      message: "No se pudo guardar la tarifa. No se modificó ningún precio.",
    },
    { status: 500, headers },
  );
}
