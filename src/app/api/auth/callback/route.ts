import { NextResponse } from "next/server";
import { authLocale } from "@/lib/auth/redirects";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

/** PKCE: código de un uso, unido al verificador del navegador que solicitó el correo. */
export async function GET(request: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ error: "CONFIGURATION_UNAVAILABLE" }, { status: 503, headers });
  const url = new URL(request.url);
  const locale = authLocale(url.searchParams.get("locale"));
  const flow = url.searchParams.get("flow");
  const failure = flow === "recovery" ? `/${locale}/recuperar?error=link` : `/${locale}/ingresar?error=link`;
  const redirect = (path: string) => new NextResponse(null, {
    status: 303, headers: { ...headers, Location: path }, // Relativo: no confiar en Host/X-Forwarded-Host.
  });
  const code = url.searchParams.get("code");
  if (url.searchParams.has("error") || !code || code.length > 4096 ||
      url.searchParams.getAll("code").length !== 1 ||
      url.searchParams.getAll("flow").length !== 1 ||
      url.searchParams.getAll("locale").length > 1 ||
      !["signup", "recovery"].includes(flow ?? "")) return redirect(failure);
  try {
    const client = await getSupabaseServerClient();
    if (!client) return redirect(failure);
    const exchanged = await client.auth.exchangeCodeForSession(code);
    if (exchanged.error || !exchanged.data.session) return redirect(failure);
    const verified = await client.auth.getUser();
    if (verified.error || !verified.data.user || verified.data.user.id !== exchanged.data.session.user.id) return redirect(failure);
    // flow sólo selecciona pantalla; NO concede permisos ni prueba por sí solo tipo de email.
    return redirect(flow === "recovery" ? `/${locale}/recuperar/actualizar` : `/${locale}/mi-cuenta`);
  } catch { return redirect(failure); }
}
