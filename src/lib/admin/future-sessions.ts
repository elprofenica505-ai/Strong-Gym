import { z } from "zod";

export const FUTURE_SESSION_GENERATION_WEEKS = 4;

const weeksSchema = z.number().int().min(1).max(8);
const countSchema = z.number().int().nonnegative();
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "la fecha debe existir en el calendario");

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export const adminFutureSessionsRequestSchema = z
  .object({
    weeks: weeksSchema,
  })
  .strict();

export type AdminFutureSessionsRequest = z.infer<
  typeof adminFutureSessionsRequestSchema
>;

export const adminFutureSessionsResultSchema = z
  .object({
    weeks: weeksSchema,
    first_monday: isoDateSchema,
    last_sunday: isoDateSchema,
    created_count: countSchema,
    scheduled_count: countSchema,
  })
  .strict()
  .superRefine((row, context) => {
    const expectedLastSunday = addDays(
      row.first_monday,
      row.weeks * 7 - 1,
    );
    if (row.last_sunday !== expectedLastSunday) {
      context.addIssue({
        code: "custom",
        message: "el rango confirmado no cubre las semanas pedidas",
        path: ["last_sunday"],
      });
    }
    if (row.scheduled_count < row.created_count) {
      context.addIssue({
        code: "custom",
        message: "las sesiones creadas deben quedar programadas en el rango",
        path: ["scheduled_count"],
      });
    }
  });

export type AdminFutureSessionsResult = z.infer<
  typeof adminFutureSessionsResultSchema
>;
