import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  // El `id` del comprobante es el de la transacción y no se muestra; además,
  // al releer una fila guardada ya viene validado sin él. Si fuera
  // obligatorio, un comprobante válido se rechazaría en la segunda vuelta.
  id: z.string().optional(),
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
  // FIN-04: el arqueo firmado no se reescribe desde una anulación.
  CASH_SESSION_CLOSED:
    "Ese cobro en efectivo quedó dentro de una caja que ya se cerró con su arqueo, así que no se anula. Registrá un movimiento nuevo que corrija la diferencia, o pedile a administración que revise el turno.",
  NOT_ALLOWED: "Este movimiento no se puede anular con tu rol.",
  INVALID_REASON: "Contá en pocas palabras por qué se anula (entre 5 y 300 caracteres).",
  REQUEST_CONFLICT:
    "Ese pedido ya se usó para otra anulación. Recargá Caja y volvé a intentar.",
  INVALID_REQUEST: "No se pudo preparar la anulación. Recargá Caja y volvé a intentar.",
  INVALID_ACCOUNT: "La cuenta de ese movimiento no existe o cambió de moneda.",
  INVALID_PAYMENT: "El saldo resultante queda fuera del rango permitido.",
  FINANCE_REVIEW_REQUIRED:
    "La caja está en revisión: no se anula nada hasta revisar la estructura financiera.",
  // El resultado no llegó a confirmarse: puede estar guardado o no. Nunca se
  // afirma que no se modificó nada, porque el dinero y el stock pueden haberse
  // movido antes de que se cortara la respuesta.
  UNCONFIRMED:
    "No pudimos confirmar si la anulación quedó guardada. Reintentá desde acá: el pedido es el mismo, así que no se anula dos veces. Si la reversa ya aparece en Caja, no la repitas.",
  UNKNOWN:
    "No se pudo confirmar la anulación. Reintentá desde acá: el pedido es el mismo y no se anula dos veces. Si la reversa ya aparece en Caja, no la repitas.",
};

/**
 * Código corto y seguro para pegar en un mensaje, cuando la anulación no se
 * pudo confirmar. No expone detalles internos: solo la etapa y el tipo de
 * error de la base, con el mismo formato que ya usan los avisos de lectura
 * (`FIN_…`). Sirve para saber dónde se cortó sin adivinar.
 */
export function voidDiagnostic(stage: string, databaseCode?: string): string {
  const safeStage = /^[A-Z_]{2,14}$/.test(stage) ? stage : "ETAPA";
  const safeCode = /^[A-Z0-9]{2,12}$/.test((databaseCode ?? "").toUpperCase())
    ? (databaseCode as string).toUpperCase()
    : "SIN_CODIGO";
  return `ANULACION_${safeStage}_${safeCode}`;
}

export function voidMessage(code: string | undefined): string {
  return (code && VOID_MESSAGES[code]) || VOID_MESSAGES.UNKNOWN;
}

/** Lo que devuelve `finance_void_plan` para un movimiento concreto. */
export const voidPlanSchema = z.object({
  transactionId: z.string(),
  concept: z.string(),
  type: z.string(),
  amount: z.number(),
  currency: z.string(),
  occurredAt: z.string(),
  accountId: z.string().nullable().optional(),
  isReversal: z.boolean(),
  alreadyVoided: z.boolean(),
  voidedAt: z.string().nullable().optional(),
  allowed: z.boolean(),
  code: z.string(),
});

export type VoidPlan = z.infer<typeof voidPlanSchema>;

export function parseVoidPlan(value: unknown): VoidPlan | null {
  const parsed = voidPlanSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Dónde se cuenta el resultado de una anulación.
 *
 * Es una página, no una respuesta de datos: la arma el servidor leyendo la
 * base, así que el resultado no se pierde si el cuerpo de una respuesta no
 * llega completo en el celular. Ver `panel/caja/anulacion/[id]`.
 */
export function voidResultPath(locale: string, transactionId: string): string {
  const safeLocale = /^[a-z]{2}$/.test(locale) ? locale : "es";
  return `/${safeLocale}/panel/caja/anulacion/${transactionId}`;
}

/**
 * Qué mostrar después de pedir una anulación, sin depender de que la respuesta
 * haya llegado: la verdad es lo que quedó guardado en la base.
 */
export type VoidOutcome =
  | { kind: "done"; receipt: VoidReceipt }
  | { kind: "not_done"; code: string; message: string; canRetry: boolean }
  | { kind: "unknown"; message: string };

export function voidOutcome(plan: unknown, receipt: unknown): VoidOutcome {
  const stored = parseVoidReceipt(receipt);
  if (stored) return { kind: "done", receipt: stored };

  const parsedPlan = parseVoidPlan(plan);
  if (!parsedPlan) {
    // No se pudo leer ni el estado: se dice la verdad, sin afirmar que no pasó
    // nada. Lo que sí es cierto: anular dos veces está bloqueado por la base.
    return {
      kind: "unknown",
      message:
        "No pudimos leer el estado de esta anulación ahora mismo. Volvé a entrar a esta pantalla en unos segundos: si la reversa se guardó, aparece acá con su comprobante y no hace falta repetirla.",
    };
  }

  if (parsedPlan.allowed) {
    return {
      kind: "not_done",
      code: parsedPlan.code,
      message:
        "Esta anulación no quedó guardada: el movimiento original sigue tal como estaba. Podés intentarla otra vez desde acá.",
      canRetry: true,
    };
  }

  // La base ya decidió que no se puede anular. El motivo viene del servidor.
  return {
    kind: "not_done",
    code: parsedPlan.code,
    message: voidMessage(parsedPlan.code),
    canRetry: false,
  };
}

/**
 * Recupera la anulación ya guardada de un movimiento.
 *
 * Si la base anuló pero la respuesta se perdió en el camino (red del celular,
 * recarga a mitad de camino), el dinero y el stock quedaron movidos y la
 * pantalla, sin embargo, diría que falló. Antes de avisar de un error se
 * consulta la bitácora: si la anulación existe, se devuelve su comprobante y
 * la pantalla muestra el resultado real.
 *
 * La lectura la hace la sesión del usuario, con la política de personal de
 * `finance_voids`: nadie ve anulaciones que no le correspondan.
 */
export async function findStoredVoidReceipt(
  supabase: SupabaseClient,
  transactionId: string,
): Promise<VoidReceipt | null> {
  const { data, error } = await supabase
    .from("finance_voids")
    .select("receipt")
    .eq("original_id", transactionId)
    .maybeSingle();
  if (error || !data) return null;
  return parseVoidReceipt((data as { receipt?: unknown }).receipt);
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

/**
 * Una vigencia que activó el cobro que se está por anular.
 *
 * Existe porque anular un cobro **da de baja** la membresía que pagó: quien
 * anula tiene que verlo antes de confirmar y después leer qué quedó, en vez de
 * descubrirlo por la persona que sigue entrando al gimnasio.
 */
export interface VoidPlanImpact {
  id: string;
  planId: string;
  planName: string;
  access: string;
  startedOn: string;
  expiresOn: string;
  pricePaid: number | null;
  currency: string;
  voided: boolean;
  state: "active" | "upcoming" | "expired" | "voided";
}

const planImpactRowSchema = z
  .object({
    id: z.string(),
    planId: z.string(),
    planName: z.string(),
    access: z.string(),
    startedOn: z.string(),
    expiresOn: z.string(),
    pricePaid: z.number().nullable().optional(),
    currency: z.string(),
    voided: z.boolean().optional().default(false),
    state: z.enum(["active", "upcoming", "expired", "voided"]),
  });

/** Valida lo que devuelve la base; una fila rota se descarta, no se dibuja. */
export function parseVoidPlanImpact(value: unknown): VoidPlanImpact[] {
  if (!Array.isArray(value)) return [];
  // Fila por fila: una fila rara se descarta sin vaciar el aviso completo.
  return value.flatMap((item) => {
    const parsed = planImpactRowSchema.safeParse(item);
    if (!parsed.success) return [];
    return [toImpact(parsed.data)];
  });
}

function toImpact(row: z.infer<typeof planImpactRowSchema>): VoidPlanImpact {
  return {
    id: row.id,
    planId: row.planId,
    planName: row.planName,
    access: row.access,
    startedOn: row.startedOn,
    expiresOn: row.expiresOn,
    pricePaid: row.pricePaid ?? null,
    currency: row.currency,
    voided: row.voided || row.state === "voided",
    state: row.state,
  };
}

/** Nombre del acceso tal como lo ve la persona. */
export function accessLabel(access: string): string {
  if (access === "gym") return "Gimnasio";
  if (access === "boxing") return "Boxeo";
  if (access === "class") return "Clases";
  return access;
}

/** Cada vigencia con su tramo: «Gimnasio: del 28 de octubre al 26 de noviembre». */
function segmentsText(rows: VoidPlanImpact[]): string {
  return rows
    .map(
      (row) =>
        `${accessLabel(row.access)}: del ${formatPlanDay(row.startedOn)} al ${formatPlanDay(row.expiresOn)}`,
    )
    .join("; ");
}

/**
 * Aviso previo: qué se da de baja si se confirma la anulación.
 *
 * La misma frase se usa en el diálogo y en la página de resultado, para que no
 * haya dos versiones del mismo hecho. Se arma con lo que devuelve la base: si
 * el cobro no activó ninguna vigencia, no se inventa una advertencia.
 */
export function planImpactWarning(impact: VoidPlanImpact[]): string | null {
  const vivas = impact.filter((row) => !row.voided && row.state !== "expired");
  if (!vivas.length) return null;
  const una = vivas.length === 1;
  return `Este cobro activó ${una ? "la vigencia de" : "las vigencias de"} ${segmentsText(vivas)}. Al anular, ${una ? "esa vigencia se da de baja" : "esas vigencias se dan de baja"} y los días que venían encadenados se adelantan: nadie pierde ni gana días.`;
}

/** Resultado: qué vigencias quedaron anuladas de verdad. */
export function planImpactDone(impact: VoidPlanImpact[]): string | null {
  const anuladas = impact.filter((row) => row.voided);
  if (!anuladas.length) return null;
  const una = anuladas.length === 1;
  return `La vigencia que activó este cobro quedó anulada: ${segmentsText(anuladas)}. Los días encadenados se adelantaron, sin perder días.`;
}

function formatPlanDay(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("es-NI", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
