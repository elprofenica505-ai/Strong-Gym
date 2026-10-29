import { z } from "zod";

// Sólo plan asignado; no estado de pago ni vigencia. Nunca expone notas del CRM.
const plan = z.object({
  id: z.string().min(1),
  name_es: z.string().min(1),
  name_en: z.string().min(1),
  is_active: z.boolean(),
}).strict();
// Vigencia real (CLI-01). Una asignación sin cobro sigue sin fechas.
const planAccess = z
  .object({
    key: z.string(),
    label: z.string(),
    state: z.enum(["active", "upcoming", "expired", "none"]),
    plan_id: z.string().nullable(),
    starts_on: z.string().nullable(),
    expires_on: z.string().nullable(),
    days_left: z.number().int().nonnegative(),
  })
  .strict();
const planSegment = z
  .object({
    id: z.string(),
    plan_id: z.string(),
    access: z.enum(["gym", "class"]),
    class_id: z.string().nullable(),
    class_name: z.string().nullable(),
    started_on: z.string(),
    expires_on: z.string(),
    price: z.union([z.number(), z.string()]).nullable(),
    currency: z.string(),
  })
  .strict();
const planValidity = z
  .object({
    today: z.string(),
    gym: planAccess,
    // `classes` llega con la migración 00068; `boxing` es el formato anterior.
    // Aceptar ambos permite desplegar el código sin cortar vigencias.
    classes: z.array(planAccess).optional().default([]),
    boxing: planAccess.optional(),
    segments: z.array(planSegment),
  })
  .strict();
export const accountPlanSchema = z.discriminatedUnion("linked", [
  // `validity` es opcional para no romper si la consulta aún no la incluye.
  z
    .object({
      linked: z.literal(false),
      plan: z.null(),
      validity: planValidity.nullable().optional(),
    })
    .strict(),
  z
    .object({
      linked: z.literal(true),
      plan: plan.nullable(),
      validity: planValidity.nullable().optional(),
    })
    .strict(),
]);
export type AccountPlan = z.infer<typeof accountPlanSchema>;
export type AccountPlanRead = { userId: string } & (
  | { ok: true; data: AccountPlan }
  | { ok: false; code: string }
);
