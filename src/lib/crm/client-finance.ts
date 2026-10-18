import { z } from "zod";

const money = z.number().finite().nonnegative();
const split = z.object({ credit_nio: money, credit_usd: money, debt_nio: money, debt_usd: money });
const collections = z.object({
  count_nio: z.number().int().nonnegative(), amount_nio: money,
  count_usd: z.number().int().nonnegative(), amount_usd: money,
}).superRefine((value, ctx) => {
  for (const currency of ["nio", "usd"] as const) {
    if ((value[`count_${currency}`] === 0) !== (value[`amount_${currency}`] === 0))
      ctx.addIssue({ code: "custom", message: "COLLECTIONS_INCONSISTENT" });
  }
});
const schema = z.object({
  version: z.literal(1), client_id: z.string(), profile_id: z.string().nullable(),
  layout: z.enum(["repository", "bank_accounts_split", "unsupported"]),
  source: z.enum(["profile", "client"]).optional(),
  balance_status: z.enum(["ready", "unlinked", "missing", "unsupported"]),
  balance_nio: z.number().finite().nullable(), balances: split.nullable(),
  collections: collections.nullable(),
}).superRefine((value, ctx) => {
  const known = value.layout !== "unsupported";
  const ready = value.balance_status === "ready";
  if ((value.source !== undefined && (value.source === "client") !== (value.profile_id === null)) ||
      (!known) !== (value.balance_status === "unsupported") ||
      known !== (value.collections !== null) ||
      (known && (value.profile_id === null) !== (value.balance_status === "unlinked") &&
        !(value.profile_id === null && value.source === "client" && ready)) ||
      (value.layout === "repository" && (value.balances !== null || ready !== (value.balance_nio !== null))) ||
      (value.layout === "bank_accounts_split" && (value.balance_nio !== null || ready !== (value.balances !== null))) ||
      (!ready && (value.balance_nio !== null || value.balances !== null)))
    ctx.addIssue({ code: "custom", message: "BALANCE_INCONSISTENT" });
});
export type ClientFinance = z.infer<typeof schema>;

/** No coerción: null, texto, NaN y campos ausentes nunca se convierten en cero. */
export function readClientFinance(value: unknown, clientId: string, profileId: string | null | undefined): ClientFinance | null {
  const result = schema.safeParse(value);
  if (!result.success || result.data.client_id !== clientId || result.data.profile_id !== profileId) return null;
  return result.data;
}

const paymentsSchema = z.array(z.object({
  id: z.string().uuid(), occurred_at: z.string().datetime({ offset: true }),
  concept: z.string(), amount: money.positive(), currency: z.enum(["NIO", "USD"]),
  status: z.enum(["completed", "pending", "cancelled", "reversed"]),
})).max(40);
export function readClientPayments(value: unknown) {
  const result = paymentsSchema.safeParse(value);
  return result.success ? result.data : null;
}
