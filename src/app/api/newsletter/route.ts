import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { allowRequest, clientIp, FORM_RULE, isHoneypotFilled } from "@/lib/antispam";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email().max(180),
  locale: z.enum(["es", "en"]).optional().default("es"),
  /** Campo trampa: si viene con texto, es un bot. */
  website: z.string().max(500).optional().nullable(),
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
  if (!parsed.success)
    return NextResponse.json({ error: "INVALID" }, { status: 422 });

  if (isHoneypotFilled(parsed.data.website)) return NextResponse.json({ ok: true });
  if (!allowRequest("newsletter", clientIp(request), FORM_RULE))
    return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  if (!isSupabaseConfigured)
    return NextResponse.json(
      {
        error: "DEMO",
        message:
          "Esta acción requiere Supabase conectado; no se guardó información.",
      },
      { status: 503 },
    );

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase)
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });

    // Si el email ya estaba, `upsert` evita el error de duplicado.
    const { error } = await supabase
      .from("subscribers")
      .upsert(
        { email: parsed.data.email, locale: parsed.data.locale },
        { onConflict: "email", ignoreDuplicates: true },
      );

    if (error) return NextResponse.json({ error: "UNKNOWN" }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}
