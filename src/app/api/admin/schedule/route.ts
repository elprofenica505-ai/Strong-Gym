import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

/**
 * Grilla semanal (OP-05). Solo administración con MFA edita horarios.
 * La base valida choques de sala y entrenador, y devuelve la grilla completa
 * junto con las sesiones que se crearon al guardar.
 */
const saveSchema = z
  .object({
    action: z.literal("save"),
    id: z.string().uuid().nullable().optional(),
    classId: z.string().min(1).max(64),
    day: z.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    duration: z.number().int().min(10).max(180),
    capacity: z.number().int().min(1).max(200),
    room: z.string().trim().min(2).max(60),
    coachId: z.string().min(1).max(64).nullable(),
    active: z.boolean(),
  })
  .strict();

const toggleSchema = z
  .object({
    action: z.literal("set-active"),
    id: z.string().uuid(),
    active: z.boolean(),
  })
  .strict();

const bodySchema = z.discriminatedUnion("action", [saveSchema, toggleSchema]);

const messages: Record<string, [string, number]> = {
  AUTH: ["Solo un administrador con verificación en dos pasos puede cambiar los horarios.", 403],
  INVALID_CLASS: ["Elegí una disciplina que exista en el catálogo.", 422],
  INVALID_DAY: ["Elegí un día de la semana.", 422],
  INVALID_TIME: ["La hora tiene que ir entre 00:00 y 23:59.", 422],
  INVALID_DURATION: ["La duración debe estar entre 10 y 180 minutos.", 422],
  INVALID_CAPACITY: ["El cupo debe estar entre 1 y 200 personas.", 422],
  INVALID_ROOM: ["Escribí la sala, entre 2 y 60 caracteres.", 422],
  INVALID_COACH: ["Ese entrenador no está activo. Elegí otro o dejalo sin asignar.", 422],
  SCHEDULE_CONFLICT: [
    "Ese horario se pisa con otra clase en la misma sala o con el mismo entrenador. Cambiá la hora, la sala o el entrenador.",
    409,
  ],
  INVALID_WEEKS: ["No se pueden generar más de 8 semanas de una vez.", 422],
  INVALID_REQUEST: ["Faltan datos para cambiar el horario.", 422],
  NOT_FOUND: ["No encontramos ese horario. Recargá antes de reintentar.", 404],
};

/**
 * La base y la app pueden quedar desalineadas (una columna o una función que
 * todavía no existe). Eso no se puede arreglar recargando, así que se avisa
 * aparte en vez de mostrar el mensaje genérico de "no pudimos confirmar".
 */
const SETUP_CODES = new Set([
  "PGRST202", // falta la función
  "42883", // undefined_function
  "42703", // undefined_column
  "42P01", // undefined_table
]);

function failure(error: { code?: string; message?: string }) {
  if (error.code && SETUP_CODES.has(error.code)) {
    console.error("[admin/schedule] setup", error.code, error.message);
    return NextResponse.json(
      {
        error: "SETUP_REQUIRED",
        message:
          "La grilla de horarios está desactualizada en la base. No se guardó nada: avisá para aplicar la actualización.",
      },
      { status: 503, headers },
    );
  }
  const match = Object.hasOwn(messages, error.message ?? "")
    ? messages[error.message!]
    : null;
  if (match)
    return NextResponse.json(
      { error: error.message, message: match[0] },
      { status: match[1], headers },
    );
  console.error("[admin/schedule] error", error.code, error.message);
  return NextResponse.json(
    {
      error: "UNKNOWN",
      message: "No se pudo leer o guardar la grilla. Recargá antes de repetir.",
    },
    { status: 503, headers },
  );
}

function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (
      url.origin === new URL(request.url).origin ||
      url.host === request.headers.get("host")
    );
  } catch {
    return false;
  }
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
    .rpc("admin_schedule_board")
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
          "Revisá el horario: hace falta disciplina, día, hora, duración, cupo y sala.",
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
      .rpc("admin_set_schedule_slot_active", {
        p_id: parsed.data.id,
        p_active: parsed.data.active,
        p_weeks: 4,
      })
      .abortSignal(AbortSignal.timeout(20000));
    if (error) return failure(error);
    return NextResponse.json(data, { headers });
  }

  const slot = parsed.data;
  const { data, error } = await supabase
    .rpc("admin_save_schedule_slot", {
      p_id: slot.id ?? null,
      p_class_id: slot.classId,
      p_day: slot.day,
      p_start: slot.start,
      p_duration: slot.duration,
      p_capacity: slot.capacity,
      p_room: slot.room,
      p_coach: slot.coachId,
      p_active: slot.active,
      p_weeks: 4,
    })
    .abortSignal(AbortSignal.timeout(20000));
  if (error) return failure(error);
  return NextResponse.json(data, { headers });
}
