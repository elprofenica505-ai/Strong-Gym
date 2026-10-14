/** Une clases condicionales. Reemplaza a `clsx` sin agregar dependencias. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/** "Camila Rodríguez" → "CR" */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/** Corta un texto sin partir palabras. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}…`;
}

/** Slug simple para URLs y anclas. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Espera n milisegundos (para animaciones / reintentos). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------
   Colores de disciplina sobre fondo oscuro

   Los colores de cada clase (boxeo, pesas, zumba…) vienen cargados en
   la base para una web clara: el de "Pesas y máquinas" es casi negro.
   Sobre el fondo oscuro del sitio ese color desaparecería, así que
   antes de pintarlo se aclara lo justo para que se lea.
   ------------------------------------------------------------------ */

/** Luminancia relativa (WCAG) de un color hex. `null` si no es hex válido. */
function relativeLuminance(color: string): number | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;

  const hex = match[1];
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;

  const channel = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

  const r = channel(parseInt(full.slice(0, 2), 16) / 255);
  const g = channel(parseInt(full.slice(2, 4), 16) / 255);
  const b = channel(parseInt(full.slice(4, 6), 16) / 255);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Aclara un hex acercándolo al blanco (0 = igual, 1 = blanco). */
function lighten(color: string, amount: number): string {
  const hex = color.replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  const parts = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
  const mixed = parts.map((part) => Math.round(part + (255 - part) * amount));
  return `#${mixed.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Color de disciplina listo para pintar sobre el fondo oscuro: si ya
 * tiene contraste se devuelve igual, y si es muy oscuro se aclara.
 */
export function accentOnDark(color: string): string {
  const luminance = relativeLuminance(color);
  if (luminance === null || luminance >= 0.12) return color;

  const amount = Math.min(1, (0.12 - luminance) / 0.12) * 0.62;
  return lighten(color, amount);
}

/** Color de texto (blanco o negro) que se lee encima de ese color. */
export function textOnAccent(color: string): string {
  const luminance = relativeLuminance(accentOnDark(color));
  if (luminance === null) return "#ffffff";
  return luminance > 0.1866 ? "#0c0c0e" : "#ffffff";
}
