/**
 * Protección básica para formularios públicos (contacto y suscripción).
 * - Límite de envíos por IP dentro de una ventana de tiempo.
 * - Campo trampa (honeypot): si un robot lo llena, se responde OK sin guardar.
 *
 * Límite: el contador vive en memoria de cada instancia del servidor.
 * Es protección parcial: no reemplaza un verificador externo (p. ej. Turnstile)
 * si el formulario recibe ataques reales.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export type RateRule = { limit: number; windowMs: number };

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : "unknown";
}

/** Devuelve true si el envío está permitido y lo cuenta. */
export function allowRequest(
  scope: string,
  ip: string,
  rule: RateRule,
  now: number = Date.now(),
): boolean {
  const key = `${scope}:${ip}`;
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return true;
  }
  if (current.count >= rule.limit) return false;
  current.count += 1;
  return true;
}

/** Campo trampa: cualquier texto no vacío indica un robot. */
export function isHoneypotFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export const FORM_RULE: RateRule = { limit: 5, windowMs: 10 * 60 * 1000 };
