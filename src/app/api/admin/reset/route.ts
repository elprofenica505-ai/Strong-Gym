import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reset
 *
 * Borra datos de EJEMPLO de la base. Lo que se borra es lo que
 * insertó la migración 00011_finance_seed.sql (conceptos que
 * empiezan con [SEED-GASTO]) y los socios con email
 * @stronggym-ejemplo.com. NO se tocan:
 *
 *   - Las tablas, funciones, vistas ni políticas de seguridad.
 *   - Tu usuario admin.
 *   - Cualquier dato que no sea de ejemplo.
 *
 * Requiere rol admin o staff.
 *
 * Body:
 *   { "scope": "members" | "transactions" | "coaches" | "all" }
 */

const schema = z.object({
  scope: z.enum(["members", "transactions", "coaches", "all"]),
});

const SEED_EMAIL = "%@stronggym-ejemplo.com";
const SEED_TX_PREFIX = "[SEED-GASTO]%";

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { error: "DEMO", message: "El reset solo aplica con Supabase conectado." },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "staff")) {
    return NextResponse.json({ error: "AUTH" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "NO_DB" }, { status: 500 });
  }

  const result: Record<string, number> = {};

  if (parsed.data.scope === "members" || parsed.data.scope === "all") {
    // 1) IDs de los socios de ejemplo.
    const { data: seedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", SEED_EMAIL);
    const ids = (seedProfiles ?? []).map((p) => p.id);

    if (ids.length > 0) {
      // 2) Borrar las dependencias (en orden por la FK).
      await supabase.from("member_balances").delete().in("member_id", ids);
      await supabase.from("invoices").delete().in("member_id", ids);
      await supabase.from("transactions").delete().in("member_id", ids);
      // 3) Borrar los perfiles (la auth debe correr en cascada o lo
      // borra el admin de Supabase a mano; acá solo la fila).
      const { count } = await supabase
        .from("profiles")
        .delete()
        .in("id", ids)
        .select("id");
      result.members = count ?? ids.length;
    } else {
      result.members = 0;
    }
  }

  if (parsed.data.scope === "transactions" || parsed.data.scope === "all") {
    const { count } = await supabase
      .from("transactions")
      .delete()
      .ilike("concept", SEED_TX_PREFIX)
      .select("id");
    result.transactions = count ?? 0;
  }

  if (parsed.data.scope === "coaches" || parsed.data.scope === "all") {
    // Solo los 3 coaches del seed. Si el admin ya cargó otros con
    // los mismos ids, se borran también. Más adelante se puede
    // hacer un soft-delete.
    const SEED_COACH_IDS = ["coa_dg", "coa_mr", "coa_jl"];
    const { count } = await supabase
      .from("coaches")
      .delete()
      .in("id", SEED_COACH_IDS)
      .select("id");
    result.coaches = count ?? 0;
  }

  return NextResponse.json({ ok: true, scope: parsed.data.scope, deleted: result });
}
