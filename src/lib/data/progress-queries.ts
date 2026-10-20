import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkedRead, DataReadError, requireRows } from "@/lib/data/read-result";
import type { MeasureKey } from "@/lib/progress/rules";

export interface MeasurementRow {
  id: string;
  measuredOn: string;
  weightKg: number;
  heightCm: number | null;
  values: Record<MeasureKey, number | null>;
  notes: string | null;
}

export interface GoalRow {
  id: string;
  goalType: "perdida" | "ganancia" | "mantenimiento" | "otra";
  otherLabel: string | null;
  startsOn: string;
  targetDate: string;
  targetWeightKg: number | null;
}

export interface RoutineRow {
  id: string;
  name: string;
  days: string[];
  exercises: Array<{ ejercicio: string; series: number | null; reps: string | null; descanso_s: number | null }>;
  startsOn: string;
}

export interface ClientProgress {
  clientId: string;
  clientName: string;
  measurements: MeasurementRow[];
  goal: GoalRow | null;
  routine: RoutineRow | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * Progreso de un cliente, leído con la sesión del usuario. Si RLS no devuelve
 * nada, la pantalla lo muestra como "sin acceso", nunca como cliente vacío.
 * Un error de consulta lanza DataReadError (no se confunde con "sin datos").
 */
export async function getClientProgress(clientId: string): Promise<ClientProgress | null> {
  return checkedRead("PROGRESS", async () => {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return null;

    // Nombre: el personal de caja y administración lo lee de la ficha; el entrenador, de su lista asignada.
    let clientName: string | null = null;
    const ficha = await supabase.from("gym_clients").select("full_name").eq("id", clientId).maybeSingle();
    if (!ficha.error && ficha.data) clientName = ficha.data.full_name as string;
    if (!clientName) {
      const roster = await supabase.rpc("trainer_roster");
      if (!roster.error) {
        const row = ((roster.data ?? []) as Array<{ client_id: string; full_name: string | null }>)
          .find(r => r.client_id === clientId);
        clientName = row?.full_name ?? null;
      }
    }
    if (!clientName) return null;

    const [measures, goals, routines] = await Promise.all([
      supabase.from("body_measurements").select("*").eq("client_id", clientId)
        .order("measured_on", { ascending: false }).order("created_at", { ascending: false }).limit(200),
      supabase.from("client_goals").select("*").eq("client_id", clientId).eq("status", "activa").limit(1),
      supabase.from("client_routines").select("*").eq("client_id", clientId).eq("status", "activa").limit(1),
    ]);

    const measurements = requireRows("PROGRESS_MEASURES", measures).map((r: Record<string, unknown>): MeasurementRow => ({
      id: r.id as string,
      measuredOn: r.measured_on as string,
      weightKg: Number(r.weight_kg),
      heightCm: num(r.height_cm),
      values: {
        cintura_cm: num(r.cintura_cm), pecho_cm: num(r.pecho_cm),
        biceps_relajado_cm: num(r.biceps_relajado_cm), biceps_contraido_cm: num(r.biceps_contraido_cm),
        antebrazo_cm: num(r.antebrazo_cm), gluteo_cm: num(r.gluteo_cm),
        muslo_cm: num(r.muslo_cm), pantorrilla_cm: num(r.pantorrilla_cm),
      },
      notes: (r.notes as string | null) ?? null,
    }));

    const goalRow = requireRows("PROGRESS_GOAL", goals)[0] as Record<string, unknown> | undefined;
    const routineRow = requireRows("PROGRESS_ROUTINE", routines)[0] as Record<string, unknown> | undefined;

    return {
      clientId,
      clientName,
      measurements,
      goal: goalRow ? {
        id: goalRow.id as string,
        goalType: goalRow.goal_type as GoalRow["goalType"],
        otherLabel: (goalRow.other_label as string | null) ?? null,
        startsOn: goalRow.starts_on as string,
        targetDate: goalRow.target_date as string,
        targetWeightKg: num(goalRow.target_weight_kg),
      } : null,
      routine: routineRow ? {
        id: routineRow.id as string,
        name: routineRow.name as string,
        days: (routineRow.days as string[]) ?? [],
        exercises: (routineRow.exercises as RoutineRow["exercises"]) ?? [],
        startsOn: routineRow.starts_on as string,
      } : null,
    };
  });
}

/** Clientes del entrenador (sólo los asignados y aprobados, por la función trainer_roster). */
export async function getMyProgressRoster(): Promise<Array<{ clientId: string; fullName: string }>> {
  return checkedRead("PROGRESS_ROSTER", async () => {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("trainer_roster");
    if (error) throw new DataReadError("PROGRESS_ROSTER", error.code);
    return ((data ?? []) as Array<{ client_id: string; full_name: string | null }>).map(r => ({
      clientId: r.client_id,
      fullName: r.full_name ?? "Sin nombre",
    }));
  });
}
