/**
 * Stub del límite de abuso para las pruebas de rutas.
 *
 * Las pruebas de cada ruta comprueban reglas de negocio, no el contador: si el
 * límite real entrara acá, cada prueba necesitaría una base. Se sustituye por
 * una frontera explícita que deja pasar todo, y el límite se prueba aparte en
 * `tests/rate-limit.test.mjs`, `tests/rate-limit-route.test.mjs` y
 * `scripts/test-rate-limit-sql.mjs`.
 */
export const rateLimitStub = `
export const WRITE_RULES = {
  publicForm: { limit: 5, windowMs: 600000 },
  booking: { limit: 30, windowMs: 600000 },
  progress: { limit: 60, windowMs: 600000 },
  finance: { limit: 120, windowMs: 600000 },
  access: { limit: 60, windowMs: 600000 },
};
export const checkRateLimit = async () => globalThis.__rateLimit ?? {
  allowed: true,
  retryAfterSeconds: 0,
  source: "shared",
};
export const rateLimitHeaders = (seconds) => ({
  "Retry-After": String(seconds),
  "Cache-Control": "private, no-store",
});
export const rateLimited = (seconds, extra = {}) =>
  new Response(JSON.stringify({ error: "RATE_LIMIT", retryAfterSeconds: seconds, ...extra }), {
    status: 429,
    headers: { "content-type": "application/json", "Retry-After": String(seconds) },
  });
`;
