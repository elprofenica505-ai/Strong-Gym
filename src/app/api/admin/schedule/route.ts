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

const generateSchema = z
  .object({
    action: z.literal("preview-generate"),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha va como AAAA-MM-DD")
      .optional(),
    weeks: z.number().int().min(1).max(8),
  })
  .strict();

const applySchema = generateSchema.extend({ action: z.literal("apply-generate") });

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "la fecha y hora van como AAAA-MM-DDTHH:MM");

const blockFields = {
  scope: z.enum(["gym", "class", "coach"]),
  classId: z.string().min(1).max(64).nullable().optional(),
  coachId: z.string().min(1).max(64).nullable().optional(),
  starts: localDateTime,
  ends: localDateTime,
  substituteCoachId: z.string().min(1).max(64).nullable().optional(),
};

const previewBlockSchema = z
  .object({ action: z.literal("preview-block"), ...blockFields })
  .strict();

const saveBlockSchema = z
  .object({
    action: z.literal("save-block"),
    id: z.string().uuid().nullable().optional(),
    reasonKind: z.enum(["holiday", "vacation", "sick", "maintenance", "other"]),
    reason: z.string().trim().min(3).max(200),
    confirmed: z.boolean().optional(),
    ...blockFields,
  })
  .strict();

const liftBlockSchema = z
  .object({ action: z.literal("lift-block"), id: z.string().uuid() })
  .strict();

const bodySchema = z.discriminatedUnion("action", [
  saveSchema,
  toggleSchema,
  generateSchema,
  applySchema,
  previewBlockSchema,
  saveBlockSchema,
  liftBlockSchema,
]);

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
  INVALID_WEEKS: [
    "Elegí entre 1 y 8 semanas, con la fecha de inicio en formato de fecha.",
    422,
  ],
  INVALID_REQUEST: ["Faltan datos para cambiar el horario.", 422],
  NOT_FOUND: ["No encontramos ese registro. Recargá antes de reintentar.", 404],
  INVALID_SCOPE: ["Elegí si el bloqueo es de todo el gimnasio, una disciplina o un entrenador.", 422],
  INVALID_RANGE: ["La fecha de fin tiene que ser posterior a la de inicio.", 422],
  INVALID_REASON: ["Elegí el motivo y escribí una nota de al menos 3 caracteres.", 422],
  INVALID_SUBSTITUTE: [
    "El sustituto solo aplica cuando bloqueás a un entrenador, tiene que estar activo y no puede ser el mismo.",
    422,
  ],
  CONFIRM_REQUIRED: [
    "Hay reservas en las clases afectadas. Revisá primero qué se va a cancelar y confirmá después.",
    409,
  ],
  BLOCK_EXISTS: ["Ese bloqueo ya está cargado. Revisá la lista antes de repetirlo.", 409],
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

  if (
    parsed.data.action === "preview-generate" ||
    parsed.data.action === "apply-generate"
  ) {
    const args = {
      p_from: parsed.data.from ?? null,
      p_weeks: parsed.data.weeks,
    };
    const { data, error } =
      parsed.data.action === "preview-generate"
        ? await supabase
            .rpc("admin_preview_schedule", args)
            .abortSignal(AbortSignal.timeout(15000))
        : await supabase
            .rpc("admin_apply_schedule", args)
            .abortSignal(AbortSignal.timeout(30000));
    if (error) return failure(error);
    if (!data || typeof data !== "object" || !Array.isArray(data.items))
      return NextResponse.json(
        {
          error: "UNKNOWN",
          message:
            "No pudimos confirmar el plan de generación. Recargá antes de intentarlo otra vez.",
        },
        { status: 503, headers },
      );
    if (parsed.data.action === "preview-generate")
      return NextResponse.json(data, { headers });

    const board = await supabase
      .rpc("admin_schedule_board")
      .abortSignal(AbortSignal.timeout(15000));
    return NextResponse.json(
      { ...data, board: board.error ? null : board.data },
      { headers },
    );
  }

  if (parsed.data.action === "preview-block") {
    const { data, error } = await supabase
      .rpc("admin_preview_schedule_block", {
        p_scope: parsed.data.scope,
        p_class_id: parsed.data.classId ?? null,
        p_coach_id: parsed.data.coachId ?? null,
        p_starts: parsed.data.starts,
        p_ends: parsed.data.ends,
        p_substitute: parsed.data.substituteCoachId ?? null,
      })
      .abortSignal(AbortSignal.timeout(15000));
    if (error) return failure(error);
    if (!data || typeof data !== "object")
      return NextResponse.json(
        {
          error: "UNKNOWN",
          message:
            "No pudimos revisar qué sesiones afecta el bloqueo. Recargá antes de reintentar.",
        },
        { status: 503, headers },
      );
    return NextResponse.json(data, { headers });
  }

  if (parsed.data.action === "save-block") {
    const { data, error } = await supabase
      .rpc("admin_save_schedule_block", {
        p_id: parsed.data.id ?? null,
        p_scope: parsed.data.scope,
        p_class_id: parsed.data.classId ?? null,
        p_coach_id: parsed.data.coachId ?? null,
        p_starts: parsed.data.starts,
        p_ends: parsed.data.ends,
        p_reason_kind: parsed.data.reasonKind,
        p_reason: parsed.data.reason,
        p_substitute: parsed.data.substituteCoachId ?? null,
        p_confirmed: parsed.data.confirmed ?? false,
      })
      .abortSignal(AbortSignal.timeout(30000));
    if (error) return failure(error);
    if (!data || typeof data !== "object" || !Array.isArray(data.blocks))
      return NextResponse.json(
        {
          error: "UNKNOWN",
          message:
            "No pudimos confirmar el bloqueo. Recargá antes de repetirlo.",
        },
        { status: 503, headers },
      );
    const board = await supabase
      .rpc("admin_schedule_board")
      .abortSignal(AbortSignal.timeout(15000));
    return NextResponse.json(
      { ...data, board: board.error ? null : board.data },
      { headers },
    );
  }

  if (parsed.data.action === "lift-block") {
    const { data, error } = await supabase
      .rpc("admin_lift_schedule_block", { p_id: parsed.data.id })
      .abortSignal(AbortSignal.timeout(20000));
    if (error) return failure(error);
    if (!data || typeof data !== "object" || !Array.isArray(data.blocks))
      return NextResponse.json(
        {
          error: "UNKNOWN",
          message: "No pudimos levantar el bloqueo. Recargá antes de repetirlo.",
        },
        { status: 503, headers },
      );
    return NextResponse.json(data, { headers });
  }

  if (parsed.data.action === "set-active") {
    const { data, error } = await supabase
      .rpc("admin_set_schedule_slot_active", {
        p_id: parsed.data.id,
        p_active: parsed.data.active,
        // `p_weeks` se mantiene por compatibilidad: desde 00076 este paso ya
        // no crea clases, solo cambia la semana fija.
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
