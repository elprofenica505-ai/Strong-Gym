/** Destinos internos acotados: no aceptar URLs externas, barras codificadas ni dot segments. */
export function authLocale(value: unknown): "es" | "en" {
  return value === "en" ? "en" : "es";
}

export function safeAuthRedirect(value: unknown, locale: string): string | undefined {
  if (typeof value !== "string" || value.length > 2048 || /[\\%\s#]/.test(value)) return undefined;
  if (!value.startsWith(`/${authLocale(locale)}/`) || value.includes("?")) return undefined;
  const segments = value.split("/");
  if (segments.some(segment => segment === "." || segment === "..")) return undefined;
  // Evitar bucles de autenticación; cada destino conserva su propio guard de rol.
  if (["ingresar", "registro", "recuperar"].includes(segments[2])) return undefined;
  return value;
}

export function authCallbackUrl(origin: string, locale: unknown, flow: "signup" | "recovery"): string {
  const url = new URL("/api/auth/callback", origin);
  url.searchParams.set("locale", authLocale(locale));
  url.searchParams.set("flow", flow);
  return url.toString();
}
