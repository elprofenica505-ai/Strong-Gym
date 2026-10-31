import { z } from "zod";

/**
 * Anulación controlada de un movimiento (FIN-01).
 *
 * La regla vive en la base (`finance_void_plan` y `finance_void_movement`):
 * acá solo se comparte el contrato que usan la pantalla y la API, para que el
 * pedido, la respuesta y los textos de error sean los mismos en los dos lados.
 *
 * Nada de esto borra un movimiento: la anulación crea otro movimiento con el
 * signo contrario y guarda el motivo, el actor y la fecha.
 */

export const VOID_REASON_MIN = 5;
export const VOID_REASON_MAX = 300;

export const voidRequestSchema = z.object({
  transactionId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(VOID_REASON_MIN, "Contá en pocas palabras por qué se anula (mínimo 5).")
    .max(VOID_REASON_MAX, "El motivo no puede pasar de 300 caracteres."),
  requestId: z.string().uuid(),
});

export type VoidRequest = z.infer<typeof voidRequestSchema>;

export interface VoidReceipt {
  reversalId: string;
  originalId: string;
  amount: number;
  currency: string;
  concept: string;
  originalConcept: string;
  reason: string;
  accountName: string;
  accountBefore: number;
  accountAfter: number;
  actorName: string;
  occurredAt: string;
  /** Productos que la venta había descontado y la anulación devolvió (FIN-08). */
  stockRestored?: { productId: string; name: string; qty: number }[];
}

const receiptSchema = z.object({
  id: z.string(),
  originalId: z.string(),
  reversalId: z.string(),
  amount: z.number(),
  currency: z.string(),
  concept: z.string(),
  originalConcept: z.string(),
  reason: z.string(),
  accountName: z.string(),
  accountBefore: z.number(),
  accountAfter: z.number(),
  actorName: z.string(),
  occurredAt: z.string(),
  stockRestored: z
    .array(z.object({ productId: z.string(), name: z.string(), qty: z.number() }))
    .optional(),
});

/** Motivos legibles para los códigos que devuelve la base. */
export const VOID_MESSAGES: Record<string, string> = {
  AUTH: "No tenés permiso para anular movimientos. Pedile a administración.",
  NOT_FOUND: "No encontramos ese movimiento. Recargá Caja y volvé a intentar.",
  ALREADY_VOIDED: "Ese movimiento ya está anulado. Mirá la lista: la reversa está abajo.",
  IS_REVERSAL: "Esto es una reversa de una anulación: no se anula dos veces.",
  NOT_VOIDABLE:
    "Una transferencia no se anula desde acá: mueve dos cuentas. Corregila con otra transferencia.",
  PERMISSION_OFF:
    "La anulación desde caja está apagada. Solo administración puede anular.",
  NOT_YOURS: "Solo podés anular movimientos cargados por vos.",
  NOT_TODAY: "Desde caja solo se anulan movimientos del día de hoy.",
  NOT_ALLOWED: "Este movimiento no se puede anular con tu rol.",
  INVALID_REASON: "Contá en pocas palabras por qué se anula (entre 5 y 300 caracteres).",
  REQUEST_CONFLICT:
    "Ese pedido ya se usó para otra anulación. Recargá Caja y volvé a intentar.",
  INVALID_REQUEST: "No se pudo preparar la anulación. Recargá Caja y volvé a intentar.",
  INVALID_ACCOUNT: "La cuenta de ese movimiento no existe o cambió de moneda.",
  INVALID_PAYMENT: "El saldo resultante queda fuera del rango permitido.",
  FINANCE_REVIEW_REQUIRED:
    "La caja está en revisión: no se anula nada hasta revisar la estructura financiera.",
  UNKNOWN: "No se pudo anular. No se modificó nada; reintentá en unos segundos.",
};

export function voidMessage(code: string | undefined): string {
  return (code && VOID_MESSAGES[code]) || VOID_MESSAGES.UNKNOWN;
}

/** Valida el comprobante que devuelve la base antes de mostrarlo. */
export function parseVoidReceipt(value: unknown): VoidReceipt | null {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success) return null;
  const data = parsed.data;
  return {
    reversalId: data.reversalId,
    originalId: data.originalId,
    amount: data.amount,
    currency: data.currency,
    concept: data.concept,
    originalConcept: data.originalConcept,
    reason: data.reason,
    accountName: data.accountName,
    accountBefore: data.accountBefore,
    accountAfter: data.accountAfter,
    actorName: data.actorName,
    occurredAt: data.occurredAt,
    ...(data.stockRestored && data.stockRestored.length
      ? { stockRestored: data.stockRestored }
      : {}),
  };
}
