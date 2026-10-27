import { z } from "zod";

export const staffMessageReadRequestSchema = z
  .object({
    messageId: z.string().uuid(),
    isRead: z.boolean(),
    expectedIsRead: z.boolean(),
  })
  .strict();

export type StaffMessageReadRequest = z.infer<
  typeof staffMessageReadRequestSchema
>;

export const staffMessageReadResultSchema = z
  .object({
    id: z.string().uuid(),
    is_read: z.boolean(),
    previous_is_read: z.boolean(),
    changed: z.boolean(),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.changed && row.previous_is_read === row.is_read) {
      context.addIssue({
        code: "custom",
        message: "un cambio confirmado debe invertir el estado de lectura",
        path: ["changed"],
      });
    }
    if (!row.changed && row.previous_is_read !== row.is_read) {
      context.addIssue({
        code: "custom",
        message: "una respuesta idempotente debe conservar el estado",
        path: ["changed"],
      });
    }
  });

export type StaffMessageReadResult = z.infer<
  typeof staffMessageReadResultSchema
>;
