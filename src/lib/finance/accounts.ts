/**
 * Cuentas, métodos, categorías y transferencias (FIN-03): las reglas que
 * comparten la ruta del servidor, la pantalla y las pruebas.
 *
 * Por qué existe: dar de alta una cuenta o pasar plata de la caja al banco no
 * puede decidirse en tres lugares distintos. Acá viven los topes, el redondeo a
 * centavos, la conversión de moneda que se muestra antes de confirmar, la
 * lectura de lo que devuelve la base y los textos de error.
 *
 * Lo que **no** hace: decidir permisos. La base vuelve a comprobar
 * administrador con segundo factor en cada llamada; el navegador sólo evita
 * errores de tipeo.
 *
 * Nada de este módulo borra: una cuenta, un método o una categoría se apagan
 * (`isActive = false`) y una transferencia se anula con contra-asiento.
 */
import { z } from "zod";

export type Currency = "NIO" | "USD";
export type AccountType = "caja_fuerte" | "banco" | "billetera";

/** Topes iguales a los de la base (`numeric(12,2)` y validaciones de 00095). */
export const ACCOUNT_AMOUNT_MAX = 99_999_999;
export const ACCOUNT_NAME_MAX = 60;
export const METHOD_NAME_MAX = 40;
export const CATEGORY_NAME_MAX = 40;
export const TRANSFER_CONCEPT_MAX = 200;
export const TRANSFER_CONCEPT_MIN = 2;
export const FX_MIN = 0.0001;
export const FX_MAX = 10_000;

/** Tasa NIO/USD con la que arranca el campo. Es editable: la tasa la pone el gimnasio. */
export const DEFAULT_FX = 36.6;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  caja_fuerte: "Caja fuerte",
  banco: "Banco",
  billetera: "Billetera",
};

export function accountTypeLabel(value: string): string {
  return ACCOUNT_TYPE_LABELS[value as AccountType] ?? value;
}

export const CURRENCY_LABELS: Record<string, string> = {
  NIO: "Córdobas",
  USD: "Dólares",
  BOTH: "Córdobas y dólares",
};

export function currencyLabel(value: string): string {
  return CURRENCY_LABELS[value] ?? value;
}

export interface FinanceAccount {
  id: string;
  name: string;
  accountType: string;
  currency: string;
  bankName: string | null;
  accountNumber: string | null;
  isActive: boolean;
  displayOrder: number;
  /** `null` cuando el rol no tiene el interruptor de saldos. */
  balance: number | null;
  movements: number;
  cashOpen: boolean;
}

export interface PaymentMethodRow {
  id: string;
  name: string;
  currency: string;
  feePct: number;
  isActive: boolean;
  displayOrder: number;
  movements: number;
}

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  color: string;
  budgetMonthly: number | null;
  isActive: boolean;
  displayOrder: number;
  movements: number;
}

export interface TransferRow {
  id: string;
  occurredAt: string;
  status: string;
  fromId: string;
  fromName: string | null;
  toId: string | null;
  toName: string | null;
  amountOut: number;
  currencyOut: string;
  amountIn: number;
  currencyIn: string;
  fx: number;
  amountNio: number;
  concept: string;
  createdByName: string | null;
  voided: boolean;
  voidReason: string | null;
}

export interface SettingsAuditRow {
  id: string;
  at: string;
  action: string;
  target: string | null;
  actorName: string | null;
}

export interface AccountsState {
  accounts: FinanceAccount[];
  methods: PaymentMethodRow[];
  categories: ExpenseCategoryRow[];
  transfers: TransferRow[];
  audit: SettingsAuditRow[];
  canManage: boolean;
  balancesVisible: boolean;
  rules: { transferRule: string };
}

const toCents = (value: number) => Math.round(value * 100) / 100 + 0;

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
  .transform((value) =>
    value === undefined || value === null || value.trim() === "" ? null : value.trim(),
  );

const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  accountType: z.string().min(1),
  currency: z.string().min(1),
  bankName: optionalText,
  accountNumber: optionalText,
  isActive: z.boolean(),
  displayOrder: z.number().int(),
  balance: optionalMoney,
  movements: z.number().int().nonnegative().default(0),
  cashOpen: z.boolean().default(false),
});

const methodSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().min(1),
  feePct: money.default(0),
  isActive: z.boolean(),
  displayOrder: z.number().int().default(0),
  movements: z.number().int().nonnegative().default(0),
});

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  budgetMonthly: optionalMoney,
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  movements: z.number().int().nonnegative().default(0),
});

const transferSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().min(1),
  status: z.string().min(1),
  fromId: z.string().min(1),
  fromName: optionalText,
  toId: optionalText,
  toName: optionalText,
  amountOut: money,
  currencyOut: z.string().min(1),
  amountIn: money,
  currencyIn: z.string().min(1),
  fx: money,
  amountNio: money,
  concept: z.string().min(1),
  createdByName: optionalText,
  voided: z.boolean().default(false),
  voidReason: optionalText,
});

const auditSchema = z.object({
  id: z.string().min(1),
  at: z.string().min(1),
  action: z.string().min(1),
  target: optionalText,
  actorName: optionalText,
});

export const accountsStateSchema = z.object({
  accounts: z.array(accountSchema).default([]),
  methods: z.array(methodSchema).default([]),
  categories: z.array(categorySchema).default([]),
  transfers: z.array(transferSchema).default([]),
  audit: z.array(auditSchema).default([]),
  canManage: z.boolean().default(false),
  balancesVisible: z.boolean().default(false),
  rules: z
    .object({ transferRule: z.string().default("") })
    .default({ transferRule: "" }),
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Lee el estado de la pantalla. Devuelve `null` si la forma no coincide, para
 * que la pantalla diga «no pudimos leer» en vez de mostrar cuentas vacías.
 */
export function parseAccountsState(body: unknown): AccountsState | null {
  const record = asRecord(body);
  if (!record) return null;
  if (!("accounts" in record) || !("methods" in record)) return null;
  const parsed = accountsStateSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

/** Lee el comprobante de una transferencia creada o anulada. */
export const transferReceiptSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  amount: money,
  currency: z.string().min(1),
  amountIn: money.optional(),
  currencyIn: z.string().optional(),
});

export function parseTransferReceipt(body: unknown) {
  const record = asRecord(body);
  if (!record) return null;
  const parsed = transferReceiptSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

/** Convierte lo que se escribe en el celular («1.234,50» no; «1234,50» sí). */
export function parseMoneyInput(text: string): number | null {
  const raw = text.trim().replace(/\s/g, "").replace(",", ".");
  if (raw === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return toCents(value);
}

const hasValidCents = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;

/**
 * Cuánto va a llegar a la cuenta de destino. Se muestra antes de confirmar,
 * con la misma regla que aplica la base: entre monedas distintas se convierte
 * en el destino y se redondea a centavos.
 */
export function transferPreview({
  amount,
  fromCurrency,
  toCurrency,
  fx,
}: {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  fx: number;
}): { amountIn: number | null; message: string | null } {
  if (!Number.isFinite(amount) || amount <= 0 || !hasValidCents(amount)) {
    return { amountIn: null, message: "Escribí un importe mayor que cero, con dos decimales como máximo." };
  }
  if (fromCurrency === toCurrency) return { amountIn: amount, message: null };
  if (!Number.isFinite(fx) || fx < FX_MIN || fx > FX_MAX) {
    return { amountIn: null, message: "Escribí la tasa NIO/USD con la que se hace el cambio." };
  }
  const amountIn =
    fromCurrency === "NIO" ? toCents(amount / fx) : toCents(amount * fx);
  if (amountIn <= 0) {
    return { amountIn: null, message: "Con esa tasa el destino no recibe nada. Revisá el importe y la tasa." };
  }
  return { amountIn, message: null };
}

export type FormResult<T> = { ok: true; value: T } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export interface AccountInput {
  id: string | null;
  name: string;
  accountType: AccountType;
  currency: Currency;
  bankName: string | null;
  accountNumber: string | null;
  displayOrder: number;
  isActive: boolean;
}

export function validateAccountForm(input: {
  id?: string | null;
  name: string;
  accountType: string;
  currency: string;
  bankName?: string;
  accountNumber?: string;
  displayOrder?: number;
  isActive?: boolean;
}): FormResult<AccountInput> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > ACCOUNT_NAME_MAX) {
    return fail(`El nombre de la cuenta lleva entre 2 y ${ACCOUNT_NAME_MAX} caracteres.`);
  }
  if (!["caja_fuerte", "banco", "billetera"].includes(input.accountType)) {
    return fail("Elegí si es caja fuerte, banco o billetera.");
  }
  if (!["NIO", "USD"].includes(input.currency)) {
    return fail("Elegí la moneda de la cuenta: córdobas o dólares.");
  }
  const bankName = input.bankName?.trim() || null;
  if (bankName && bankName.length > 60) return fail("El nombre del banco es demasiado largo.");
  const accountNumber = input.accountNumber?.trim() || null;
  if (accountNumber && accountNumber.length > 40) {
    return fail("El número de cuenta es demasiado largo.");
  }
  const displayOrder = input.displayOrder ?? 100;
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
    return fail("El orden tiene que ser un número entero entre 0 y 9999.");
  }
  return {
    ok: true,
    value: {
      id: input.id ?? null,
      name,
      accountType: input.accountType as AccountType,
      currency: input.currency as Currency,
      bankName,
      accountNumber,
      displayOrder,
      isActive: input.isActive ?? true,
    },
  };
}

export interface MethodInput {
  id: string | null;
  name: string;
  currency: string;
  feePct: number;
  displayOrder: number;
  isActive: boolean;
}

export function validateMethodForm(input: {
  id?: string | null;
  name: string;
  currency: string;
  feePct?: number;
  displayOrder?: number;
  isActive?: boolean;
}): FormResult<MethodInput> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > METHOD_NAME_MAX) {
    return fail(`El nombre del método lleva entre 2 y ${METHOD_NAME_MAX} caracteres.`);
  }
  if (!["NIO", "USD", "BOTH"].includes(input.currency)) {
    return fail("Elegí la moneda del método: córdobas, dólares o las dos.");
  }
  const feePct = input.feePct ?? 0;
  if (!Number.isFinite(feePct) || feePct < 0 || feePct > 100 || !hasValidCents(feePct)) {
    return fail("La comisión va entre 0 y 100 %, con dos decimales como máximo.");
  }
  const displayOrder = input.displayOrder ?? 100;
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
    return fail("El orden tiene que ser un número entero entre 0 y 9999.");
  }
  return {
    ok: true,
    value: {
      id: input.id ?? null,
      name,
      currency: input.currency,
      feePct: toCents(feePct),
      displayOrder,
      isActive: input.isActive ?? true,
    },
  };
}

export interface CategoryInput {
  id: string | null;
  name: string;
  color: string;
  budgetMonthly: number | null;
  displayOrder: number;
  isActive: boolean;
}

export function validateCategoryForm(input: {
  id?: string | null;
  name: string;
  color: string;
  budgetMonthly?: number | null;
  displayOrder?: number;
  isActive?: boolean;
}): FormResult<CategoryInput> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > CATEGORY_NAME_MAX) {
    return fail(`El nombre de la categoría lleva entre 2 y ${CATEGORY_NAME_MAX} caracteres.`);
  }
  const color = input.color.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    return fail("El color va en formato #RRGGBB, por ejemplo #1f2937.");
  }
  const budgetMonthly = input.budgetMonthly ?? null;
  if (
    budgetMonthly !== null &&
    (!Number.isFinite(budgetMonthly) ||
      budgetMonthly < 0 ||
      budgetMonthly > ACCOUNT_AMOUNT_MAX ||
      !hasValidCents(budgetMonthly))
  ) {
    return fail("El presupuesto mensual va entre 0 y 99 999 999, con dos decimales.");
  }
  const displayOrder = input.displayOrder ?? 100;
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
    return fail("El orden tiene que ser un número entero entre 0 y 9999.");
  }
  return {
    ok: true,
    value: {
      id: input.id ?? null,
      name,
      color,
      budgetMonthly: budgetMonthly === null ? null : toCents(budgetMonthly),
      displayOrder,
      isActive: input.isActive ?? true,
    },
  };
}

export interface TransferInput {
  from: string;
  to: string;
  amount: number;
  fx: number;
  concept: string;
}

export function validateTransferForm(input: {
  from: string;
  to: string;
  amount: number | null;
  fx: number | null;
  concept: string;
}): FormResult<TransferInput> {
  if (!input.from || !input.to) return fail("Elegí la cuenta de origen y la de destino.");
  if (input.from === input.to) return fail("La cuenta de origen y la de destino tienen que ser distintas.");
  const amount = input.amount;
  if (
    amount === null ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > ACCOUNT_AMOUNT_MAX ||
    !hasValidCents(amount)
  ) {
    return fail("Escribí un importe mayor que cero, con dos decimales como máximo.");
  }
  const fx = input.fx;
  if (fx === null || !Number.isFinite(fx) || fx < FX_MIN || fx > FX_MAX || !hasValidCents(fx)) {
    return fail("Escribí la tasa NIO/USD con la que se hace el cambio.");
  }
  const concept = input.concept.trim();
  if (concept.length < TRANSFER_CONCEPT_MIN || concept.length > TRANSFER_CONCEPT_MAX) {
    return fail(`El motivo lleva entre ${TRANSFER_CONCEPT_MIN} y ${TRANSFER_CONCEPT_MAX} caracteres.`);
  }
  return { ok: true, value: { from: input.from, to: input.to, amount, fx, concept } };
}

/** Texto para el usuario a partir del código que devuelve la base o la ruta. */
const MESSAGES: Record<string, string> = {
  AUTH: "Sólo un administrador con verificación en dos pasos puede cambiar las cuentas y mover plata entre ellas.",
  INVALID_NAME: "Revisá el nombre: lleva entre 2 y 60 caracteres.",
  INVALID_ACCOUNT_TYPE: "Elegí si la cuenta es caja fuerte, banco o billetera.",
  INVALID_CURRENCY: "Esa moneda no se puede usar en una cuenta. Elegí córdobas o dólares.",
  INVALID_BANK: "El nombre del banco es demasiado largo.",
  INVALID_ACCOUNT_NUMBER: "El número de cuenta es demasiado largo.",
  INVALID_ORDER: "El orden tiene que ser un número entero entre 0 y 9999.",
  INVALID_FEE: "La comisión va entre 0 y 100 %, con dos decimales como máximo.",
  INVALID_COLOR: "El color va en formato #RRGGBB.",
  INVALID_BUDGET: "El presupuesto mensual va entre 0 y 99 999 999, con dos decimales.",
  INVALID_AMOUNT: "Ese importe no es válido: tiene que ser mayor que cero y con dos decimales.",
  INVALID_FX: "Escribí la tasa NIO/USD con la que se hace el cambio.",
  INVALID_CONCEPT: "El motivo lleva entre 2 y 200 caracteres.",
  INVALID_REASON: "El motivo de la anulación lleva entre 5 y 300 caracteres.",
  INVALID_ACCOUNTS: "La cuenta de origen y la de destino tienen que ser distintas.",
  INVALID_ACCOUNT: "Esa cuenta no existe o está apagada. No se movió nada.",
  ACCOUNT_NAME_TAKEN: "Ya hay una cuenta con ese nombre.",
  METHOD_NAME_TAKEN: "Ya hay un método de pago con ese nombre.",
  CATEGORY_NAME_TAKEN: "Ya hay una categoría con ese nombre.",
  ACCOUNT_CURRENCY_LOCKED:
    "No se le puede cambiar la moneda a una cuenta que ya tiene movimientos: cambiaría el significado de su historial.",
  ACCOUNT_IN_OPEN_CASH:
    "Esa caja tiene un turno abierto. Cerralo antes de apagarla para no perder el arqueo.",
  NOT_FOUND: "No encontramos esa cuenta o ese movimiento. Recargá la pantalla.",
  NOT_ALLOWED: "Ese movimiento no se puede anular: ya está anulado o no es una transferencia.",
  REQUEST_CONFLICT:
    "Ese mismo pedido ya se usó con otros datos. Recargá la pantalla antes de repetir.",
  TRANSFER_PREREQUISITE_MISSING:
    "Falta aplicar la migración de transferencias en la base. No se movió nada.",
  CUENTAS_PREREQUISITE_MISSING:
    "Falta aplicar la migración de cuentas en la base. No se cambió nada.",
  UNAVAILABLE: "No pudimos leer las cuentas. No se muestra una lista vacía para no confundirte.",
  INVALID: "Revisá los datos: hay algo que no tiene la forma esperada.",
};

export function accountsErrorMessage(code: string | null | undefined): string {
  if (!code) return "No se pudo guardar. No se cambió nada.";
  return MESSAGES[code] ?? "No se pudo guardar. No se cambió nada.";
}

/** Cuentas activas, en el orden en que se muestran. */
export function activeAccounts(state: AccountsState): FinanceAccount[] {
  return state.accounts.filter((account) => account.isActive);
}

/** Suma de saldos por moneda, sólo sobre cuentas activas y con saldo visible. */
export function totalsByCurrency(state: AccountsState): { nio: number; usd: number } {
  let nio = 0;
  let usd = 0;
  for (const account of activeAccounts(state)) {
    if (account.balance === null) continue;
    if (account.currency === "USD") usd += account.balance;
    else nio += account.balance;
  }
  return { nio: toCents(nio), usd: toCents(usd) };
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  account_save: "Cuenta guardada",
  method_save: "Método guardado",
  category_save: "Categoría guardada",
  transfer_create: "Transferencia",
  transfer_void: "Transferencia anulada",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
