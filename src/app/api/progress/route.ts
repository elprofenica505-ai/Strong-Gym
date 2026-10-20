import { NextResponse } from "next/server";
import { z } from "zod";
import { isStaffRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { parseGoalForm, parseMeasurementForm, parseRoutineExercises, DAY_KEYS } from "@/lib/progress/forms";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("measurement"),
    clientId: z.string().uuid(),
    confirmed: z.boolean().optional(),
    data: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("goal"),
    clientId: z.string().uuid(),
    data: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("routine"),
    clientId: z.string().uuid(),
    name: z.string().min(2).max(80),
    days: z.array(z.enum(DAY_KEYS)).min(1).max(7),
    exercisesText: z.string().max(6000),
  }),
]);

const messages: Record<string, [string, number]> = {
  AUTH: ["No tenés permiso para cambiar los datos de este cliente. Revisá tu sesión (verificación en dos pasos) o tu acceso.", 403],
  VALUES_INVALID: ["Los datos de la medición no tienen el formato correcto.", 422],
};

/**
 * Medidas, metas y rutinas de un cliente. La regla dura vive en la base (00039):
 * RLS y las funciones de escritura. Aquí se valida el formato y los avisos.
 * Caja registra medidas; metas y rutinas las cambia el administrador o el entrenador asignado.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role) || user.mfa !== "ok") {
    return NextResponse.json({ error: "AUTH", message: messages.AUTH[0] }, { status: 403, headers });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID", message: "Revisá los datos del formulario." }, { status: 422, headers });
  }
  const body = parsed.data;

  let rpc: { name: string; args: Record<string, unknown> };
  if (body.action === "measurement") {
    const result = parseMeasurementForm(body.data);
    if (!result.ok) return NextResponse.json({ error: "INVALID", message: result.errors.join(" ") }, { status: 422, headers });
    if (result.data.needsConfirmation.length > 0 && body.confirmed !== true) {
      return NextResponse.json(
        { error: "CONFIRM", message: "Hay valores fuera del rango habitual. Confirmalos para guardar.", fields: result.data.needsConfirmation },
        { status: 409, headers },
      );
    }
    const v = result.data.values;
    rpc = {
      name: "record_body_measurement",
      args: {
        p_client: body.clientId,
        p_measured_on: result.data.measuredOn,
        p_weight: result.data.weightKg,
        p_height: result.data.heightCm,
        p_values: v,
        p_notes: result.data.notes,
      },
    };
  } else if (body.action === "goal") {
    const result = parseGoalForm(body.data);
    if (!result.ok) return NextResponse.json({ error: "INVALID", message: result.errors.join(" ") }, { status: 422, headers });
    rpc = {
      name: "set_client_goal",
      args: {
        p_client: body.clientId,
        p_goal_type: result.data.goalType,
        p_other_label: result.data.otherLabel,
        p_starts_on: result.data.startsOn,
        p_target_date: result.data.targetDate,
        p_target_weight: result.data.targetWeightKg,
      },
    };
  } else {
    const ex = parseRoutineExercises(body.exercisesText);
    if (!ex.ok) return NextResponse.json({ error: "INVALID", message: ex.errors.join(" ") }, { status: 422, headers });
    rpc = {
      name: "set_client_routine",
      args: { p_client: body.clientId, p_name: body.name, p_days: body.days, p_exercises: ex.data },
    };
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "UNAVAILABLE", message: "No hay conexión con la base de datos." }, { status: 503, headers });
  }
  const { error } = await supabase.rpc(rpc.name, rpc.args);
  if (error) {
    const known = messages[error.message ?? ""];
    if (known) return NextResponse.json({ error: error.message, message: known[0] }, { status: known[1], headers });
    // Restricciones de la base (límites, plazo, fechas): mensaje seguro, sin SQL.
    if (error.code === "23514" || error.code === "23502" || error.code === "22P02" || error.code === "23505") {
      return NextResponse.json(
        { error: "RULE", message: "La base no aceptó esos datos. Revisá plazos, fechas y valores; no se guardó nada." },
        { status: 422, headers },
      );
    }
    console.error(`[progress ${rpc.name}] falló`, { code: error.code });
    return NextResponse.json({ error: "UNKNOWN", message: "No se pudo guardar. No se modificó ningún dato." }, { status: 500, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}
