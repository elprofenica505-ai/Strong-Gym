import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminRole } from "@/lib/auth/current-user";
import {
  DISCLAIMER_ES,
  DISCLAIMER_VERSION,
  buildPlan,
  inputsSchema,
} from "@/lib/nutrition/plan";

export const dynamic = "force-dynamic";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const failures: Record<string, [number, string]> = {
  AUTH: [403, "No tenés permiso para cambiar este plan. Pedile al administrador que habilite la edición si corresponde."],
  INVALID_GOAL: [422, "Elegí un objetivo de la lista."],
  NOT_FOUND: [404, "No encontramos al cliente."],
};

const mealSchema = z.array(
  z.object({
    id: z.string().min(1).max(40),
    title: z.string().trim().min(1).max(60),
    text: z.string().trim().min(1).max(400),
    share: z.number().min(0).max(1),
  }).strict(),
).min(1).max(12);

const routineSchema = z.array(
  z.object({
    day: z.string().trim().min(1).max(30),
    focus: z.string().trim().min(1).max(60),
    exercises: z.array(
      z.object({
        name: z.string().trim().min(2).max(80),
        sets: z.number().int().min(1).max(10),
        reps: z.string().trim().min(1).max(20),
        restSec: z.number().int().min(0).max(600),
      }).strict(),
    ).min(1).max(12),
  }).strict(),
).min(1).max(7);

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    client: z.string().uuid(),
    inputs: inputsSchema,
    // Ediciones del entrenador: si vienen, reemplazan el plan generado.
    mealPlan: mealSchema.optional(),
    routine: routineSchema.optional(),
  }),
  z.object({
    action: z.literal("tools"),
    client: z.string().uuid(),
    trainer: z.boolean(),
    cashier: z.boolean(),
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
  return reply({ error: message, code: code ?? "UNKNOWN", disclaimer: DISCLAIMER_ES }, status);
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
    return reply({ data, disclaimer: DISCLAIMER_ES, disclaimerVersion: DISCLAIMER_VERSION });
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
      if (!isAdminRole(ctx.user?.role))
        return reply({ error: "Sólo el administrador cambia estos permisos." }, 403);
      const { data, error } = await ctx.db.rpc("admin_set_client_tools", {
        p_client: body.client,
        p_trainer: body.trainer,
        p_cashier: body.cashier,
      });
      if (error) return failure(error);
      return reply({ ok: true, data });
    }

    // Los resultados se recalculan aquí; el navegador no decide kcal ni macros.
    const built = buildPlan(body.inputs);
    const { error } = await ctx.db.rpc("nutrition_save", {
      p_client: body.client,
      p_goal: body.inputs.goal,
      p_inputs: body.inputs,
      p_results: built.results,
      p_meal_plan: body.mealPlan ?? built.mealPlan,
      p_routine: body.routine ?? built.routine,
    });
    if (error) return failure(error);
    return reply({ ok: true, results: built.results, disclaimer: DISCLAIMER_ES });
  } catch {
    return reply({ error: "No se pudo guardar el plan. Revisá la conexión y recargá antes de repetir." }, 503);
  }
}
