/** Sólo códigos públicos del SDK. Nunca enviar al usuario mensajes crudos de SMTP/Auth. */
export type AuthEmailFailure = "error" | "rateLimited" | "deliveryUnavailable";
export function authEmailFailure(error: unknown): AuthEmailFailure {
  if (!error || typeof error !== "object") return "error";
  const { code, status } = error as { code?: unknown; status?: unknown };
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
    return "rateLimited";
  }
  if (code === "email_address_not_authorized" || code === "email_provider_disabled") {
    return "deliveryUnavailable";
  }
  return "error";
}
