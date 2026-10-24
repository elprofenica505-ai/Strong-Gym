import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FinanceReadError } from "@/lib/finance/read-result";
import {
  buildRows,
  type DebtEntryInput,
  type DebtEntryRow,
  type LedgerInput,
  type LedgerKind,
  type LedgerRow,
  type NameMaps,
} from "./finance-report";

export interface FinanceReportData {
  generatedAt: string;
  rows: LedgerRow[];
  debtEntries: DebtEntryRow[];
  maps: NameMaps;
}

const PAGE = 1000;
const MAX_ROWS = 50000;

/** Lee todas las filas de una consulta paginada, en orden estable. */
async function readAll<T>(
  operation: string,
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new FinanceReadError(operation, error.code);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
  throw new FinanceReadError(operation, "LIMIT");
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

interface Balance {
  debt_nio?: number;
  debt_usd?: number;
  credit_nio?: number;
  credit_usd?: number;
}
const toBalance = (b: Balance | null | undefined) =>
  b
    ? { debtNio: num(b.debt_nio), debtUsd: num(b.debt_usd), creditNio: num(b.credit_nio), creditUsd: num(b.credit_usd) }
    : null;

/**
 * Carga movimientos, cobros de deuda y nombres con la sesión del usuario (RLS de personal).
 * Un fallo de lectura se informa como error; nunca se convierte en cero.
 */
export async function loadFinanceReport(supabase: SupabaseClient): Promise<FinanceReportData> {
  const [txs, fin, debt, methods, categories, accounts, clients] = await Promise.all([
    readAll<Record<string, unknown>>("REPORT_TX", (from, to) =>
      supabase
        .from("transactions")
        .select(
          "id,occurred_at,type,status,amount,currency,amount_nio,amount_usd,fx_used,method_id,category_id,account_id,client_id,concept,reference",
        )
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAll<Record<string, unknown>>("REPORT_FIN", (from, to) =>
      supabase
        .from("finance_entries")
        .select("transaction_id,receipt")
        .order("transaction_id", { ascending: true })
        .range(from, to),
    ),
    readAll<Record<string, unknown>>("REPORT_DEBT", (from, to) =>
      supabase
        .from("client_debt_entries")
        .select("id,client_id,actor_id,transaction_id,payload,receipt,created_at")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAll<Record<string, unknown>>("REPORT_METHODS", (from, to) =>
      supabase.from("payment_methods").select("id,name,fee_pct").order("id").range(from, to),
    ),
    readAll<Record<string, unknown>>("REPORT_CATEGORIES", (from, to) =>
      supabase.from("expense_categories").select("id,name").order("id").range(from, to),
    ),
    readAll<Record<string, unknown>>("REPORT_ACCOUNTS", (from, to) =>
      supabase.from("bank_accounts").select("id,name").order("id").range(from, to),
    ),
    readAll<Record<string, unknown>>("REPORT_CLIENTS", (from, to) =>
      supabase.from("gym_clients").select("id,full_name").order("id").range(from, to),
    ),
  ]);

  const maps: NameMaps = {
    methods: Object.fromEntries(methods.map((m) => [String(m.id), { name: String(m.name), feePct: num(m.fee_pct) }])),
    categories: Object.fromEntries(categories.map((c) => [String(c.id), String(c.name)])),
    accounts: Object.fromEntries(accounts.map((a) => [String(a.id), String(a.name)])),
    clients: Object.fromEntries(clients.map((c) => [String(c.id), String(c.full_name ?? "Cliente")])),
  };

  const finByTx = new Map<string, Record<string, unknown>>();
  for (const f of fin) {
    const receipt = (f.receipt ?? {}) as Record<string, unknown>;
    finByTx.set(String(f.transaction_id), receipt);
    // Con el permiso de saldos apagado, la RLS oculta bank_accounts a caja.
    // El comprobante ya autorizado conserva el nombre operativo de la cuenta,
    // así que el cierre del día no pierde esa etiqueta ni expone el saldo.
    const accountId = receipt.accountId ? String(receipt.accountId) : null;
    const accountName = receipt.accountName ? String(receipt.accountName) : null;
    if (accountId && accountName && !maps.accounts[accountId]) maps.accounts[accountId] = accountName;
  }

  const debtTx = new Map<string, Record<string, unknown>>();
  const debtEntries: DebtEntryRow[] = debt.map((d) => {
    const receipt = (d.receipt ?? {}) as Record<string, unknown>;
    const payload = (d.payload ?? {}) as Record<string, unknown>;
    const kind = String(receipt.kind ?? payload.kind ?? "charge") as DebtEntryInput["kind"];
    const clientId = String(d.client_id);
    const entry: DebtEntryRow = {
      id: String(d.id),
      clientId,
      clientName: maps.clients[clientId] ?? "Cliente",
      occurredAt: String(d.created_at),
      kind,
      amount: numOrNull(receipt.amount),
      currency: (receipt.currency as DebtEntryInput["currency"]) ?? null,
      before: toBalance(receipt.before as Balance | null),
      after: toBalance(receipt.after as Balance) ?? { debtNio: 0, debtUsd: 0, creditNio: 0, creditUsd: 0 },
      concept: String(receipt.concept ?? payload.concept ?? ""),
      actorName: receipt.actorName ? String(receipt.actorName) : null,
      transactionId: d.transaction_id ? String(d.transaction_id) : null,
      cashReceived: numOrNull(receipt.cashReceived),
      changeGiven: numOrNull(receipt.changeGiven),
    };
    if (entry.transactionId) debtTx.set(entry.transactionId, receipt);
    return entry;
  });

  const inputs: LedgerInput[] = txs.map((t) => {
    const id = String(t.id);
    const type = String(t.type) as LedgerInput["type"];
    const clientId = t.client_id ? String(t.client_id) : null;
    const fin = finByTx.get(id);
    const debtReceipt = debtTx.get(id);
    let kind: LedgerKind = "legacy";
    if (type === "expense") kind = "expense";
    // Si caja no tiene permiso de cuentas por cobrar, la RLS oculta el ledger
    // de deudas; el comprobante del movimiento alcanza para no confundir un
    // abono del día con un cobro por servicio en el cierre.
    else if (type === "income" && (debtReceipt || fin?.kind === "debt_payment")) kind = "debt_payment";
    else if (type === "income" && (clientId || fin)) kind = "service_income";
    const src = debtReceipt ?? fin;
    return {
      id,
      occurredAt: String(t.occurred_at),
      type,
      status: String(t.status) as LedgerInput["status"],
      amount: num(t.amount),
      currency: String(t.currency) as LedgerInput["currency"],
      amountNio: num(t.amount_nio),
      amountUsd: num(t.amount_usd),
      fxUsed: numOrNull(t.fx_used),
      methodId: t.method_id ? String(t.method_id) : null,
      categoryId: t.category_id ? String(t.category_id) : null,
      accountId: t.account_id ? String(t.account_id) : null,
      clientId,
      concept: String(t.concept ?? ""),
      reference: t.reference ? String(t.reference) : null,
      cashReceived: src ? numOrNull(src.cashReceived) : null,
      changeGiven: src ? numOrNull(src.changeGiven) : null,
      debtBefore: debtReceipt
        ? toBalance(debtReceipt.before as Balance)?.debtNio ?? null
        : kind === "debt_payment" && t.currency === "NIO"
          ? numOrNull(fin?.debtBefore)
          : null,
      debtAfter: debtReceipt
        ? toBalance(debtReceipt.after as Balance)?.debtNio ?? null
        : kind === "debt_payment" && t.currency === "NIO"
          ? numOrNull(fin?.debtAfter)
          : null,
      kind,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    rows: buildRows(inputs, maps),
    debtEntries: debtEntries.map((e) => ({ ...e, clientName: maps.clients[e.clientId] ?? e.clientName })),
    maps,
  };
}
