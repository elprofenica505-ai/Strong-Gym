import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { removeRoutineItem, saveRoutineItem } from "@/lib/exercises/queries";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

/**
 * «Mi rutina» del cliente (EX-01): guardar o quitar un ejercicio.
 *
 * La ruta no decide de quién es la rutina: la base resuelve el cliente por el
 * perfil de la sesión (`gym_clients.profile_id`), así que el navegador no puede
 * mandar un `client_id` ajeno. Acá sólo se valida la forma del pedido.
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    exerciseId: z.string().trim().min(1).max(80),
    sets: z.number().int().min(1).max(20).nullable().optional(),
    reps: z.string().trim().max(20).nullable().optional(),
    restSeconds: z.number().int().min(0).max(900).nullable().optional(),
    note: z.string().trim().max(200).nullable().optional(),
  }),
  z.object({
    action: z.literal("remove"),
    exerciseId: z.string().trim().min(1).max(80),
  }),
]);

const MESSAGES: Record<string, string> = {
  AUTH: "Iniciá sesión para guardar tu rutina.",
  NO_CLIENT:
    "Para guardar ejercicios necesitás ficha de cliente en el gimnasio. Pedile a recepción que la vincule a tu cuenta.",
  NOT_FOUND: "Ese ejercicio ya no está en la biblioteca. Volvé a la lista y elegí otro.",
  INVALID: "Revisá los datos: series entre 1 y 20, descanso hasta 15 minutos.",
  UNKNOWN: "No pudimos guardar el cambio. Reintentá en un momento.",
};

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ code: "ORIGIN" }, 403);

  const user = await getCurrentUser();
  if (!user) return reply({ code: "AUTH", message: MESSAGES.AUTH }, 403);

  // Cualquier persona con sesión puede tener «Mi rutina»: la base decide si su
  // cuenta tiene ficha de cliente (`NO_CLIENT` si no). El personal también
  // entra, porque usa la biblioteca desde su panel.

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return reply({ code: "INVALID", message: MESSAGES.INVALID }, 422);

  const data = parsed.data;
  const result =
    data.action === "save"
      ? await saveRoutineItem({
          exerciseId: data.exerciseId,
          sets: data.sets ?? null,
          reps: data.reps ?? null,
          restSeconds: data.restSeconds ?? null,
          note: data.note ?? null,
        })
      : await removeRoutineItem(data.exerciseId);

  if (!result.ok) {
    const raw = ("code" in result ? result.code : "UNKNOWN") ?? "UNKNOWN";
    const key = Object.keys(MESSAGES).find((item) => item !== "UNKNOWN" && raw.includes(item)) ?? "UNKNOWN";
    const status = key === "AUTH" ? 403 : key === "NO_CLIENT" ? 409 : key === "NOT_FOUND" ? 404 : key === "INVALID" ? 422 : 503;
    return reply({ code: key, message: MESSAGES[key] }, status);
  }

  return reply({ ok: true, saved: data.action === "save", exerciseId: data.exerciseId });
}
