import type { PlanAccess, PlanValidity } from "@/lib/crm/types";

/**
 * Una sola forma de describir la vigencia, en voseo y sin inventar fechas.
 * Las fechas llegan como `YYYY-MM-DD` calculadas en America/Managua; se
 * formatean al mediodía UTC para que ningún huso las mueva un día.
 */
export type ValidityLocale = "es" | "en";

function formatDay(day: string, locale: ValidityLocale): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(locale === "es" ? "es-NI" : "en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

/** "28 oct 2026" a partir de una fecha local `YYYY-MM-DD`. */
export function formatPlanDate(day: string, locale: ValidityLocale): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(locale === "es" ? "es-NI" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function accessLabel(access: PlanAccess, locale: ValidityLocale): string {
  const es = locale === "es";
  switch (access.state) {
    case "active":
      return es
        ? `Vigente hasta el ${formatDay(access.expires_on ?? "", locale)} · ${access.days_left} ${access.days_left === 1 ? "día" : "días"}`
        : `Valid until ${formatDay(access.expires_on ?? "", locale)} · ${access.days_left} ${access.days_left === 1 ? "day" : "days"}`;
    case "upcoming":
      return es
        ? `Empieza el ${formatDay(access.starts_on ?? "", locale)}`
        : `Starts ${formatDay(access.starts_on ?? "", locale)}`;
    case "expired":
      return es
        ? `Venció el ${formatDay(access.expires_on ?? "", locale)}`
        : `Expired ${formatDay(access.expires_on ?? "", locale)}`;
    default:
      return es ? "Sin vigencia registrada" : "No validity on record";
  }
}

export function validityRows(
  validity: PlanValidity | null | undefined,
  locale: ValidityLocale,
): { key: "gym" | "boxing"; label: string; value: string }[] {
  if (!validity) return [];
  return [
    {
      key: "gym",
      label: locale === "es" ? "Gimnasio" : "Gym",
      value: accessLabel(validity.gym, locale),
    },
    {
      key: "boxing",
      label: locale === "es" ? "Boxeo" : "Boxing",
      value: accessLabel(validity.boxing, locale),
    },
  ];
}

export function isAccessActive(access: PlanAccess | null | undefined): boolean {
  return access?.state === "active";
}
