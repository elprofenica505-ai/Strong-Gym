export const categories = {
  client: "Clientes",
  friend: "Clientes amigos",
  family: "Clientes familia Strong",
} as const;
export type ClientCategory = keyof typeof categories;
export type ClientStatus = "active" | "frozen" | "cancelled";
export interface GymClient {
  id: string;
  client_number: number;
  profile_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  category: ClientCategory;
  status: ClientStatus;
  plan_id: string | null;
  notes: string;
  joined_on: string;
  created_at: string;
  updated_at?: string;
  is_demo: boolean;
  plan_name?: string;
  visits_30?: number;
  last_visit?: string | null;
}
export interface Visit {
  id: string;
  visited_at: string;
  local_day: string;
  source: "qr" | "manual";
}
export interface ClientEvent {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, string>;
}
export interface ClientPayment {
  id: string;
  occurred_at: string;
  concept: string;
  amount: number;
  currency: string;
  status: string;
}
export interface ClientDetail {
  client: GymClient;
  card: string;
  visits: Visit[];
  events: ClientEvent[];
  payments: ClientPayment[];
  balance: number | null;
  finance?: unknown;
  finance_layout?: "repository" | "bank_accounts_split" | "unsupported";
  balances?: {
    credit_nio: number;
    credit_usd: number;
    debt_nio: number;
    debt_usd: number;
  } | null;
}
export interface Directory {
  rows: GymClient[];
  total: number;
}
export interface CrmOptions {
  payments_enabled: boolean;
  finance_layout?: string;
  payment_block_reason?: string | null;
  plans: { id: string; name_es: string }[];
  methods: {
    id: string;
    name_es: string;
    accepts_nio: boolean;
    accepts_usd: boolean;
  }[];
  accounts: { id: string; name: string; currency: string }[];
}
const CARD_PREFIX = "strong-gym:client:";
export function cardPayload(token: string) {
  return `${CARD_PREFIX}${token}`;
}
export function parseCard(value: string): string | null {
  const match = value
    .trim()
    .match(
      /^strong-gym:client:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    );
  return match?.[1]?.toLowerCase() ?? null;
}
/** Métrica explícita, no un juicio de valor ni una etiqueta comercial. */
export function frequency(visits: number): string {
  if (!visits) return "Sin visitas en 30 días";
  return `${visits} día${visits === 1 ? "" : "s"} en 30 días · ≈ ${((visits * 7) / 30).toFixed(1)} por semana`;
}
