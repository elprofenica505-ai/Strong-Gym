import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
});

/** PATCH /api/account → actualiza los datos del perfil. */
export async function PATCH(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      {
        error: "DEMO",
        message:
          "Esta acción requiere Supabase conectado; no se guardó información.",
      },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "AUTH" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    return NextResponse.json({ error: "INVALID" }, { status: 422 });

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase)
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });

    const { error } = await supabase
      .from("profiles")
      .update({
        ...(parsed.data.fullName ? { full_name: parsed.data.fullName } : {}),
        ...(parsed.data.phone !== undefined
          ? { phone: parsed.data.phone || null }
          : {}),
      })
      .eq("id", user.id)
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: "UNKNOWN" }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}
