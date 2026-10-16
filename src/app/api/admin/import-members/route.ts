import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Ruta histórica conservada. Importa fichas CRM sin crear cuentas de login. */
const rowSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z
    .union([z.literal(""), z.string().trim().email().max(120)])
    .optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  planId: z.string().trim().max(40).optional().or(z.literal("")),
  status: z.enum(["active", "frozen", "cancelled"]).optional(),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  emergencyContactName: z.string().trim().max(120).optional().or(z.literal("")),
  emergencyContactPhone: z.string().trim().max(40).optional().or(z.literal("")),
  medicalNotes: z.string().trim().max(500).optional().or(z.literal("")),
});

const bodySchema = z.object({
  members: z.array(rowSchema).min(1).max(500),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      {
        error: "DEMO",
        message: "La importación solo aplica con Supabase conectado.",
      },
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

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "NO_DB" }, { status: 500 });
  }

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  for (const [index, row] of parsed.data.members.entries()) {
    const { data, error } = await supabase.rpc("crm_import_client", {
      p_row: row,
    });
    if (error) {
      skipped++;
      errors.push(
        `Fila ${index + 2}: ${["PGRST202", "42883"].includes(error.code) ? "Falta instalar FASE2.sql." : "No se guardó. Revisá plan, fechas y campos."}`,
      );
    } else if (!data?.imported) {
      skipped++;
      errors.push(
        `Fila ${index + 2}: posible duplicado; revisalo en Clientes antes de crear otra ficha.`,
      );
    } else imported++;
  }
  return NextResponse.json(
    { ok: true, imported, skipped, errors },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
