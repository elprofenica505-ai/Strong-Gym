/** Las lecturas tienen límite de espera; un cobro con respuesta perdida sigue
 * siendo incierto y debe reintentarse con la misma referencia idempotente. */
export async function crmRequest<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  if (signal?.aborted) controller.abort();
  let timedOut = false;
  const timeout = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    body === undefined ? 15000 : 30000,
  );
  try {
    const res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      signal: controller.signal,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error(
        body === undefined
          ? "El servidor no devolvió una respuesta válida. Reintentá la lectura sin volver a crear el cliente."
          : "El servidor no devolvió una respuesta válida. No se pudo confirmar el resultado; revisá el historial o buscá al cliente antes de repetir la operación.",
      );
    }
    if (!res.ok) {
      const message =
        typeof json?.error === "string"
          ? json.error
          : "No se pudo completar la operación.";
      const code =
        typeof json?.code === "string" &&
        /^CRM_[A-Z0-9_]{1,60}$/.test(json.code)
          ? ` Código: ${json.code}.`
          : "";
      throw new Error(message + code);
    }
    return json as T;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut)
      throw new Error(
        body === undefined
          ? "La lectura tardó demasiado. Reintentá cargar; no vuelvas a registrar al cliente."
          : "No se pudo confirmar la operación a tiempo. Revisá el historial antes de reintentar con la misma referencia.",
      );
    if (error instanceof TypeError)
      throw new Error(
        body === undefined
          ? "No se pudo obtener la lectura del servidor. Comprobá tu red y reintentá sin volver a registrar al cliente."
          : "No se pudo confirmar la operación. Comprobá el historial o buscá al cliente antes de repetir; para un cobro usá la misma referencia.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}
