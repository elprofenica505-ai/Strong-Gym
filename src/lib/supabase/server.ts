import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured, assertConnectionAvailable } from "./env";

/**
 * Cliente de Supabase para el servidor, con la sesión del usuario
 * leída de las cookies. Devuelve `null` en modo demo.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  assertConnectionAvailable();
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Se llama desde un Server Component: las cookies son de sólo
          // lectura. El refresh de sesión lo hace el proxy, así que acá
          // se puede ignorar sin problema.
        }
      },
    },
  });
}
