// Ficha formal del personal (tabla staff_members, migración 00049).
// Sólo el administrador con verificación en dos pasos da de alta, edita y da de baja.
// La validación de la base es la autoridad; esta validación sólo evita viajes inútiles
// y muestra el error junto al campo. Mantener las reglas iguales a staff_save().

export type StaffRole = "trainer" | "cashier" | "admin";

export const STAFF_ROLES: StaffRole[] = ["trainer", "cashier", "admin"];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  trainer: "Entrenador",
  cashier: "Caja",
  admin: "Administración",
};

export type StaffFieldKey =
  | "fullName"
  | "nationalId"
  | "birthDate"
  | "phone"
  | "address"
  | "emergencyName"
  | "emergencyPhone"
  | "positionTitle"
  | "hiredOn"
  | "responsibilities"
  | "internalNotes";

export type StaffField = {
  key: StaffFieldKey;
  label: string;
  required: boolean;
  kind: "text" | "date" | "multiline";
  max: number;
  hint?: string;
  section: "identidad" | "contacto" | "empleo";
};

export const STAFF_FIELDS: StaffField[] = [
  { key: "fullName", label: "Nombre completo", required: true, kind: "text", max: 120, section: "identidad" },
  { key: "nationalId", label: "Cédula", required: true, kind: "text", max: 16, hint: "Formato 001-010190-1000A", section: "identidad" },
  { key: "birthDate", label: "Fecha de nacimiento", required: true, kind: "date", max: 10, hint: "Debe tener 18 años o más", section: "identidad" },
  { key: "phone", label: "Teléfono", required: true, kind: "text", max: 20, section: "contacto" },
  { key: "address", label: "Dirección", required: true, kind: "text", max: 250, section: "contacto" },
  { key: "emergencyName", label: "Contacto de emergencia (nombre)", required: true, kind: "text", max: 120, section: "contacto" },
  { key: "emergencyPhone", label: "Contacto de emergencia (teléfono)", required: true, kind: "text", max: 20, section: "contacto" },
  { key: "positionTitle", label: "Cargo", required: true, kind: "text", max: 80, section: "empleo" },
  { key: "hiredOn", label: "Fecha de ingreso", required: true, kind: "date", max: 10, section: "empleo" },
  { key: "responsibilities", label: "Responsabilidades", required: false, kind: "multiline", max: 800, section: "empleo" },
  { key: "internalNotes", label: "Notas internas (sólo administración)", required: false, kind: "multiline", max: 800, section: "empleo" },
];

export type StaffValues = Record<StaffFieldKey, string>;

export const EMPTY_STAFF_VALUES: StaffValues = {
  fullName: "",
  nationalId: "",
  birthDate: "",
  phone: "",
  address: "",
  emergencyName: "",
  emergencyPhone: "",
  positionTitle: "",
  hiredOn: "",
  responsibilities: "",
  internalNotes: "",
};

const NATIONAL_ID = /^[0-9]{3}-[0-9]{6}-[0-9]{4}[A-Z]$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha de hoy en Managua, como AAAA-MM-DD. */
export function managuaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Managua", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts;
}

function yearsBefore(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${y - years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Devuelve errores por campo (texto en español). Vacío = el formulario puede enviarse.
 * `today` se inyecta para poder probar sin depender del reloj.
 */
export function validateStaffValues(values: StaffValues, today: string = managuaToday()): Partial<Record<StaffFieldKey, string>> {
  const errors: Partial<Record<StaffFieldKey, string>> = {};
  for (const field of STAFF_FIELDS) {
    const value = values[field.key].trim();
    if (field.required && value.length === 0) {
      errors[field.key] = "Este dato es obligatorio.";
      continue;
    }
    if (value.length > field.max) {
      errors[field.key] = `Máximo ${field.max} caracteres.`;
    }
  }
  const nid = values.nationalId.trim();
  if (!errors.nationalId && nid && !NATIONAL_ID.test(nid)) {
    errors.nationalId = "La cédula debe tener el formato 001-010190-1000A.";
  }
  const birth = values.birthDate.trim();
  if (!errors.birthDate && birth) {
    if (!ISO_DATE.test(birth)) errors.birthDate = "Fecha no válida.";
    else if (birth < "1920-01-01" || birth > yearsBefore(today, 18)) errors.birthDate = "La persona debe tener 18 años o más.";
  }
  const hired = values.hiredOn.trim();
  if (!errors.hiredOn && hired) {
    if (!ISO_DATE.test(hired)) errors.hiredOn = "Fecha no válida.";
    else if (hired > today || hired < "2000-01-01") errors.hiredOn = "La fecha de ingreso no puede ser futura ni anterior a 2000.";
  }
  for (const key of ["phone", "emergencyPhone"] as const) {
    const v = values[key].trim();
    if (!errors[key] && v && (v.length < 8 || v.length > 20)) errors[key] = "El teléfono debe tener entre 8 y 20 caracteres.";
  }
  return errors;
}

/** Texto para cada código de error que devuelve la base o la API. */
export const STAFF_ERROR_MESSAGES: Record<string, string> = {
  AUTH: "Sólo un administrador con verificación en dos pasos puede dar de alta o de baja al personal.",
  SELF_STAFF_CHANGE: "No podés cambiar tu propia ficha de personal ni darte de baja. Pedile a otro administrador.",
  NOT_FOUND: "No encontramos esa cuenta.",
  INVALID_ROLE: "Elegí un rol de personal: entrenador, caja o administración.",
  NAME_INVALID: "Revisá el nombre completo.",
  NATIONAL_ID_INVALID: "La cédula debe tener el formato 001-010190-1000A.",
  DATE_INVALID: "Revisá las fechas.",
  BIRTH_INVALID: "La persona debe tener 18 años o más para ser parte del personal.",
  HIRE_DATE_INVALID: "La fecha de ingreso no es válida.",
  PHONE_INVALID: "Revisá el teléfono.",
  ADDRESS_INVALID: "Revisá la dirección.",
  EMERGENCY_NAME_INVALID: "Revisá el nombre del contacto de emergencia.",
  EMERGENCY_PHONE_INVALID: "Revisá el teléfono del contacto de emergencia.",
  POSITION_INVALID: "Revisá el cargo.",
  RESPONSIBILITIES_TOO_LONG: "Las responsabilidades son demasiado largas.",
  NOTES_TOO_LONG: "Las notas internas son demasiado largas.",
  REASON_REQUIRED: "Escribí el motivo de la baja (mínimo 5 caracteres).",
  LAST_ADMIN: "No se puede dar de baja al último administrador activo.",
};

export function staffErrorMessage(code: string | undefined | null): string {
  if (code && STAFF_ERROR_MESSAGES[code]) return STAFF_ERROR_MESSAGES[code];
  return "No se pudo guardar. No se modificó ninguna ficha.";
}

/** Nombres de campo de la bitácora (staff_audit.changed_fields) en texto legible. */
export const STAFF_AUDIT_FIELD_LABEL: Record<string, string> = {
  fullName: "nombre",
  nationalId: "cédula",
  birthDate: "fecha de nacimiento",
  phone: "teléfono",
  address: "dirección",
  emergencyName: "contacto de emergencia",
  emergencyPhone: "teléfono de emergencia",
  positionTitle: "cargo",
  hiredOn: "fecha de ingreso",
  responsibilities: "responsabilidades",
  internalNotes: "notas internas",
  role: "rol",
  status: "estado",
};

export function staffAuditFieldsText(fields: string[]): string {
  if (fields.length === 0) return "sin campos";
  return fields.map((f) => STAFF_AUDIT_FIELD_LABEL[f] ?? f).join(", ");
}

export type StaffPersonState = "completa" | "pendiente" | "inactiva";

/** Estado de una persona con rol de personal: sin ficha, con ficha completa o dada de baja. */
export function staffPersonState(hasFicha: boolean, status?: "activo" | "inactivo"): StaffPersonState {
  if (!hasFicha) return "pendiente";
  return status === "inactivo" ? "inactiva" : "completa";
}

export const STAFF_STATE_LABEL: Record<StaffPersonState, string> = {
  completa: "Ficha completa",
  pendiente: "Falta ficha",
  inactiva: "Inactiva",
};

export const STAFF_AUDIT_ACTION_LABEL: Record<string, string> = {
  alta: "Alta",
  edicion: "Edición",
  baja: "Baja",
  reactivacion: "Reactivación",
};

export type StaffAuditRow = {
  id: number;
  profileId: string;
  action: string;
  changedFields: string[];
  changedBy: string | null;
  changedAt: string;
};

export type StaffAuditItem = {
  id: number;
  person: string;
  action: string;
  detail: string;
  by: string;
  at: string;
};

/** Convierte la bitácora de personal en texto legible. Nunca incluye valores, sólo nombres de campos. */
export function staffAuditItems(
  rows: StaffAuditRow[],
  names: Map<string, string>,
  formatDate: (iso: string) => string,
): StaffAuditItem[] {
  return rows.map((r) => {
    let detail: string;
    if (r.action === "edicion") detail = `Cambió: ${staffAuditFieldsText(r.changedFields)}`;
    else if (r.action === "alta") detail = "Ficha creada";
    else if (r.action === "baja") detail = "Acceso bloqueado";
    else if (r.action === "reactivacion") detail = "Acceso restablecido";
    else detail = staffAuditFieldsText(r.changedFields);
    return {
      id: r.id,
      person: names.get(r.profileId) ?? "Sin nombre",
      action: STAFF_AUDIT_ACTION_LABEL[r.action] ?? r.action,
      detail,
      by: r.changedBy ? (names.get(r.changedBy) ?? "Sin nombre") : "Sistema",
      at: formatDate(r.changedAt),
    };
  });
}
