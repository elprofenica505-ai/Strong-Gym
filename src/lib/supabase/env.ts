/**
 * Credenciales públicas de Supabase.
 *
 * Si no están configuradas, el sitio entra en MODO DEMO: muestra el
 * contenido de ejemplo y guarda las reservas en el navegador. Cuando las
 * completás (en .env.local o en Vercel), todo pasa a la base de datos real.
 */

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();

export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const isSupabaseConfigured: boolean =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;

/** Se muestra un aviso de "modo demo" mientras no haya credenciales. */
export const DEMO_MODE = !isSupabaseConfigured;

export type DataSource = "demo" | "supabase";

export function dataSource(): DataSource {
  return isSupabaseConfigured ? "supabase" : "demo";
}
