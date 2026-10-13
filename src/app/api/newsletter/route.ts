import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email().max(180),
  locale: z.enum(["es", "en"]).optional().default("es"),
});

/** POST /api/newsletter → suscribe un email a las novedades. */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 422 });

  if (!isSupabaseConfigured) return NextResponse.json({ ok: true, mode: "demo" });

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: true, mode: "demo" });

  // Si el email ya estaba, `upsert` evita el error de duplicado.
  const { error } = await supabase
    .from("subscribers")
    .upsert(
      { email: parsed.data.email, locale: parsed.data.locale },
      { onConflict: "email", ignoreDuplicates: true },
    );

  if (error) return NextResponse.json({ error: "UNKNOWN" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
