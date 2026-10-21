import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkedRead, DataReadError } from "@/lib/data/read-result";
import type { AttendanceData } from "@/lib/attendance/summary";

/**
 * Asistencia de un cliente (función client_attendance, migración 00041).
 * clientId = null → la ficha propia del cliente que inició sesión.
 * Devuelve null si no hay permiso o no hay ficha; un error lanza DataReadError.
 */
export async function getClientAttendance(clientId: string | null): Promise<AttendanceData | null> {
  return checkedRead("ATTENDANCE", async () => {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("client_attendance", { p_client: clientId });
    if (error) throw new DataReadError("ATTENDANCE", error.code);
    if (!data) return null;
    const d = data as Record<string, unknown>;
    return {
      clientId: d.client_id as string,
      today: d.today as string,
      totalVisits: Number(d.total_visits ?? 0),
      lastVisit: (d.last_visit as string | null) ?? null,
      visits30Days: Number(d.visits_30_days ?? 0),
      days: (d.days ?? []) as string[],
      weeks: ((d.weeks ?? []) as Array<{ week_start: string; visits: number }>).map(w => ({ weekStart: w.week_start, visits: Number(w.visits) })),
      months: ((d.months ?? []) as Array<{ month: string; visits: number }>).map(m => ({ month: m.month, visits: Number(m.visits) })),
    };
  });
}
