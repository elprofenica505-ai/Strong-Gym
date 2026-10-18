import type { SupabaseClient } from "@supabase/supabase-js";
import { authEmailFailure } from "./email-errors";
import { authCallbackUrl } from "./redirects";

export const NEW_PASSWORD_MIN = 12;
export const NEW_PASSWORD_MAX = 128;
export function validNewPassword(password: string): boolean {
  return password.length >= NEW_PASSWORD_MIN && password.length <= NEW_PASSWORD_MAX && password.trim().length > 0;
}

export async function requestRecovery(client: SupabaseClient, email: string, origin: string, locale: string) {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "invalid" as const;
  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authCallbackUrl(origin, locale, "recovery"),
    });
    // No exponer existencia de cuentas, mensajes del proveedor ni direcciones.
    return error ? authEmailFailure(error) : "sent" as const;
  } catch (error) { return authEmailFailure(error); }
}

export async function changeRecoveredPassword(client: SupabaseClient, expectedUserId: string, password: string) {
  if (!expectedUserId || !validNewPassword(password)) return "invalid" as const;
  try {
    const identity = await client.auth.getUser();
    if (identity.error || identity.data.user?.id !== expectedUserId) return "auth" as const;
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || !["aal1", "aal2"].includes(assurance.data?.currentLevel ?? "") ||
        !["aal1", "aal2"].includes(assurance.data?.nextLevel ?? "")) return "error" as const;
    const hasVerifiedFactor = identity.data.user.factors?.some(f => f.status === "verified");
    if ((hasVerifiedFactor || assurance.data.nextLevel === "aal2") && assurance.data.currentLevel !== "aal2") {
      return "mfa" as const; // No degradar cuentas con MFA ni modificar sus factores.
    }
    const result = await client.auth.updateUser({ password });
    if (result.error || result.data.user?.id !== expectedUserId) return "error" as const;
  } catch {
    // Respuesta perdida: no afirmar que la contraseña NO cambió ni repetir automáticamente.
    return "error" as const;
  }
  try {
    const { error } = await client.auth.signOut({ scope: "global" });
    return error ? "changed_logout_failed" as const : "changed" as const;
  } catch { return "changed_logout_failed" as const; }
}
