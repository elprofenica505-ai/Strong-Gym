import { z } from "zod";
import type { BookingStatus } from "@/lib/types";

export const BOOKING_STATUSES = [
  "confirmed",
  "cancelled",
  "attended",
  "no_show",
] as const satisfies readonly BookingStatus[];

/** Estados que administración/caja pueden fijar desde Operación. */
export const STAFF_BOOKING_TARGET_STATUSES = [
  "attended",
  "no_show",
  "cancelled",
] as const;

export type StaffBookingTargetStatus =
  (typeof STAFF_BOOKING_TARGET_STATUSES)[number];

export const staffBookingStatusRequestSchema = z
  .object({
    bookingId: z.string().uuid(),
    status: z.enum(STAFF_BOOKING_TARGET_STATUSES),
    expectedStatus: z.enum(BOOKING_STATUSES),
  })
  .strict();

export type StaffBookingStatusRequest = z.infer<
  typeof staffBookingStatusRequestSchema
>;

export const staffBookingStatusResultSchema = z
  .object({
    id: z.string().uuid(),
    session_id: z.string().min(1).max(160),
    status: z.enum(STAFF_BOOKING_TARGET_STATUSES),
    previous_status: z.enum(BOOKING_STATUSES),
    changed: z.boolean(),
    cancelled_at: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if ((row.status === "cancelled") !== (row.cancelled_at !== null)) {
      context.addIssue({
        code: "custom",
        message: "cancelled_at no coincide con el estado devuelto",
        path: ["cancelled_at"],
      });
    }
    if (row.changed && row.previous_status === row.status) {
      context.addIssue({
        code: "custom",
        message: "un cambio confirmado no puede conservar el mismo estado",
        path: ["changed"],
      });
    }
    if (!row.changed && row.previous_status !== row.status) {
      context.addIssue({
        code: "custom",
        message: "una respuesta idempotente debe conservar el estado",
        path: ["changed"],
      });
    }
  });

export type StaffBookingStatusResult = z.infer<
  typeof staffBookingStatusResultSchema
>;

/**
 * Regla visible de la pantalla. La RPC vuelve a comprobarla y además aplica
 * las reglas que dependen de la sesión y del cupo en el momento exacto.
 */
export function canStaffChangeBookingStatus(
  current: BookingStatus,
  target: StaffBookingTargetStatus,
): boolean {
  return current !== "cancelled" && current !== target;
}

export function staffBookingStatusActions(
  current: BookingStatus,
): StaffBookingTargetStatus[] {
  return STAFF_BOOKING_TARGET_STATUSES.filter((target) =>
    canStaffChangeBookingStatus(current, target),
  );
}
