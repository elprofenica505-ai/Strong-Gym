import { resolveAppMode } from "./config-policy";

// Next sustituye estas referencias explícitas al construir el cliente.
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
export const APP_MODE = resolveAppMode({
  nodeEnv: process.env.NODE_ENV,
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,
  enableDemo: process.env.NEXT_PUBLIC_ENABLE_DEMO,
});
export const isSupabaseConfigured = APP_MODE === "supabase";
/** Demo de sólo lectura, opt-in y exclusivamente con next dev. Nunca producción. */
export const DEMO_MODE = APP_MODE === "demo";
export const CONFIGURATION_UNAVAILABLE = APP_MODE === "unavailable";
export type DataSource = "demo" | "supabase" | "unavailable";
export function dataSource(): DataSource { return APP_MODE; }

export function assertConnectionAvailable(): void {
  if (CONFIGURATION_UNAVAILABLE) throw new Error("CONFIGURATION_UNAVAILABLE");
}
