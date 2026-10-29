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
/** Segmento de vigencia creado junto con un cobro estructurado. */
export const planSegmentSchema = z
  .object({
    id: z.string().uuid(),
    plan_id: z.string().min(1),
    access: z.enum(["gym", "class"]),
    class_id: z.string().nullable().optional(),
    class_name: z.string().nullable().optional(),
    started_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.number().int().positive().max(3660),
  })
  .strict();
export type PlanSegment = z.infer<typeof planSegmentSchema>;
export const checkoutItemSchema = z
  .object({
    product: z.string().uuid(),
    qty: z.number().int().positive().max(1000),
    unitPrice: z.number().positive().max(9999999).multipleOf(0.01),
  })
  .strict();
export type CheckoutItem = z.infer<typeof checkoutItemSchema>;
const toCents = (value: number) => Math.round(value * 100);
export const movementSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...fields,
        // En un cobro combinado, este importe es solo la parte de servicio.
        // Puede ser cero únicamente cuando hay productos para vender.
        amount: z.number().nonnegative().max(99999999).multipleOf(0.01),
        kind: z.literal("service_income"),
        clientId: z.string().uuid(),
        // Opcional para no invalidar intentos guardados antes de CLI-01.
        // Solo crea vigencia si el servidor reconoce el plan y el importe exacto.
        planId: z.string().min(1).max(64).optional(),
        items: z.array(checkoutItemSchema).max(50).default([]),
      })
      .strict(),
    z
      .object({
        ...fields,
        kind: z.literal("expense"),
        category: z.string().min(1).max(80),
      })
      .strict(),
  ])
  .superRefine((movement, ctx) => {
    if (movement.kind !== "service_income") return;
    const products = new Set<string>();
    let productsTotalCents = 0;
    for (const item of movement.items) {
      if (products.has(item.product)) {
        ctx.addIssue({
          code: "custom",
          message: "DUPLICATE_CHECKOUT_PRODUCT",
          path: ["items"],
        });
        return;
      }
      products.add(item.product);
      productsTotalCents += toCents(item.unitPrice) * item.qty;
    }
    if (movement.items.length === 0 && movement.amount <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "EMPTY_SERVICE_MOVEMENT",
        path: ["amount"],
      });
    }
    if (movement.items.length > 0 && movement.currency !== "NIO") {
      ctx.addIssue({
        code: "custom",
        message: "PRODUCTS_REQUIRE_NIO",
        path: ["currency"],
      });
    }
    if (toCents(movement.amount) + productsTotalCents > 9999999900) {
      ctx.addIssue({
        code: "custom",
        message: "CHECKOUT_TOTAL_TOO_HIGH",
        path: ["items"],
      });
    }
  });
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
  plans: z
    .array(
      z.object({
        id: z.string(),
        name_es: z.string(),
        slug: z.string().optional(),
        period: z.string().optional(),
        price_nio: z.union([z.number(), z.string()]).nullable().optional(),
        access: z.enum(["gym", "class"]).nullable().optional(),
        class_id: z.string().nullable().optional(),
        class_name: z.string().nullable().optional(),
        duration_days: z.number().int().positive().nullable().optional(),
        validity_currency: z.enum(["NIO", "USD"]).nullable().optional(),
        validity_amount: z.union([z.number(), z.string()]).nullable().optional(),
      }),
    )
    .default([]),
});
export type FinanceOptions = z.infer<typeof financeOptionsSchema>;
export const receiptSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  requestId: z.string().uuid(),
  kind: z.enum(["service_income", "expense", "debt_payment"]),
  cashReceived:z.number().finite().positive().max(99999999).multipleOf(0.01).optional(),
  changeGiven:z.number().finite().nonnegative().max(99999999).multipleOf(0.01).optional(),
  debtBefore: z.number().finite().nonnegative().optional(),
  debtAfter: z.number().finite().nonnegative().optional(),
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
}).superRefine((r,ctx)=>{
  if((r.cashReceived!==undefined||r.changeGiven!==undefined)&&(r.kind!=='debt_payment'||r.cashReceived===undefined||r.changeGiven===undefined||r.cashReceived<r.amount||Math.abs(r.cashReceived-r.changeGiven-r.amount)>0.000001))ctx.addIssue({code:'custom',message:'INVALID_CASH_RECEIPT'});
  if(r.kind==='debt_payment'&&(r.debtBefore===undefined||r.debtAfter===undefined||
    Math.abs(r.debtBefore-r.debtAfter-r.amount)>0.000001||Math.abs(r.accountAfter-r.accountBefore-r.amount)>0.000001))
    ctx.addIssue({code:"custom",message:"INVALID_DEBT_PAYMENT_RECEIPT"});
});
export type MovementReceipt = z.infer<typeof receiptSchema>;

const resultMoney = z.number().finite().nonnegative().max(99999999).multipleOf(0.01);
export const movementResultSchema = z
  .object({
    id: z.string().uuid(),
    transactionIds: z.array(z.string().uuid()).min(1).max(51).optional(),
    receipts: z
      .array(
        z.object({
          id: z.string().uuid(),
          label: z.string().trim().min(2).max(200),
          amount: resultMoney.refine((value) => value > 0),
        }),
      )
      .min(1)
      .max(51)
      .optional(),
    serviceTransactionId: z.string().uuid().nullable().optional(),
    serviceAmount: resultMoney.optional(),
    plan: planSegmentSchema.nullable().optional(),
    productsTotal: resultMoney.optional(),
    total: resultMoney.refine((value) => value > 0).optional(),
    currency: z.enum(["NIO", "USD"]).optional(),
  })
  .superRefine((result, ctx) => {
    if (
      result.serviceAmount !== undefined &&
      result.productsTotal !== undefined &&
      result.total !== undefined &&
      toCents(result.serviceAmount) + toCents(result.productsTotal) !==
        toCents(result.total)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "CHECKOUT_RESULT_TOTAL_MISMATCH",
        path: ["total"],
      });
    }
    if (result.receipts && !result.receipts.some((r) => r.id === result.id)) {
      ctx.addIssue({
        code: "custom",
        message: "CHECKOUT_PRIMARY_RECEIPT_MISSING",
        path: ["receipts"],
      });
    }
  });
export type MovementResult = z.infer<typeof movementResultSchema>;
