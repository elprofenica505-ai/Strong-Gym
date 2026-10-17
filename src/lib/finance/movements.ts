import { z } from "zod";

const fields = {
  requestId: z.string().uuid(),
  amount: z.number().positive().max(99999999).multipleOf(0.01),
  currency: z.enum(["NIO", "USD"]),
  method: z.string().min(1).max(80),
  account: z.string().min(1).max(80),
  concept: z.string().trim().min(2).max(200),
  // Ambos tipos de moneda requieren una tasa explícita, nunca una tasa fija.
  fx: z.number().min(0.0001).max(10000).multipleOf(0.0001),
};
export const movementSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...fields,
      kind: z.literal("service_income"),
      clientId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      ...fields,
      kind: z.literal("expense"),
      category: z.string().min(1).max(80),
    })
    .strict(),
]);
export type MovementIntent = z.infer<typeof movementSchema>;
export const financeOptionsSchema = z.object({
  protocol: z.literal("service-v1"),
  writes_enabled: z.boolean(),
  finance_layout: z.literal("bank_accounts_split"),
  methods: z.array(
    z.object({
      id: z.string(),
      name_es: z.string(),
      accepts_nio: z.boolean(),
      accepts_usd: z.boolean(),
    }),
  ),
  accounts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      currency: z.enum(["NIO", "USD"]),
    }),
  ),
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type FinanceOptions = z.infer<typeof financeOptionsSchema>;
export const receiptSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  requestId: z.string().uuid(),
  kind: z.enum(["service_income", "expense"]),
  occurredAt: z.string().datetime({ offset: true }),
  amount: z.number().positive(),
  currency: z.enum(["NIO", "USD"]),
  amountNio: z.number().nonnegative(),
  amountUsd: z.number().nonnegative(),
  fx: z.number().positive(),
  concept: z.string(),
  clientId: z.string().uuid().nullable(),
  clientName: z.string().nullable(),
  categoryName: z.string().nullable(),
  accountId: z.string(),
  accountName: z.string(),
  methodName: z.string(),
  actorId: z.string().uuid(),
  actorName: z.string().nullable(),
  accountBefore: z.number(),
  accountAfter: z.number(),
});
export type MovementReceipt = z.infer<typeof receiptSchema>;

export const movementResultSchema = z.object({ id: z.string().uuid() });
