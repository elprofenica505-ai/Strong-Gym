/** Un error de lectura financiera nunca equivale a saldo cero o ausencia de deuda. */
export class FinanceReadError extends Error {
  readonly code: string;
  constructor(operation: string, databaseCode?: string) {
    super(
      "No se pudo confirmar la lectura financiera. No interpretés este aviso como saldo cero, ausencia de movimientos o deudas.",
    );
    this.name = "FinanceReadError";
    const safeCode = /^[A-Z0-9]{5,12}$/.test(databaseCode ?? "")
      ? databaseCode
      : "UNKNOWN";
    const safeOperation = /^[A-Z_]{1,30}$/.test(operation) ? operation : "READ";
    this.code = `FIN_${safeOperation}_${safeCode}`;
  }
}

export async function readFinance<T>(
  read: () => Promise<T>,
): Promise<
  { ok: true; data: T } | { ok: false; code: string; message: string }
> {
  try {
    return { ok: true, data: await read() };
  } catch (error) {
    const safe =
      error instanceof FinanceReadError ? error : new FinanceReadError("READ");
    return { ok: false, code: safe.code, message: safe.message };
  }
}
