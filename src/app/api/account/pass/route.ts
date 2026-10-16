import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "AUTH" }, { status: 401, headers });
    const db = await getSupabaseServerClient();
    if (!db)
      return NextResponse.json({ error: "DEMO" }, { status: 503, headers });
    const { data, error } = await db.rpc("crm_my_pass");
    return NextResponse.json(
      error
        ? {
            error:
              "No se pudo cargar el carnet. Pedí búsqueda manual en recepción.",
          }
        : { data },
      { status: error ? 503 : 200, headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Sin conexión" },
      { status: 503, headers },
    );
  }
}
