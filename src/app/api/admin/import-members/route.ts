import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/import-members
 *
 * Carga masiva de socios desde un CSV. Lo que hace:
 *
 *   1. Por cada fila, valida que tenga email, full_name y phone.
 *   2. Genera un UUID para el perfil.
 *   3. Inserta la fila en public.profiles con role='member' y
 *      status='active'.
 *   4. Crea también la fila en public.member_balances para que
 *      el panel no falle.
 *
 * No crea el usuario en auth.users (eso lo hace el socio
 * registrándose desde el sitio, o el admin de Supabase a mano).
 * Si querés crear también el usuario de auth, decime y lo
 * agregamos a esta misma ruta.
 *
 * Body: { members: ImportRow[] }
 *   ImportRow = {
 *     fullName: string,
 *     email: string,
 *     phone?: string,
 *     planId?: string,
 *     status?: 'active' | 'frozen' | 'cancelled',
 *     birthdate?: string,        // 'YYYY-MM-DD'
 *     address?: string,
 *     emergencyContactName?: string,
 *     emergencyContactPhone?: string,
 *     medicalNotes?: string,
 *   }
 *
 * Devuelve: { ok: true, imported: number, skipped: number, errors: string[] }
 */

const rowSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  planId: z.string().trim().max(40).optional().or(z.literal("")),
  status: z.enum(["active", "frozen", "cancelled"]).optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
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
      { error: "DEMO", message: "La importación solo aplica con Supabase conectado." },
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
  const seenEmails = new Set<string>();

  for (const row of parsed.data.members) {
    const email = row.email.toLowerCase();

    if (seenEmails.has(email)) {
      skipped++;
      errors.push(`email duplicado en el archivo: ${email}`);
      continue;
    }
    seenEmails.add(email);

    // 1) ¿Ya existe?
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      skipped++;
      errors.push(`ya existe: ${email}`);
      continue;
    }

    // 2) Insertar el perfil.
    const insert = {
      id: crypto.randomUUID(),
      full_name: row.fullName,
      email,
      phone: row.phone || null,
      role: "member" as const,
      plan_id: row.planId || null,
      status: row.status || "active",
      birthdate: row.birthdate || null,
      address: row.address || null,
      emergency_contact_name: row.emergencyContactName || null,
      emergency_contact_phone: row.emergencyContactPhone || null,
      medical_notes: row.medicalNotes || null,
      joined_at: new Date().toISOString().slice(0, 10),
    };

    const { error: insErr } = await supabase.from("profiles").insert(insert);
    if (insErr) {
      skipped++;
      errors.push(`error insertando ${email}: ${insErr.message}`);
      continue;
    }

    // 3) Crear la fila de saldo.
    await supabase
      .from("member_balances")
      .insert({ member_id: insert.id, balance_nio: 0, last_movement: null });

    imported++;
  }

  return NextResponse.json({ ok: true, imported, skipped, errors });
}
