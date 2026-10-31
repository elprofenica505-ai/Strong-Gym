/**
 * Uso de un plan y su historial de precios (00086).
 *
 * Por qué existe: en el mostrador la pregunta es «¿cuánta gente tiene el Mes?»
 * y «¿desde cuándo cuesta C$600?». Antes había que ir ficha por ficha y el
 * precio anterior se perdía al guardar uno nuevo.
 *
 * Estas funciones son puras: se prueban sin base ni navegador, y la pantalla y
 * la ruta usan la misma regla en vez de cada una armar su propio texto.
 */
import { formatMoney } from "@/lib/finance/format-money";

export type PriceAmounts = {
  price_nio?: number | string | null;
  price?: number | string | null;
  validity_currency?: string | null;
  validity_amount?: number | string | null;
};

export type PlanPriceChange = {
  action: "alta" | "edicion";
  before: PriceAmounts | null;
  after: PriceAmounts | null;
  changedAt: string;
  changedByName: string | null;
};

export type PlanPerson = {
  clientId: string;
  name: string;
  startedOn: string;
  expiresOn: string;
  daysLeft: number;
  pricePaid: number | null;
  currency: string;
  state: "active" | "upcoming";
};

export type PlanUsage = {
  plan: {
    id: string;
    name_es: string;
    access_kind: "gym" | "class" | null;
    duration_days: number | null;
    validity_currency: string | null;
    validity_amount: number | null;
    price_nio: number | null;
    is_active: boolean;
  };
  today: string;
  people: PlanPerson[];
  history: PlanPriceChange[];
};

/** Cuánta gente usa un plan, tal como lo cuenta el catálogo. */
export type PlanUsageCounts = {
  holders_active: number;
  holders_upcoming: number;
  sold_this_month: number;
  last_price_change: PlanPriceChange | null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const count = (value: unknown): number => {
  const parsed = toNumber(value);
  return parsed === null || parsed < 0 ? 0 : Math.trunc(parsed);
};

const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Fecha corta y legible: «26 de noviembre de 2026». Nunca corre el día. */
export function formatPlanDay(value: string): string {
  if (!isDay(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-NI", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Marca de tiempo de un cambio, en la hora de Managua. */
export function formatChangeMoment(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * Qué precio manda para mostrar: el importe con vigencia (el que se cobra y da
 * días) y, si no hay, la tarifa rápida.
 */
export function planMainPrice(plan: PriceAmounts): {
  amount: number;
  currency: "NIO" | "USD";
  label: string;
} | null {
  const validity = toNumber(plan.validity_amount);
  if (validity !== null && validity > 0) {
    const currency = plan.validity_currency === "USD" ? "USD" : "NIO";
    return { amount: validity, currency, label: formatMoney(validity, currency) };
  }
  const quick = toNumber(plan.price_nio);
  if (quick !== null && quick > 0) {
    return { amount: quick, currency: "NIO", label: formatMoney(quick, "NIO") };
  }
  return null;
}

/**
 * El renglón de precio bajo el plan: «C$600 desde el 2 de noviembre (antes
 * C$560)». Devuelve `null` cuando no hay nada que contar: el precio actual ya
 * se ve arriba y no se inventa una fecha que nadie registró.
 */
export function priceHistoryLine(change: PlanPriceChange | null): string | null {
  if (!change) return null;
  const after = planMainPrice(change.after ?? {});
  if (!after) return null;
  const when = formatChangeMoment(change.changedAt);

  if (change.action === "alta") {
    return `${after.label} desde el ${when} (primera carga del plan).`;
  }
  const before = planMainPrice(change.before ?? {});
  if (!before) return `${after.label} desde el ${when}.`;
  if (before.amount === after.amount && before.currency === after.currency) {
    return null;
  }
  return `${after.label} desde el ${when} (antes ${before.label}).`;
}

/**
 * Un renglón del historial: «Pasó a C$600 (antes C$560)» o «Primera carga:
 * C$560». Sin valores inventados: si la base no trajo el precio anterior, se
 * dice solo lo que sí se sabe.
 */
export function describePriceChange(change: PlanPriceChange): string {
  const after = planMainPrice(change.after ?? {});
  const before = planMainPrice(change.before ?? {});
  if (!after) return change.action === "alta" ? "Alta del plan." : "Cambio sin importe registrado.";
  if (change.action === "alta" || !before) return `Primera carga: ${after.label}.`;
  if (before.amount === after.amount && before.currency === after.currency) {
    return `Guardado sin cambio de precio: ${after.label}.`;
  }
  return `Pasó a ${after.label} (antes ${before.label}).`;
}

/**
 * Cuánta gente tiene el plan. Frases cortas y sin ceros de relleno: si nadie
 * lo tiene, se dice, no se muestra «0 personas».
 */
export function usageSummary(counts: PlanUsageCounts): string {
  const parts: string[] = [];
  const active = count(counts.holders_active);
  const upcoming = count(counts.holders_upcoming);
  const sold = count(counts.sold_this_month);

  if (active === 0 && upcoming === 0) {
    parts.push("Todavía nadie lo tiene");
  } else {
    if (active > 0) {
      parts.push(`${active} ${active === 1 ? "persona" : "personas"} con el plan vigente`);
    }
    if (upcoming > 0) {
      parts.push(`${upcoming} ${upcoming === 1 ? "empieza" : "empiezan"} después`);
    }
  }
  if (sold > 0) {
    parts.push(`${sold} ${sold === 1 ? "cobro" : "cobros"} este mes`);
  }
  return parts.join(" · ");
}

/** Estado de una persona dentro del plan, con la fecha que hay que decir. */
export function personValidityText(person: PlanPerson): string {
  if (person.state === "upcoming") {
    return `Empieza el ${formatPlanDay(person.startedOn)} · hasta el ${formatPlanDay(person.expiresOn)}`;
  }
  const days = Math.max(0, Math.trunc(person.daysLeft));
  const rest = days === 0 ? "vence hoy" : days === 1 ? "queda 1 día" : `quedan ${days} días`;
  return `Hasta el ${formatPlanDay(person.expiresOn)} · ${rest}`;
}

/** Valida lo que devuelve la base antes de dibujarlo. */
export function parsePlanUsage(value: unknown): PlanUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const plan = body.plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const raw = plan as Record<string, unknown>;
  const id = toText(raw.id);
  if (!id) return null;

  const person = (item: unknown): PlanPerson | null => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const clientId = toText(row.clientId);
    const name = toText(row.name);
    const startedOn = isDay(row.startedOn) ? row.startedOn : null;
    const expiresOn = isDay(row.expiresOn) ? row.expiresOn : null;
    if (!clientId || !name || !startedOn || !expiresOn) return null;
    return {
      clientId,
      name,
      startedOn,
      expiresOn,
      daysLeft: count(row.daysLeft),
      pricePaid: toNumber(row.pricePaid),
      currency: row.currency === "USD" ? "USD" : "NIO",
      state: row.state === "upcoming" ? "upcoming" : "active",
    };
  };

  const change = (item: unknown): PlanPriceChange | null => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const changedAt = toText(row.changedAt);
    if (!changedAt) return null;
    return {
      action: row.action === "alta" ? "alta" : "edicion",
      before: (row.before ?? null) as PriceAmounts | null,
      after: (row.after ?? null) as PriceAmounts | null,
      changedAt,
      changedByName: toText(row.changedByName),
    };
  };

  const people = Array.isArray(body.people)
    ? body.people.map(person).filter((p): p is PlanPerson => p !== null)
    : [];
  const history = Array.isArray(body.history)
    ? body.history.map(change).filter((c): c is PlanPriceChange => c !== null)
    : [];

  return {
    plan: {
      id,
      name_es: toText(raw.name_es) ?? id,
      access_kind: raw.access_kind === "class" ? "class" : raw.access_kind === "gym" ? "gym" : null,
      duration_days: toNumber(raw.duration_days),
      validity_currency: toText(raw.validity_currency),
      validity_amount: toNumber(raw.validity_amount),
      price_nio: toNumber(raw.price_nio),
      is_active: raw.is_active !== false,
    },
    today: isDay(body.today) ? body.today : "",
    people,
    history,
  };
}
