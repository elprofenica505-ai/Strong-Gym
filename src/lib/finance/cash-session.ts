/**
 * Cierre y arqueo de caja (FIN-04): reglas que comparten la ruta del servidor y
 * la pantalla de Caja.
 *
 * Por qué existe: abrir una caja, contar el efectivo y cerrarla con una
 * diferencia explicada tiene que dar el mismo resultado en los tres lados —la
 * base, la API y el celular—. Acá están los topes, el redondeo a centavos, la
 * lectura de lo que devuelve la base y los textos de error, una sola vez.
 *
 * Lo que **no** hace este módulo: decidir permisos. La base vuelve a comprobar
 * rol, segundo factor y dueño de la caja en cada llamada; el navegador solo
 * evita errores de tipeo.
 */
import { z } from "zod";

/** Tope de efectivo que acepta la base (`numeric(12,2)`), igual al de un cobro. */
export const CASH_AMOUNT_MAX = 99_999_999;

/** Largo máximo del motivo de apertura o cierre. */
export const CASH_NOTES_MAX = 500;

/** Cuántas cajas cerradas devuelve la base para el historial. */
export const CASH_HISTORY_LIMIT = 20;

export type Currency = "NIO" | "USD";

export interface CashMovementAccount {
  accountId: string;
  currency: string;
  income: number;
  expense: number;
  /** Transferencias que entraron a esta cuenta de caja. */
  transferIn: number;
  /** Transferencias que salieron de esta cuenta de caja. */
  transferOut: number;
}

export interface CashMovements {
  incomeNio: number;
  incomeUsd: number;
  expenseNio: number;
  expenseUsd: number;
  /**
   * Transferencias con otras cuentas (FIN-03). No son ingresos ni egresos,
   * pero sí mueven el efectivo: por eso el «debería haber» las suma o resta.
   */
  transferInNio: number;
  transferInUsd: number;
  transferOutNio: number;
  transferOutUsd: number;
  count: number;
  accounts: CashMovementAccount[];
}

export interface CashSession {
  id: string;
  /** `true` mientras la caja sigue abierta. */
  open: boolean;
  openedAt: string;
  openedById: string | null;
  openedByName: string | null;
  openingNio: number;
  openingUsd: number;
  closedAt: string | null;
  closedById: string | null;
  closedByName: string | null;
  /** Lo contado físicamente. `null` mientras la caja está abierta. */
  countedNio: number | null;
  countedUsd: number | null;
  expectedNio: number;
  expectedUsd: number;
  /** Contado − esperado. `null` mientras la caja está abierta. */
  differenceNio: number | null;
  differenceUsd: number | null;
  notes: string | null;
  closeNotes: string | null;
  movements: CashMovements;
}

export interface CashState {
  open: CashSession | null;
  history: CashSession[];
  cashRule?: string;
}

/** Redondea a centavos, que es lo que guarda la base. */
const toCents = (value: number) => Math.round(value * 100) / 100 + 0;

/**
 * La base devuelve `numeric` como número o como texto según el cliente; las
 * dos formas se aceptan y se redondean a centavos.
 */
const money = z
  .preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
    z.number().finite(),
  )
  .transform(toCents);

const optionalMoney = z
  .preprocess(
    (value) =>
      value === null || value === undefined || (typeof value === "string" && value.trim() === "")
        ? null
        : typeof value === "string"
          ? Number(value)
          : value,
    z.number().finite().nullable(),
  )
  .transform((value) => (value === null ? null : toCents(value)));

const optionalText = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value === undefined || value === null || value.trim() === "" ? null : value));

const optionalId = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value === undefined || value === "" ? null : value));

const movementSchema = z.object({
  incomeNio: money.default(0),
  incomeUsd: money.default(0),
  expenseNio: money.default(0),
  expenseUsd: money.default(0),
  transferInNio: money.default(0),
  transferInUsd: money.default(0),
  transferOutNio: money.default(0),
  transferOutUsd: money.default(0),
  count: z.number().int().nonnegative().default(0),
  accounts: z
    .array(
      z.object({
        accountId: z.string().min(1),
        currency: z.string().min(1),
        income: money.default(0),
        expense: money.default(0),
        transferIn: money.default(0),
        transferOut: money.default(0),
      }),
    )
    .default([]),
});

export const cashSessionSchema = z.object({
  id: z.string().min(1),
  open: z.boolean(),
  openedAt: z.string().min(1),
  openedById: optionalId,
  openedByName: optionalText,
  openingNio: money.default(0),
  openingUsd: money.default(0),
  closedAt: optionalId,
  closedById: optionalId,
  closedByName: optionalText,
  countedNio: optionalMoney,
  countedUsd: optionalMoney,
  expectedNio: money.default(0),
  expectedUsd: money.default(0),
  differenceNio: optionalMoney,
  differenceUsd: optionalMoney,
  notes: optionalText,
  closeNotes: optionalText,
  movements: movementSchema.default({
    incomeNio: 0,
    incomeUsd: 0,
    expenseNio: 0,
    expenseUsd: 0,
    transferInNio: 0,
    transferInUsd: 0,
    transferOutNio: 0,
    transferOutUsd: 0,
    count: 0,
    accounts: [],
  }),
});

export const cashStateSchema = z.object({
  open: cashSessionSchema.nullable().default(null),
  history: z.array(cashSessionSchema).default([]),
  cashRule: z.string().optional(),
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Lee la respuesta de `finance_cash_state`. Devuelve `null` si la forma no
 * coincide: la pantalla muestra «no pudimos leer» en vez de un cero falso.
 */
export function parseCashState(body: unknown): CashState | null {
  const record = asRecord(body);
  if (!record) return null;
  // `{ok:true}` sin estado no es «no hay caja»: es una respuesta que no se
  // entiende. Los valores por defecto del esquema son para leer una caja con
  // campos vacíos, no para inventar una pantalla.
  if (!("state" in record) && !("open" in record) && !("history" in record)) return null;
  const candidate = "state" in record ? record.state : record;
  const parsed = cashStateSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Lee la caja que devuelven `finance_cash_open` / `finance_cash_close`. */
export function parseCashSession(body: unknown): CashSession | null {
  const record = asRecord(body);
  if (!record) return null;
  if (!("session" in record) && !("id" in record)) return null;
  const candidate = "session" in record ? record.session : record;
  const parsed = cashSessionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export interface CashAmount {
  ok: true;
  value: number;
}

export interface CashAmountError {
  ok: false;
  message: string;
}

/**
 * Convierte lo que se escribe en el celular en un monto de la base.
 *
 * Acepta coma o punto como separador decimal («1.500,50» no: solo dos
 * decimales) y vacío como cero cuando el campo es opcional (la apertura).
 */
export function parseCashAmount(raw: string, options: { required?: boolean } = {}): CashAmount | CashAmountError {
  const text = raw.trim();
  if (text === "") {
    if (options.required)
      return { ok: false, message: "Escribí cuánto contaste en esta moneda." };
    return { ok: true, value: 0 };
  }
  const normalized = text.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    return {
      ok: false,
      message: "Escribí solo números, con hasta dos decimales. Ejemplo: 1500.50",
    };
  const value = Number(normalized);
  if (!Number.isFinite(value) || value > CASH_AMOUNT_MAX)
    return { ok: false, message: "El monto es demasiado grande para la caja." };
  return { ok: true, value: toCents(value) };
}

/** Diferencia de arqueo: lo contado menos lo esperado, en centavos. */
export function cashDifference(expected: number, counted: number): number {
  return toCents(counted - expected);
}

/** `true` cuando el arqueo no cuadra y hace falta explicarlo por escrito. */
export function cashNeedsReason(expected: { nio: number; usd: number }, counted: { nio: number; usd: number }): boolean {
  return cashDifference(expected.nio, counted.nio) !== 0 || cashDifference(expected.usd, counted.usd) !== 0;
}

export type CashAction = "open" | "close";

/** Lo que la pantalla manda: la ruta lo valida otra vez. */
export interface CashRequest {
  action: CashAction;
  requestId: string;
  openNio?: number;
  openUsd?: number;
  sessionId?: string;
  countedNio?: number;
  countedUsd?: number;
  notes?: string;
}

const amountField = z
  .number()
  .finite()
  .min(0)
  .max(CASH_AMOUNT_MAX)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Los montos llevan hasta dos decimales.",
  });

const notesField = z.string().trim().max(CASH_NOTES_MAX).optional();

export const cashRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    requestId: z.string().uuid(),
    openNio: amountField.default(0),
    openUsd: amountField.default(0),
    notes: notesField,
  }),
  z.object({
    action: z.literal("close"),
    requestId: z.string().uuid(),
    sessionId: z.string().uuid(),
    countedNio: amountField,
    countedUsd: amountField,
    notes: notesField,
  }),
]);

/** Códigos que devuelve la base, con el texto que ve la persona. */
const CASH_ERRORS: Record<string, string> = {
  AUTH: "No tenés acceso a Caja, o falta verificar el segundo factor. Volvé a iniciar sesión.",
  INVALID_REQUEST:
    "El pedido llegó incompleto. Cerrá esta pantalla y volvé a entrar para reintentar.",
  INVALID_AMOUNT:
    "Revisá los montos: no pueden ser negativos, llevan hasta dos decimales y no pasan de 99 999 999.",
  INVALID_NOTES: "El motivo es demasiado largo: máximo 500 caracteres.",
  CASH_ALREADY_OPEN:
    "Ya hay una caja abierta. Cerrala antes de abrir otra: no se pueden tener dos turnos a la vez.",
  CASH_ALREADY_CLOSED:
    "Esta caja ya fue cerrada. El arqueo guardado no cambia; si necesitás corregirlo, abrí una caja nueva.",
  CASH_NOT_YOURS:
    "Esta caja la abrió otra persona. Solo quien la abrió —o un administrador— puede cerrarla.",
  CASH_DIFFERENCE_REASON_REQUIRED:
    "El arqueo no cuadra. Escribí qué pasó con la diferencia (faltante o sobrante) antes de cerrar.",
  NOT_FOUND: "No encontramos esa caja. Actualizá la pantalla y probá de nuevo.",
  UNKNOWN:
    "No pudimos guardar el cambio. No cierres la pantalla: volvé a intentarlo y, si sigue igual, avisá con el código.",
};

/**
 * Traduce el error de la base a un texto claro. Devuelve también el código
 * corto para mostrarlo como referencia.
 */
export function cashError(code: string | null | undefined): { code: string; message: string } {
  // La base puede devolver solo el código o un mensaje que lo incluya.
  const key = (code ?? "").trim().toUpperCase();
  const match =
    Object.keys(CASH_ERRORS).find((item) => item !== "UNKNOWN" && key.includes(item)) ?? "UNKNOWN";
  return { code: match, message: CASH_ERRORS[match] };
}

/**
 * «Usar lo esperado» (control de faltantes).
 *
 * Rellenar lo contado con lo que la base calcula convierte un faltante en un
 * cierre «que cuadra»: la diferencia desaparece del arqueo y no queda motivo
 * que explicar. Por eso la pantalla sólo se lo ofrece al administrador; el
 * cajero escribe lo que contó y, si falta o sobra, lo justifica por escrito.
 *
 * La decisión se toma por rol, no por permiso de caja: el cajero puede tener
 * todos los interruptores de caja encendidos y aun así no debe poder tapar un
 * faltante con un botón.
 */
export function canPrefillExpected(role: unknown): boolean {
  return role === "admin";
}

/** Texto que queda anotado en el cierre cuando se usa el relleno. */
export const EXPECTED_FILL_NOTE =
  "Cierre con «Usar lo esperado»: el efectivo no se contó billete por billete.";

/**
 * Deja constancia en la nota del cierre sin pisar lo que ya se escribió.
 * Devuelve la nota tal cual si no entra en el largo permitido.
 */
export function markExpectedFill(notes: string): string {
  const text = notes.trim();
  if (text.includes(EXPECTED_FILL_NOTE)) return text;
  const merged = text === "" ? EXPECTED_FILL_NOTE : `${text} · ${EXPECTED_FILL_NOTE}`;
  return merged.length > CASH_NOTES_MAX ? text : merged;
}

/**
 * Lo que la pantalla muestra cuando el cierre sale bien y el arqueo cuadró.
 * Texto pedido tal cual por el dueño del gimnasio.
 */
export const CLOSE_SUCCESS_BALANCED =
  "Operación exitosa, gracias por tus servicios, Bendiciones!";

/** Lo que se muestra cuando se guardó el cierre pero el arqueo no cuadró. */
export function closeSavedWithDifference(input: {
  nio: number;
  usd: number;
}): string {
  const partes: string[] = [];
  if (input.nio !== 0) {
    partes.push(
      input.nio < 0
        ? `faltaron ${formatAmount(Math.abs(input.nio))} en córdobas`
        : `sobraron ${formatAmount(input.nio)} en córdobas`,
    );
  }
  if (input.usd !== 0) {
    partes.push(
      input.usd < 0
        ? `faltaron ${formatAmount(Math.abs(input.usd), "USD")} en dólares`
        : `sobraron ${formatAmount(input.usd, "USD")} en dólares`,
    );
  }
  return `Arqueo guardado con diferencia: ${partes.join(" y ")}. El motivo quedó escrito y la diferencia se ve en «Últimos cierres».`;
}

/** Formato corto para los avisos del arqueo (sin depender del formateador de la pantalla). */
function formatAmount(value: number, currency: "NIO" | "USD" = "NIO"): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Qué pasa cuando el cajero toca «Cerrar caja», **antes** de mandar nada.
 *
 * Regla del dueño: la pantalla no adelanta si falta o sobra plata mientras se
 * escribe. Al guardar, o cuadra (y se avisa en verde) o no cuadra (y recién ahí
 * se abre el panel rojo que pide el motivo). Este cálculo es el que decide cuál
 * de las dos cosas pasa, y está en un solo lugar para que la prueba y la
 * pantalla no puedan discrepar.
 */
export type CloseCheck =
  | { status: "invalid"; message: string }
  | { status: "needs_reason"; differenceNio: number; differenceUsd: number }
  | {
      status: "ready";
      differenceNio: number;
      differenceUsd: number;
      balanced: boolean;
    };

export function checkClose(input: {
  expected: { nio: number; usd: number };
  counted: { nio: number; usd: number };
  notes: string;
}): CloseCheck {
  const differenceNio = cashDifference(input.expected.nio, input.counted.nio);
  const differenceUsd = cashDifference(input.expected.usd, input.counted.usd);
  const balanced = differenceNio === 0 && differenceUsd === 0;
  if (!balanced && input.notes.trim() === "") {
    return { status: "needs_reason", differenceNio, differenceUsd };
  }
  const problem = cashNotesProblem(input.notes, !balanced);
  if (problem) return { status: "invalid", message: problem };
  return { status: "ready", differenceNio, differenceUsd, balanced };
}

/** Motivo de cierre: obligatorio cuando el arqueo no cuadra. */
export function cashNotesProblem(notes: string, needsReason: boolean): string | null {
  const text = notes.trim();
  if (text.length > CASH_NOTES_MAX) return "El motivo es demasiado largo: máximo 500 caracteres.";
  if (needsReason && text === "")
    return "El arqueo no cuadra: escribí qué pasó con la diferencia antes de cerrar.";
  return null;
}
