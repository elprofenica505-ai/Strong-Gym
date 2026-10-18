"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTotpCode, mfaStateFromLevels, type MfaState } from "./current-user";

export const MFA_FACTOR_NAME = "Strong Gym";

export type MfaActionError = "code" | "unavailable";
export type MfaActionResult = { ok: true } | { ok: false; error: MfaActionError };

export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** Lee el estado real de la sesión; no confía en metadata ni en el rol del JWT. */
export async function readMfaState(
  client: SupabaseClient,
  role: unknown,
): Promise<MfaState> {
  try {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return "unavailable";
    return mfaStateFromLevels(role, data);
  } catch {
    return "unavailable";
  }
}

/**
 * Crea un factor TOTP nuevo. Antes elimina factores TOTP sin verificar que
 * quedaron de intentos anteriores, para no acumular registros pendientes.
 */
export async function startTotpEnrollment(
  client: SupabaseClient,
): Promise<TotpEnrollment | MfaActionError> {
  try {
    const { data: list, error: listError } = await client.auth.mfa.listFactors();
    if (listError || !list) return "unavailable";
    for (const factor of list.all ?? []) {
      if (factor.factor_type === "totp" && factor.status === "unverified") {
        await client.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    const { data, error } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: MFA_FACTOR_NAME,
    });
    if (error || !data?.id || data.type !== "totp") return "unavailable";
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  } catch {
    return "unavailable";
  }
}

/** Factor TOTP verificado de la cuenta, o null si no hay ninguno. */
export async function verifiedTotpFactorId(
  client: SupabaseClient,
): Promise<string | null | "unavailable"> {
  try {
    const { data, error } = await client.auth.mfa.listFactors();
    if (error || !data) return "unavailable";
    const factor = (data.totp ?? []).find((f) => f.status === "verified");
    return factor?.id ?? null;
  } catch {
    return "unavailable";
  }
}

/** Desafío + verificación del código. Al éxito Supabase sube la sesión a AAL2. */
export async function verifyTotpCode(
  client: SupabaseClient,
  factorId: string,
  code: string,
): Promise<MfaActionResult> {
  if (!isTotpCode(code)) return { ok: false, error: "code" };
  try {
    const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) return { ok: false, error: "unavailable" };
    const { error } = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (error) return { ok: false, error: "code" };
    return { ok: true };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
