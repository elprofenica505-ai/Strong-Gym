import { z } from "zod";

const classIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^\S+$/, "el identificador no puede tener espacios");

export const adminClassActiveRequestSchema = z
  .object({
    classId: classIdSchema,
    isActive: z.boolean(),
    expectedIsActive: z.boolean(),
  })
  .strict();

export type AdminClassActiveRequest = z.infer<
  typeof adminClassActiveRequestSchema
>;

export const adminClassActiveResultSchema = z
  .object({
    id: classIdSchema,
    is_active: z.boolean(),
    previous_is_active: z.boolean(),
    changed: z.boolean(),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.changed && row.previous_is_active === row.is_active) {
      context.addIssue({
        code: "custom",
        message: "un cambio confirmado debe invertir el estado de la disciplina",
        path: ["changed"],
      });
    }
    if (!row.changed && row.previous_is_active !== row.is_active) {
      context.addIssue({
        code: "custom",
        message: "una respuesta idempotente debe conservar el estado",
        path: ["changed"],
      });
    }
  });

export type AdminClassActiveResult = z.infer<
  typeof adminClassActiveResultSchema
>;
