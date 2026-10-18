import type { AppBooking } from "@/components/providers/app-provider";
import type { BookingDetail } from "@/lib/types";

/**
 * El GET autenticado manda sobre la instantánea SSR. Los metadatos SSR sólo
 * completan una fila de la MISMA identidad, reserva y sesión; nunca su estado.
 * null significa detalle no confirmado, no «cero reservas».
 */
export function resolveAccountBookings(
  current: AppBooking[],
  initial: BookingDetail[],
  userId: string | undefined,
): BookingDetail[] | null {
  if (!userId) return [];
  const rows: BookingDetail[] = [];
  for (const booking of current) {
    const detail: BookingDetail | undefined = booking.detail ?? initial.find((row) =>
      row.user_id === userId && row.id === booking.id && row.session_id === booking.sessionId,
    );
    if (!detail || detail.user_id !== userId || detail.id !== booking.id ||
        detail.session_id !== booking.sessionId || detail.session?.id !== booking.sessionId)
      return null;
    rows.push({ ...detail, status: booking.status, created_at: booking.createdAt });
  }
  return rows;
}
