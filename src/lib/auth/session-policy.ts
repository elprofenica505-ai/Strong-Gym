/**
 * Cierre automático por inactividad según el rol.
 * - Administrador y personal: 2 horas sin actividad.
 * - Clientes: sin cierre automático; cierran sesión manualmente.
 * La regla vive en el navegador: si la pestaña no responde, el cierre ocurre al volver.
 */
export const STAFF_INACTIVITY_MS = 2 * 60 * 60 * 1000;

/** Sólo el administrador tiene cierre automático; personal y clientes cierran manualmente. */
export function inactivityLimitMs(role: "member" | "staff" | "admin" | null | undefined): number | null {
  return role === "admin" ? STAFF_INACTIVITY_MS : null;
}

export function isInactive(lastActivityMs: number, nowMs: number, limitMs: number | null): boolean {
  return limitMs !== null && nowMs - lastActivityMs >= limitMs;
}
