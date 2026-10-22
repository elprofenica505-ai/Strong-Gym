// Bitácora de cambios de rol (tabla role_changes, escrita por admin_set_role en 00034).
// Sólo lectura: el administrador la consulta; nadie la edita desde la aplicación.

export type RoleChangeRow = {
  id: number;
  targetId: string;
  oldRole: string;
  newRole: string;
  changedBy: string | null;
  changedAt: string;
};

export type RoleAuditItem = {
  id: number;
  person: string;
  from: string;
  to: string;
  by: string;
  at: string;
};

export const ROLE_LABEL: Record<string, string> = {
  member: "Cliente",
  cashier: "Caja",
  trainer: "Entrenador",
  admin: "Administración",
  staff: "Personal anterior",
};

/** Convierte filas de la bitácora en texto legible. Un id desconocido no oculta el cambio. */
export function roleAuditItems(
  changes: RoleChangeRow[],
  names: ReadonlyMap<string, string>,
  formatDate: (iso: string) => string = (iso) => iso,
): RoleAuditItem[] {
  const nameOf = (id: string | null) => (id ? names.get(id) || "Sin nombre" : "Sistema");
  return changes.map((c) => ({
    id: c.id,
    person: nameOf(c.targetId),
    from: ROLE_LABEL[c.oldRole] ?? c.oldRole,
    to: ROLE_LABEL[c.newRole] ?? c.newRole,
    by: nameOf(c.changedBy),
    at: formatDate(c.changedAt),
  }));
}
