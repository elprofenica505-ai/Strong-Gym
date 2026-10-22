import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminRole } from "@/lib/auth/current-user";
import { HEALTH_CONSENT_VERSION } from "@/lib/nutrition/consent";
import { PARQ_VERSION, parqAnswersComplete, parqHasYes } from "@/lib/nutrition/parq";
import {
  DISCLAIMER_ES,
  DISCLAIMER_VERSION,
  buildPlan,
  inputsSchema,
  type PlanInputs,
} from "@/lib/nutrition/plan";

export const dynamic = "force-dynamic";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const failures: Record<string, [number, string]> = {
  AUTH: [403, "No tenés permiso para cambiar este plan."],
  INVALID_GOAL: [422, "Elegí un objetivo de la lista."],
  NOT_FOUND: [404, "No encontramos tu ficha de cliente. Pedile al administrador que la cree."],
  NO_PLAN: [409, "Primero calculá tu plan; después podés guardarlo en el gimnasio."],
  NO_WEIGHT: [422, "Tu cálculo no tiene peso válido. Calculá el plan de nuevo."],
  MINOR: [403, "Esta herramienta es sólo para mayores de 18 años."],
  NO_BIRTHDATE: [409, "Confirmá tu fecha de nacimiento antes de usar la calculadora."],
  NO_CONSENT: [409, "Aceptá el consentimiento de datos de salud para continuar."],
  CONSENT_VERSION: [409, "El texto del consentimiento cambió. Recargá la página y aceptalo de nuevo."],
  BIRTHDATE_INVALID: [422, "Revisá la fecha de nacimiento."],
  BIRTHDATE_LOCKED: [409, "Tu fecha de nacimiento ya está registrada. Si está mal, pedile al gimnasio que la corrija."],
  NO_TARGET: [409, "El plan no tiene peso objetivo. Recalculalo antes de aprobarlo."],
  NO_ROUTINE: [409, "El plan no tiene ejercicios. Agregá al menos uno antes de aprobarlo."],
  PARQ_POSITIVE: [409, "Por tus respuestas, consultá con tu médico antes de calcular tu plan."],
  PARQ_INCOMPLETE: [422, "Respondé todas las preguntas del cuestionario de actividad física."],
  LOCKED_BY_STAFF: [
    409,
    "Tu entrenador ajustó tu plan. Para recalcularlo, pedile que lo haga o que lo habilite.",
  ],
};

const mealSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(40),
        title: z.string().trim().min(1).max(60),
        text: z.string().trim().min(1).max(400),
        share: z.number().min(0).max(1),
        kcal: z.number().min(0).max(10000),
        proteinG: z.number().min(0).max(1000),
        carbsG: z.number().min(0).max(1000),
        fatG: z.number().min(0).max(1000),
      })
      .strict(),
  )
  .min(1)
  .max(12);

const routineSchema = z
  .array(
    z
      .object({
        day: z.string().trim().min(1).max(30),
        focus: z.string().trim().min(1).max(60),
        exercises: z
          .array(
            z
              .object({
                name: z.string().trim().min(2).max(120),
                sets: z.number().int().min(1).max(10),
                reps: z.string().trim().min(1).max(40),
                restSec: z.number().int().min(0).max(600),
              })
              .strict(),
          )
          .min(1)
          .max(12),
      })
      .strict(),
  )
  .min(1)
  .max(12);

const postSchema = z.discriminatedUnion("action", [
  // El cliente calcula su propio plan desde Mi cuenta. Queda pendiente hasta que el personal lo apruebe.
  // La edad no se envía: el servidor la calcula desde la fecha de nacimiento (00048).
  z.object({
    action: z.literal("self"),
    inputs: inputsSchema.omit({ age: true }),
    // Cuestionario de actividad física: una respuesta por pregunta (true = sí).
    parq: z.object({
      version: z.literal(PARQ_VERSION),
      answers: z.array(z.boolean()).length(7),
    }),
    // El cliente debe aceptar la política de seguridad antes de calcular.
    acceptDisclaimer: z.literal(true, { message: "Aceptá el aviso de seguridad para calcular." }),
  }),
  // El cliente acepta el consentimiento de datos de salud (versión vigente).
  z.object({ action: z.literal("consent"), version: z.literal(HEALTH_CONSENT_VERSION) }),
  // El cliente revoca su consentimiento.
  z.object({ action: z.literal("revoke") }),
  // El cliente confirma su fecha de nacimiento (una sola vez).
  z.object({
    action: z.literal("birthdate"),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  // Administrador o entrenador aprueba el plan: se publica la dieta y se abren meta y rutina.
  z.object({ action: z.literal("approve"), client: z.string().uuid() }),
  // El cliente guarda su cálculo en el gimnasio (crea la medición de peso y altura, una sola vez).
  z.object({ action: z.literal("submit") }),
  // Entrenador o administrador guarda el cálculo, con ediciones opcionales.
  z.object({
    action: z.literal("save"),
    client: z.string().uuid(),
    inputs: inputsSchema,
    mealPlan: mealSchema.optional(),
    routine: routineSchema.optional(),
  }),
  // Sólo administrador: permiso del entrenador por cliente.
  z.object({
    action: z.literal("tools"),
    client: z.string().uuid(),
    trainer: z.boolean(),
  }),
]);

async function context() {
  if (!isSupabaseConfigured)
    return { response: reply({ error: "Conectá Supabase; no se guardan planes de demostración." }, 503), db: null, user: null };
  const user = await getCurrentUser();
  if (!user) return { response: reply({ error: "Iniciá sesión para continuar." }, 403), db: null, user: null };
  const db = await getSupabaseServerClient();
  return db
    ? { db, response: null, user }
    : { db: null, response: reply({ error: "No se pudo confirmar la conexión." }, 503), user: null };
}

function failure(error: { message?: string }) {
  const code = error.message && failures[error.message] ? error.message : undefined;
  const [status, message] = code
    ? failures[code]
    : [503, "No se pudo confirmar el guardado. Recargá la página antes de repetirlo."];
  return reply({ error: message, code: code ?? "UNKNOWN" }, status);
}

export async function GET(request: Request) {
  try {
    const ctx = await context();
    if (!ctx.db) return ctx.response;
    const client = new URL(request.url).searchParams.get("client");
    if (client !== null && !z.string().uuid().safeParse(client).success)
      return reply({ error: "Cliente no válido." }, 422);
    const { data, error } = await ctx.db
      .rpc("nutrition_get", { p_client: client })
      .abortSignal(AbortSignal.timeout(15000));
    if (error) return failure(error);
    // Edad desde la fecha de nacimiento (sólo lectura). Sin edad, el servidor bloquea el cálculo del cliente.
    const { data: age } = await ctx.db.rpc("client_age_years", { p_client: client });
    const withAge = data && typeof data === "object" ? { ...data, age: typeof age === "number" ? age : null } : data;
    return reply({ data: withAge, disclaimer: DISCLAIMER_ES, disclaimerVersion: DISCLAIMER_VERSION });
  } catch {
    return reply({ error: "No se pudo cargar el plan. Intentá de nuevo." }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await context();
    if (!ctx.db) return ctx.response;
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return reply({ error: "Revisá los datos: edad 14–90, peso 30–250 kg, altura 120–230 cm." }, 422);
    const body = parsed.data;

    if (body.action === "tools") {
      if (!isAdminRole(ctx.user?.role)) return reply({ error: "Sólo el administrador cambia este permiso." }, 403);
      const { data, error } = await ctx.db.rpc("admin_set_client_tools", {
        p_client: body.client,
        p_trainer: body.trainer,
      });
      if (error) return failure(error);
      return reply({ ok: true, data });
    }

    if (body.action === "consent") {
      const { data, error } = await ctx.db.rpc("record_health_consent", { p_version: body.version });
      if (error) return failure(error);
      return reply({ ok: true, data });
    }

    if (body.action === "revoke") {
      const { data, error } = await ctx.db.rpc("revoke_health_consent");
      if (error) return failure(error);
      return reply({ ok: true, data });
    }

    if (body.action === "birthdate") {
      const { data, error } = await ctx.db.rpc("set_my_birthdate", { p_birthdate: body.birthDate });
      if (error) return failure(error);
      return reply({ ok: true, data });
    }

    if (body.action === "approve") {
      const { data, error } = await ctx.db.rpc("nutrition_approve", { p_client: body.client });
      if (error) return failure(error);
      return reply({ ok: true, data });
    }

    if (body.action === "submit") {
      const { data, error } = await ctx.db.rpc("nutrition_submit_to_gym");
      if (error) return failure(error);
      return reply({ ok: true, data });
    }

    // Cliente: la edad sale de su fecha de nacimiento; sin fecha no hay cálculo.
    let inputs: PlanInputs;
    let parqRecord: { version: string; answers: boolean[]; answeredAt: string } | null = null;
    if (body.action === "self") {
      if (!parqAnswersComplete(body.parq.answers)) return failure({ message: "PARQ_INCOMPLETE" });
      if (parqHasYes(body.parq.answers)) return failure({ message: "PARQ_POSITIVE" });
      parqRecord = { version: body.parq.version, answers: body.parq.answers, answeredAt: new Date().toISOString() };
      const { data: age, error: ageError } = await ctx.db.rpc("client_age_years", { p_client: null });
      if (ageError) return failure(ageError);
      if (typeof age !== "number") return failure({ message: "NO_BIRTHDATE" });
      const full = inputsSchema.safeParse({ ...body.inputs, age });
      if (!full.success) return reply({ error: "Revisá los datos del cálculo." }, 422);
      inputs = full.data;
    } else {
      inputs = body.inputs;
    }

    // Los resultados se recalculan aquí; el navegador no decide kcal, IMC ni macros.
    const built = buildPlan(inputs);
    const common = {
      p_goal: inputs.goal,
      p_inputs: inputs,
      p_results: built.results,
      p_meal_plan: built.mealPlan,
      p_routine: built.routine,
      p_guide: built.guide,
    };
    const { error } =
      body.action === "self"
        ? await ctx.db.rpc("nutrition_self_calculate", {
            p_goal: common.p_goal,
            // Se guarda la versión del aviso y la hora de aceptación junto con los datos.
            p_inputs: {
              ...common.p_inputs,
              disclaimerVersion: DISCLAIMER_VERSION,
              disclaimerAcceptedAt: new Date().toISOString(),
              parq: parqRecord,
            },
            p_results: common.p_results,
            p_meal_plan: common.p_meal_plan,
            p_routine: common.p_routine,
            p_guide: common.p_guide,
          })
        : await ctx.db.rpc("nutrition_save", {
            p_client: body.client,
            p_goal: common.p_goal,
            p_inputs: common.p_inputs,
            p_results: common.p_results,
            // Las ediciones del entrenador reemplazan la tabla y la rutina generadas.
            p_meal_plan: body.mealPlan ?? common.p_meal_plan,
            p_routine: body.routine ?? common.p_routine,
            p_guide: common.p_guide,
          });
    if (error) return failure(error);
    // Cliente: el plan queda pendiente de aprobación; no se devuelven tablas ni resultados.
    if (body.action === "self") return reply({ ok: true, pendingApproval: true });
    // Personal: guarda y ve el resultado; el plan sigue pendiente hasta aprobarlo.
    return reply({ ok: true, pendingApproval: true, results: built.results, sources: built.sources, disclaimer: DISCLAIMER_ES });
  } catch {
    return reply({ error: "No se pudo guardar el plan. Revisá la conexión y recargá antes de repetir." }, 503);
  }
}
