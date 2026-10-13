import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const contactSchema = z.object({
  name: z.string().trim().min(2, "name").max(120),
  email: z.string().trim().email("email").max(180),
  phone: z.string().trim().max(40).optional().nullable(),
  subject: z.string().trim().max(80).optional().default("info"),
  message: z.string().trim().min(10, "message").max(4000),
  locale: z.enum(["es", "en"]).optional().default("es"),
  /** Campo trampa: si viene completo, es un bot. */
  website: z.string().max(0).optional().nullable(),
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
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", fields: parsed.error.issues.map((i) => i.path.join(".")) },
      { status: 422 },
    );
  }

  const { website, ...data } = parsed.data;
  // Honeypot: respondemos OK para no darle pistas al bot, pero no guardamos.
  if (website) return NextResponse.json({ ok: true });

  if (!isSupabaseConfigured) {
    // Modo demo: la consulta se ve en el panel de ejemplo.
    return NextResponse.json({ ok: true, mode: "demo" });
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: true, mode: "demo" });

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
}
