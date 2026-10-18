"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured, assertConnectionAvailable } from "./env";

let browserClient: SupabaseClient | null = null;

/**
 * Cliente de Supabase para el navegador (singleton).
 * Devuelve `null` sólo en demo local de lectura. Configuración ausente/inválida
 * falla cerrada; nunca habilita almacenamiento de credenciales de ejemplo.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  assertConnectionAvailable();
  if (!isSupabaseConfigured) return null;
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return browserClient;
}
