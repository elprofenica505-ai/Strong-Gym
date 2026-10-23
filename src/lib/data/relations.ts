import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Coach, GymClass, Session, SessionDetail } from "@/lib/types";
import { checkedRead, DataReadError, requireRows } from "./read-result";

export const SESSION_COLUMNS =
  "id,class_id,coach_id,starts_at,ends_at,capacity,room,status";
export const BOOKING_COLUMNS =
  "id,session_id,user_id,status,created_at,cancelled_at";

/** Lecturas explícitas, con la misma sesión/RLS: no dependen del caché de joins
 * de PostgREST ni crean/cambian claves foráneas en una base existente.
 * Lotes acotados evitan URLs demasiado largas y no consultan IDs ajenos.
 */
export async function rowsByIds<T extends { id: string }>(
  db: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
  operation: string,
): Promise<Map<string, T>> {
  return checkedRead(operation, async () => {
    if (ids.some((id) => typeof id !== "string" || !id))
      throw new DataReadError(operation, "INVALID");
    const unique = [...new Set(ids)];
    const found = new Map<string, T>();
    for (let offset = 0; offset < unique.length; offset += 100) {
      const batch = unique.slice(offset, offset + 100);
      const result = await db
        .from(table)
        .select(columns)
        .in("id", batch)
        .abortSignal(AbortSignal.timeout(15000));
      for (const row of requireRows(operation, result) as unknown as T[]) {
        if (
          !row ||
          typeof row.id !== "string" ||
          !batch.includes(row.id) ||
          found.has(row.id)
        )
          throw new DataReadError(operation, "INVALID");
        found.set(row.id, row);
      }
    }
    // Falta/RLS no es un permiso para inventar ni omitir silenciosamente registros.
    if (found.size !== unique.length)
      throw new DataReadError(operation, "RELATION");
    return found;
  });
}

export async function resolveSessions(
  db: SupabaseClient,
  rows: Session[],
): Promise<Map<string, SessionDetail>> {
  const [classes, coaches] = await Promise.all([
    rowsByIds<GymClass>(
      db,
      "classes",
      "*",
      rows.map((row) => row.class_id),
      "SESSION_CLASSES",
    ),
    rowsByIds<Coach>(
      db,
      "coaches_public",
      "*",
      rows.flatMap((row) => (row.coach_id === null ? [] : [row.coach_id])),
      "SESSION_COACHES",
    ),
  ]);
  return new Map(
    rows.map((row) => {
      const gymClass = classes.get(row.class_id);
      if (!gymClass) throw new DataReadError("SESSION_CLASSES", "RELATION");
      const capacity = row.capacity ?? gymClass.capacity;
      if (!Number.isSafeInteger(capacity) || capacity < 0)
        throw new DataReadError("SESSIONS", "INVALID");
      return [
        row.id,
        {
          ...row,
          capacity,
          gymClass,
          coach: row.coach_id === null ? null : coaches.get(row.coach_id)!,
          bookedCount: 0,
          spotsLeft: 0,
        },
      ];
    }),
  );
}
