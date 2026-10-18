import { z } from "zod";

// Sólo plan asignado; no estado de pago ni vigencia. Nunca expone notas del CRM.
const plan = z.object({
  id: z.string().min(1),
  name_es: z.string().min(1),
  name_en: z.string().min(1),
  is_active: z.boolean(),
}).strict();
export const accountPlanSchema = z.discriminatedUnion("linked", [
  z.object({ linked: z.literal(false), plan: z.null() }).strict(),
  z.object({ linked: z.literal(true), plan: plan.nullable() }).strict(),
]);
export type AccountPlan = z.infer<typeof accountPlanSchema>;
export type AccountPlanRead = { userId: string } & (
  | { ok: true; data: AccountPlan }
  | { ok: false; code: string }
);
