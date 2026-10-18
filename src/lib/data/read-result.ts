/** Datos operativos desconocidos nunca equivalen a un resultado vacío. */
export class DataReadError extends Error {
  readonly code: string;
  constructor(operation: string, databaseCode?: string) {
    super(
      "No se pudieron confirmar los datos. No interpretés este aviso como ausencia de registros o cupos disponibles.",
    );
    this.name = "DataReadError";
    const op = /^[A-Z_]{1,30}$/.test(operation) ? operation : "READ";
    const code = /^[A-Z0-9]{5,12}$/.test(databaseCode ?? "")
      ? databaseCode
      : "UNKNOWN";
    this.code = `DATA_${op}_${code}`;
  }
}

export async function readData<T>(read: () => Promise<T>) {
  try {
    return { ok: true as const, data: await read() };
  } catch (error) {
    const safe =
      error instanceof DataReadError ? error : new DataReadError("READ");
    return { ok: false as const, code: safe.code };
  }
}

/** Captura errores de transporte y no filtra detalles SQL/personales. */
export async function checkedRead<T>(
  operation: string,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof DataReadError) throw error;
    throw new DataReadError(operation);
  }
}

export function requireRows<T>(
  operation: string,
  result: { data: T[] | null; error: { code?: string } | null },
): T[] {
  if (result.error) throw new DataReadError(operation, result.error.code);
  if (!Array.isArray(result.data))
    throw new DataReadError(operation, "INVALID");
  return result.data;
}
