
/**
 * Búsqueda y paginación del historial de Caja (FIN-05).
 *
 * Por qué existe: la pantalla pedía los últimos 30 movimientos y filtraba en
 * el navegador. Un cobro de la semana pasada existía y no había manera de
 * encontrarlo. Ahora el filtro, el orden y la página los resuelve el servidor
 * (`finance_movements_page`) y acá viven las reglas que comparten la ruta y la
 * pantalla, una sola vez: nada de repetir en el navegador lo que ya hace SQL.
 *
 * Estas funciones son puras: se pueden probar sin base ni navegador.
 */

/** Moneda de un movimiento. Se declara acá para no arrastrar el módulo del
 * servidor a un componente del navegador. */
type Currency = "NIO" | "USD";

/** Filas por página. Es el mismo 25 que usa la pantalla desde siempre. */
export const MOVEMENTS_PAGE_SIZE = 25;

/** Tope de la búsqueda: el mismo que valida la función de la base. */
export const MOVEMENTS_SEARCH_MAX = 80;

const DIRECTIONS = ["all", "income", "expense"] as const;
const STATUSES = ["all", "completed", "pending", "reversed", "cancelled"] as const;
const CURRENCIES = ["all", "NIO", "USD"] as const;

export type MovementDirection = (typeof DIRECTIONS)[number];
export type MovementStatus = (typeof STATUSES)[number];
export type MovementCurrency = (typeof CURRENCIES)[number];

export interface MovementFilters {
  /** Texto libre: concepto, notas, cliente o socio. */
  search: string;
  direction: MovementDirection;
  status: MovementStatus;
  currency: MovementCurrency;
  /** "all", "none" (sin método informado) o el id del método de pago. */
  method: string;
  /**
   * Lo decide el **servidor** con el interruptor de gastos de caja. Si es
   * verdadero, la base excluye los egresos y no los cuenta en el total.
   */
  hideExpenses?: boolean;
}

export const DEFAULT_MOVEMENT_FILTERS: MovementFilters = {
  search: "",
  direction: "all",
  status: "all",
  currency: "all",
  method: "all",
};

export interface ParsedMovementFilters {
  filters: MovementFilters;
  /** Página pedida, contada desde 0. */
  page: number;
}

const oneOf = <T extends string>(
  values: readonly T[],
  candidate: string | null,
  fallback: T,
): T =>
  candidate !== null && (values as readonly string[]).includes(candidate)
    ? (candidate as T)
    : fallback;

/**
 * Lee la consulta del navegador. Un valor raro **no** rompe la pantalla: cae
 * en el valor por defecto, igual que hace la base. Lo único que se rechaza es
 * una búsqueda demasiado larga, porque ahí sí hay que decir por qué.
 */
export function parseMovementFilters(
  params: URLSearchParams,
): { ok: true; value: ParsedMovementFilters } | { ok: false; message: string } {
  const rawSearch = (params.get("q") ?? "").trim();
  if (rawSearch.length > MOVEMENTS_SEARCH_MAX) {
    return {
      ok: false,
      message: `La búsqueda no puede pasar de ${MOVEMENTS_SEARCH_MAX} caracteres.`,
    };
  }
  const rawPage = Number.parseInt(params.get("page") ?? "0", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 0;
  const rawMethod = (params.get("method") ?? "").trim();
  return {
    ok: true,
    value: {
      page,
      filters: {
        search: rawSearch,
        direction: oneOf(DIRECTIONS, params.get("direction"), "all"),
        status: oneOf(STATUSES, params.get("status"), "all"),
        currency: oneOf(CURRENCIES, params.get("currency"), "all") as MovementCurrency,
        method: rawMethod === "" ? "all" : rawMethod.slice(0, 80),
      },
    },
  };
}

/** Parámetros para pedir una página. Vacío es «sin filtro», no un texto raro. */
export function movementsPageQuery(
  filters: MovementFilters,
  page: number,
): URLSearchParams {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set("q", search.slice(0, MOVEMENTS_SEARCH_MAX));
  if (filters.direction !== "all") params.set("direction", filters.direction);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.currency !== "all") params.set("currency", filters.currency);
  if (filters.method !== "all") params.set("method", filters.method);
  if (page > 0) params.set("page", String(Math.trunc(page)));
  return params;
}

const currencyOf = (value: unknown): Currency | null =>
  value === "NIO" || value === "USD" ? value : null;
const textOf = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const numberOf = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Valida lo que devuelve la base (`{total, rows}`).
 *
 * Una fila rota se descarta en vez de dibujarse a medias, y una respuesta sin
 * total no se convierte en cero: se devuelve `null` para que la pantalla diga
 * que no pudo leer, nunca «no hay movimientos».
 */
export function parseMovementsPagePayload(
  value: unknown,
): { total: number; rows: Record<string, unknown>[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const total = numberOf(payload.total);
  if (total === null || total < 0) return null;
  const rawRows = payload.rows;
  if (!Array.isArray(rawRows)) return null;
  const rows = rawRows.filter(
    (row): row is Record<string, unknown> =>
      !!row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      typeof (row as Record<string, unknown>).id === "string" &&
      typeof (row as Record<string, unknown>).concept === "string" &&
      textOf((row as Record<string, unknown>).occurred_at) !== null,
  );
  return { total, rows };
}

/** Una fila que ya viene mapeada a `Transaction` desde el servidor. */
export interface MovementRow {
  id: string;
  occurredAt: string;
  direction: "income" | "expense" | "transfer";
  status: "pending" | "completed" | "reversed" | "cancelled";
  amount: number;
  currency: Currency;
  fxRate: number;
  baseAmount: number;
  paymentMethodId: string | null;
  accountId: string | null;
  memberId: string | null;
  memberName: string | null;
  invoiceId: string | null;
  expenseCategoryId: string | null;
  concept: string;
  notes: string | null;
  createdBy: string | null;
  /** Motivo de la anulación, si el movimiento ya se anuló (FIN-01). */
  voidedReason: string | null;
}

export interface MovementsPage {
  rows: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function movementsPageCount(total: number, pageSize = MOVEMENTS_PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

const directionOf = (value: unknown): MovementRow["direction"] | null =>
  value === "income" || value === "expense" || value === "transfer" ? value : null;
const statusOf = (value: unknown): MovementRow["status"] | null =>
  value === "pending" ||
  value === "completed" ||
  value === "reversed" ||
  value === "cancelled"
    ? value
    : null;

/**
 * Valida la respuesta de `/api/admin/finance/movements` en el navegador.
 * Devuelve `null` si no se puede confiar en lo recibido: la pantalla muestra
 * entonces el aviso, nunca una lista vacía como si no hubiera movimientos.
 */
export function parseMovementsResponse(value: unknown): MovementsPage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.ok !== true) return null;
  const total = numberOf(body.total);
  const page = numberOf(body.page);
  const pageSize = numberOf(body.pageSize);
  if (total === null || page === null || pageSize === null || pageSize <= 0) return null;
  if (total < 0 || page < 0) return null;
  if (!Array.isArray(body.rows)) return null;
  const rows: MovementRow[] = [];
  for (const raw of body.rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const id = textOf(row.id);
    const occurredAt = textOf(row.occurredAt);
    const concept = textOf(row.concept);
    const direction = directionOf(row.direction);
    const status = statusOf(row.status);
    const currency = currencyOf(row.currency);
    const amount = numberOf(row.amount);
    if (!id || !occurredAt || concept === null) continue;
    if (!direction || !status || !currency || amount === null) continue;
    rows.push({
      id,
      occurredAt,
      direction,
      status,
      amount,
      currency,
      fxRate: numberOf(row.fxRate) ?? 1,
      baseAmount: numberOf(row.baseAmount) ?? 0,
      paymentMethodId: textOf(row.paymentMethodId),
      accountId: textOf(row.accountId),
      memberId: textOf(row.memberId),
      memberName: textOf(row.memberName),
      invoiceId: textOf(row.invoiceId),
      expenseCategoryId: textOf(row.expenseCategoryId),
      concept,
      notes: textOf(row.notes),
      createdBy: textOf(row.createdBy),
      voidedReason: textOf(row.voidedReason),
    });
  }
  return { rows, total, page, pageSize };
}
