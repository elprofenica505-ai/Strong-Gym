import "server-only";

import { NextResponse } from "next/server";
import { allowRequest } from "@/lib/antispam";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  hashKey,
  parseDecision,
  windowSeconds,
  WRITE_RULES,
  type LimitDecision,
  type RateRule,
} from "./rate-limit-core";

/**
 * Límite de abuso para las rutas que escriben (SEG-07).
 *
 * Cuenta en la base (`public.rate_limit_hit`) para que el tope sea el mismo en
 * todas las instancias y sobreviva a un despliegue. Tres cuidados:
 *  - **Sin datos personales**: lo que se guarda es un hash.
 *  - **Nunca frena a alguien por un fallo técnico**: si la base no responde (o
 *    el proyecto está sin Supabase) se usa el contador en memoria de siempre.
 *  - **Respuesta clara**: quien se pasa recibe 429 con `Retry-After` y los
 *    segundos que faltan, y la pantalla lo dice con esas palabras.
 */

export type { LimitDecision, RateRule } from "./rate-limit-core";
export { hashKey, parseDecision, retryText, WRITE_RULES } from "./rate-limit-core";

/**
 * Cuenta un pedido y decide. `raw` es la IP o el id del usuario **antes** de
 * hashear; nunca sale de este módulo en claro.
 */
export async function checkRateLimit(input: {
  scope: string;
  raw: string;
  rule: RateRule;
  /** Cliente ya creado por la ruta, para no abrir uno segundo. */
  client?: Awaited<ReturnType<typeof getSupabaseServerClient>>;
}): Promise<LimitDecision> {
  const { scope, raw, rule } = input;

  if (isSupabaseConfigured) {
    try {
      const supabase = input.client ?? (await getSupabaseServerClient());
      if (supabase) {
        const { data, error } = await supabase.rpc("rate_limit_hit", {
          p_scope: scope,
          p_key: hashKey(scope, raw, process.env.RATE_LIMIT_SALT ?? "strong-gym"),
          p_limit: rule.limit,
          p_window_seconds: windowSeconds(rule),
        });
        if (!error) {
          const decision = parseDecision(data);
          if (decision) return decision;
        }
      }
    } catch {
      // Base caída o RPC sin migrar: se sigue con el contador en memoria.
    }
  }

  // Respaldo: el contador de siempre, en la memoria de esta instancia.
  const allowed = allowRequest(scope, raw, rule);
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : windowSeconds(rule),
    source: "memory",
  };
}

/** Cabeceras de una respuesta limitada, para que el cliente sepa cuándo volver. */
export function rateLimitHeaders(retryAfterSeconds: number): Record<string, string> {
  return {
    "Retry-After": String(Math.max(1, retryAfterSeconds)),
    "Cache-Control": "private, no-store",
  };
}

/**
 * Respuesta lista para una ruta limitada: 429 con los segundos que faltan.
 * El cliente muestra ese número en vez de un error genérico.
 */
export function rateLimited(retryAfterSeconds: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { error: "RATE_LIMIT", retryAfterSeconds, ...extra },
    { status: 429, headers: rateLimitHeaders(retryAfterSeconds) },
  );
}
