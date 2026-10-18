import type { SupabaseClient } from "@supabase/supabase-js";
import { FinanceReadError } from "./read-result";

function isMoney(value: unknown): boolean {
  return (
    (typeof value === "number" ||
      (typeof value === "string" && value.trim() !== "")) &&
    Number.isFinite(Number(value))
  );
}

export function isFinanceSchemaError(code?: string): boolean {
  return [
    "42703",
    "42P01",
    "42883",
    "PGRST200",
    "PGRST202",
    "PGRST204",
    "PGRST205",
  ].includes(code ?? "");
}

/** Sólo se usa ante un contrato nativo ausente, nunca para eludir un error de permisos/red. */
export async function readBankFinance<T>(
  db: SupabaseClient,
  section: string,
  limit = 30,
): Promise<T> {
  const { data, error } = await db.rpc("finance_read", {
    p_section: section,
    p_limit: limit,
  });
  if (error)
    throw new FinanceReadError(`BANK_${section.toUpperCase()}`, error.code);
  return validateBankFinance<T>(data, section);
}

// Misma validación para la capacidad nueva y el adaptador anterior.
function validateBankFinance<T>(data: {data?: unknown;finance_layout?: unknown;section?: unknown} | null, section: string): T {
  const value = data?.data as Record<string, unknown> & Record<string, unknown>[];
  if (
    data?.finance_layout !== "bank_accounts_split" ||
    data?.section !== section ||
    (section === "summary"
      ? !value || typeof value !== "object" || Array.isArray(value)
      : !Array.isArray(value))
  ) {
    throw new FinanceReadError("BANK_RESPONSE", "INVALID");
  }
  const moneyFields: Record<string, string[]> = {
    summary: [
      "incomeToday",
      "expenseToday",
      "netToday",
      "incomeMonth",
      "expenseMonth",
      "netMonth",
      "totalOwed",
      "totalOwedUsd",
      "txToday",
      "txMonth",
      "openRegisterCount",
    ],
    accounts: ["balance"],
    transactions: ["amount", "base_amount", "fx_rate"],
    daily: ["income_nio", "expense_nio", "net_nio", "tx_count"],
    monthly: ["income_nio", "expense_nio", "net_nio"],
    method_totals: ["total_nio", "income_nio", "expense_nio", "tx_count"],
    receivables: ["total_owed_nio", "total_owed_usd"],
  };
  const rows = section === "summary" ? [value] : value;
  if (
    rows.some(
      (row: Record<string, unknown>) =>
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        (moneyFields[section] ?? []).some((key) => !isMoney(row[key])),
    )
  ) {
    throw new FinanceReadError("BANK_RESPONSE", "INVALID");
  }
  const invalid =
    section === "summary"
      ? value.sourceModel !== "bank_accounts_split" ||
        value.pendingInvoices !== null ||
        (value.openRegister !== null &&
          (!value.openRegister ||
            !isMoney((value.openRegister as Record<string, unknown>).openingAmount) ||
            !isMoney((value.openRegister as Record<string, unknown>).openingAmountUsd)))
      : rows.some(
          (row: Record<string, unknown>) =>
            (["accounts", "transactions"].includes(section) &&
              !["NIO", "USD"].includes(String(row.currency))) ||
            (section === "transactions" &&
              (!["income", "expense", "transfer"].includes(
                String(row.direction),
              ) ||
                !["pending", "completed", "cancelled"].includes(
                  String(row.status),
                ))) ||
            (section === "receivables" &&
              (row.days_overdue !== null ||
                row.invoices_open !== null ||
                row.oldest_due !== null)),
        );
  if (invalid) throw new FinanceReadError("BANK_RESPONSE", "INVALID");
  return value as T;
}

/** Un módulo no instalado permite el lector anterior. Un error de permiso/red o
 * respuesta inválida NO permite caer a una vista vieja y anunciar falsos ceros. */
export async function readDebtReport<T>(db: SupabaseClient, section: "summary" | "receivables"): Promise<T | null> {
  const {data,error}=await db.rpc("finance_debt_report",{p_section:section});
  if(error) {
    if(["PGRST202","42883"].includes(error.code??""))return null;
    throw new FinanceReadError("DEBT_REPORT",error.code);
  }
  return validateBankFinance<T>(data,section);
}
