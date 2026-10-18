import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { allowRequest, clientIp, FORM_RULE, isHoneypotFilled } from "@/lib/antispam";

export const dynamic = "force-dynamic";

const contactSchema = z.object({
  name: z.string().trim().min(2, "name").max(120),
  email: z.string().trim().email("email").max(180),
  phone: z.string().trim().max(40).optional().nullable(),
  subject: z.string().trim().max(80).optional().default("info"),
  message: z.string().trim().min(10, "message").max(4000),
  locale: z.enum(["es", "en"]).optional().default("es"),
  /** Campo trampa: si viene completo, es un bot. */
  website: z.string().max(500).optional().nullable(),
});

/** POST /api/contact → guarda la consulta del formulario. */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(payload);
  if (parsed.success && isHoneypotFilled(parsed.data.website)) {
    // Robot: respondemos OK para no darle pistas, pero no guardamos nada.
    return NextResponse.json({ ok: true });
  }
  if (!allowRequest("contact", clientIp(request), FORM_RULE)) {
    return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID",
        fields: parsed.error.issues.map((i) => i.path.join(".")),
      },
      { status: 422 },
    );
  }

  const { website: _website, ...data } = parsed.data;

  if (!isSupabaseConfigured) {
    // Sin base no se simula un envío exitoso.
    return NextResponse.json(
      {
        error: "DEMO",
        message:
          "Esta acción requiere Supabase conectado; no se guardó información.",
      },
      { status: 503 },
    );
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase)
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });

    const { error } = await supabase.from("messages").insert({
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      subject: data.subject || "info",
      message: data.message,
      locale: data.locale ?? "es",
    });

    if (error) {
      return NextResponse.json({ error: "UNKNOWN" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}
