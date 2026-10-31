import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

/**
 * Entrenadores del gimnasio (OP-05). Solo administración con MFA.
 * Crear o editar un entrenador no borra nada: la baja es el interruptor y sus
 * clases quedan como están. Las disciplinas se eligen de la lista de clases
 * (`specialties` guarda sus slugs), nunca texto libre.
 */
const saveSchema = z
  .object({
    action: z.literal("save"),
    id: z.string().min(1).max(64).nullable().optional(),
    fullName: z.string().trim().min(3).max(80),
    specialty: z.string().trim().max(80),
    specialties: z.array(z.string().trim().min(1).max(48)).max(12),
  })
  .strict();

const toggleSchema = z
  .object({
    action: z.literal("set-active"),
    id: z.string().min(1).max(160),
    isActive: z.boolean(),
    expectedIsActive: z.boolean(),
  })
  .strict();

const bodySchema = z.discriminatedUnion("action", [saveSchema, toggleSchema]);

const messages: Record<string, [string, number]> = {
  AUTH: [
    "Solo un administrador con verificación en dos pasos puede cambiar los entrenadores.",
    403,
  ],
  INVALID_NAME: ["Escribí el nombre completo del entrenador, entre 3 y 80 caracteres.", 422],
  INVALID_SPECIALTY: ["La especialidad no puede pasar de 80 caracteres.", 422],
  TOO_MANY_SPECIALTIES: ["Un entrenador puede tener hasta 12 disciplinas.", 422],
  INVALID_CLASS_SLUG: [
    "Elegí las disciplinas de la lista: alguna de las que mandaste no existe en el catálogo.",
    422,
  ],
  COACH_EXISTS: ["Ya hay un entrenador con ese nombre. Revisá la lista antes de repetirlo.", 409],
  INVALID_ACTIVE_STATE: ["No pudimos leer el estado del entrenador. Recargá la pantalla.", 422],
  STALE_ACTIVE_STATE: [
    "Otro administrador cambió el estado mientras mirabas. Recargá para ver cómo quedó.",
    409,
  ],
  NOT_FOUND: ["No encontramos ese entrenador. Recargá antes de reintentar.", 404],
};

const SETUP_CODES = new Set([
  "PGRST202", // falta la función
  "42883", // undefined_function
  "42703", // undefined_column
  "42P01", // undefined_table
]);

function failure(error: { code?: string; message?: string }) {
  if (error.code && SETUP_CODES.has(error.code)) {
    console.error("[admin/coaches] setup", error.code, error.message);
    return NextResponse.json(
      {
        error: "SETUP_REQUIRED",
        message:
          "El catálogo de entrenadores está desactualizado en la base. No se guardó nada: avisá para aplicar la actualización.",
      },
      { status: 503, headers },
    );
  }
  const match = Object.hasOwn(messages, error.message ?? "") ? messages[error.message!] : null;
  if (match)
    return NextResponse.json(
      { error: error.message, message: match[0] },
      { status: match[1], headers },
    );
  console.error("[admin/coaches] error", error.code, error.message);
  return NextResponse.json(
    {
      error: "UNKNOWN",
      message: "No se pudo leer o guardar el entrenador. Recargá antes de repetir.",
    },
    { status: 503, headers },
  );
}


async function requireAdmin() {
  const user = await getCurrentUser();
  return !!user && isAdminRole(user.role) && user.mfa === "ok";
}

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json(
      { error: "AUTH", message: messages.AUTH[0] },
      { status: 403, headers },
    );
  const supabase = await getSupabaseServerClient();
  if (!supabase)
    return NextResponse.json(
      { error: "UNAVAILABLE", message: "No hay conexión con la base de datos." },
      { status: 503, headers },
    );
  const { data, error } = await supabase
    .rpc("admin_coaches_catalog")
    .abortSignal(AbortSignal.timeout(15000));
  if (error) return failure(error);
  return NextResponse.json(data, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "ORIGIN" }, { status: 403, headers });
  if (!(await requireAdmin()))
    return NextResponse.json(
      { error: "AUTH", message: messages.AUTH[0] },
      { status: 403, headers },
    );

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message:
          "Revisá los datos: hace falta el nombre y las disciplinas tienen que salir de la lista.",
      },
      { status: 422, headers },
    );

  const supabase = await getSupabaseServerClient();
  if (!supabase)
    return NextResponse.json(
      { error: "UNAVAILABLE", message: "No hay conexión con la base de datos." },
      { status: 503, headers },
    );

  if (parsed.data.action === "set-active") {
    const { data, error } = await supabase
      .rpc("admin_set_coach_active", {
        p_coach_id: parsed.data.id,
        p_is_active: parsed.data.isActive,
        p_expected_is_active: parsed.data.expectedIsActive,
      })
      .abortSignal(AbortSignal.timeout(20000));
    if (error) return failure(error);
    if (!data || typeof data !== "object" || typeof data.changed !== "boolean")
      return NextResponse.json(
        {
          error: "UNKNOWN",
          message: "No pudimos confirmar el cambio de estado. Recargá antes de repetirlo.",
        },
        { status: 503, headers },
      );
    const catalog = await supabase
      .rpc("admin_coaches_catalog")
      .abortSignal(AbortSignal.timeout(15000));
    return NextResponse.json(
      { ...data, catalog: catalog.error ? null : catalog.data },
      { headers },
    );
  }

  const { data, error } = await supabase
    .rpc("admin_save_coach", {
      p_id: parsed.data.id ?? null,
      p_full_name: parsed.data.fullName,
      p_specialty: parsed.data.specialty.trim() === "" ? null : parsed.data.specialty,
      p_specialties: parsed.data.specialties,
    })
    .abortSignal(AbortSignal.timeout(20000));
  if (error) return failure(error);
  if (!data || typeof data !== "object" || typeof data.action !== "string")
    return NextResponse.json(
      {
        error: "UNKNOWN",
        message: "No pudimos confirmar el guardado. Recargá antes de repetirlo.",
      },
      { status: 503, headers },
    );
  const catalog = await supabase
    .rpc("admin_coaches_catalog")
    .abortSignal(AbortSignal.timeout(15000));
  return NextResponse.json(
    { ...data, catalog: catalog.error ? null : catalog.data },
    { headers },
  );
}
