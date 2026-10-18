/** Política pura, compartida por build, servidor y navegador. Nunca devuelve claves. */
export type AppMode = "supabase" | "demo" | "unavailable";
export interface ConnectionConfig {
  nodeEnv?: string;
  url?: string;
  key?: string;
  enableDemo?: string;
}

/** Sólo estructura/rol público; la firma y vigencia se comprueban en Supabase. */
export function isPublicSupabaseKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return true;
  try {
    const parts = key.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload));
    return claims?.role === "anon";
  } catch {
    return false;
  }
}

export function resolveAppMode(config: ConnectionConfig): AppMode {
  const url = (config.url ?? "").trim();
  const key = (config.key ?? "").trim();
  if (!url && !key) {
    return config.nodeEnv === "development" && config.enableDemo === "true"
      ? "demo" : "unavailable";
  }
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    const transport = parsed.protocol === "https:" ||
      (config.nodeEnv !== "production" && local && parsed.protocol === "http:");
    if (transport && !parsed.username && !parsed.password && !parsed.search &&
        !parsed.hash && parsed.pathname === "/" && isPublicSupabaseKey(key)) return "supabase";
  } catch {
    // No imprimir URL/claves: pueden contener secretos mal colocados.
  }
  return "unavailable";
}
