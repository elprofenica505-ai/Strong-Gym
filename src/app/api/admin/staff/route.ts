import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { STAFF_ERROR_MESSAGES, STAFF_ROLES, staffErrorMessage } from "@/lib/admin/staff";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

const dataSchema = z.object({
  fullName: z.string().max(200),
  nationalId: z.string().max(40),
  birthDate: z.string().max(10),
  phone: z.string().max(40),
  address: z.string().max(400),
  emergencyName: z.string().max(200),
  emergencyPhone: z.string().max(40),
  positionTitle: z.string().max(120),
  hiredOn: z.string().max(10),
  responsibilities: z.string().max(1200),
  internalNotes: z.string().max(1200),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    profileId: z.string().uuid(),
    role: z.enum(STAFF_ROLES as [string, ...string[]]),
    data: dataSchema,
  }),
  z.object({
    action: z.literal("status"),
    profileId: z.string().uuid(),
    active: z.boolean(),
    reason: z.string().max(300).optional(),
  }),
]);

/**
 * Alta, edición y baja del personal. Sólo administrador con verificación en dos pasos.
 * La regla vive en la base (staff_save, staff_set_status): is_admin(), impide actuar
 * sobre la propia ficha, valida cada campo y deja bitácora sin valores sensibles.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "ORIGIN" }, { status: 403, headers });
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mfa !== "ok") {
    return NextResponse.json(
      { error: "AUTH", message: STAFF_ERROR_MESSAGES.AUTH },
      { status: 403, headers },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_DATA", message: "Revisá los datos del formulario." },
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

  const body = parsed.data;
  const { error } =
    body.action === "save"
      ? await supabase.rpc("staff_save", { p_profile: body.profileId, p_role: body.role, p_data: body.data })
      : await supabase.rpc("staff_set_status", {
          p_profile: body.profileId,
          p_active: body.active,
          p_reason: body.reason ?? null,
        });

  if (error) {
    const code = /^[A-Z_]{3,30}$/.test(error.message ?? "") ? error.message : "UNKNOWN";
    if (STAFF_ERROR_MESSAGES[code]) {
      return NextResponse.json({ error: code, message: staffErrorMessage(code) }, { status: code === "AUTH" ? 403 : 422, headers });
    }
    console.error("[admin/staff] rpc falló", { action: body.action, code: error.code });
    return NextResponse.json(
      { error: "UNKNOWN", message: staffErrorMessage("UNKNOWN") },
      { status: 500, headers },
    );
  }

  return NextResponse.json({ ok: true, profileId: body.profileId }, { headers });
}
