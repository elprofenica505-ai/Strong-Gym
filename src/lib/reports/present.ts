import type ExcelJS from "exceljs";

/**
 * Presentación de las descargas filtradas: bordes, filas alternadas, anchos ajustados
 * al contenido, formatos numéricos y fechas reales (ordenables y filtrables en Excel).
 * Sólo cambia la forma; los valores y las filas son los mismos. El Excel maestro no pasa por aquí.
 */

const MONEY = "#,##0.00;[Red]-#,##0.00";
const DATE = "dd/mm/yyyy";
const DATE_TIME = "dd/mm/yyyy hh:mm";

const HEADER_FILL = "FF0F172A";
const BAND_FILL = "FFF1F5F9";
const BORDER_COLOR = "FFCBD5E1";

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/;
const DMY = /^(\d{2})\/(\d{2})\/(\d{4})(?:,? (\d{2}):(\d{2}))?$/;

/** Fecha de Excel (serie) para una hora de pared de Managua: no depende de la zona del servidor. */
function parseDate(s: string): { value: number; fmt: string } | null {
  const iso = ISO.exec(s);
  const dmy = iso ? null : DMY.exec(s);
  const m = iso ?? dmy;
  if (!m) return null;
  const y = Number(iso ? m[1] : m[3]);
  const mo = Number(m[2]);
  const d = Number(iso ? m[3] : m[1]);
  const hh = m[4] !== undefined ? Number(m[4]) : 0;
  const mi = m[5] !== undefined ? Number(m[5]) : 0;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCDate() !== d || check.getUTCMonth() !== mo - 1) return null;
  const value = Date.UTC(y, mo - 1, d, hh, mi) / 86400000 + 25569;
  return { value, fmt: m[4] !== undefined ? DATE_TIME : DATE };
}

/** Formato de un número según el encabezado de su columna. null = dejar general. */
function numberFormat(header: string, label: string): string | null {
  if (/Tasa/i.test(header)) return "0.00";
  if (header.includes("%")) return "0.00%";
  if (header === "Movimientos" || /Clientes con/.test(header)) return "0";
  if (header === "Valor") return /Movimientos|Clientes con/.test(label) ? "0" : MONEY;
  if (/Monto|NIO|USD|Deuda|Crédito|Efectivo|Vuelto|Comisión|Ingresos|Egresos|Neto|Saldo|Equivalente/.test(header)) {
    return MONEY;
  }
  return null;
}

const thin = { style: "thin" as const, color: { argb: BORDER_COLOR } };

/** Aplica el formato profesional a una hoja ya llena. Mantiene la fila de encabezado y el filtro. */
export function presentSheet(ws: ExcelJS.Worksheet): void {
  const headerRow = ws.getRow(1);
  const colCount = ws.columnCount;
  const headers = Array.from({ length: colCount }, (_, i) => String(headerRow.getCell(i + 1).value ?? ""));
  const widths = headers.map((h) => Math.min(Math.max(h.length, 8), 18));

  headerRow.height = 32;
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  for (let c = 1; c <= colCount; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.border = { top: thin, bottom: thin, left: thin, right: thin };
  }

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = String(row.getCell(1).value ?? "");
    const filled = Array.from({ length: colCount }, (_, i) => {
      const v = row.getCell(i + 1).value;
      return v !== null && v !== undefined && v !== "";
    });
    // Una fila con una sola celda es una nota (por ejemplo, al pie de «Comisiones»): no se ajusta ni se tabula.
    const isNote = filled.filter(Boolean).length === 1;

    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      const raw = cell.value;
      let display = 0;

      if (typeof raw === "string") {
        const date = parseDate(raw);
        if (date) {
          cell.value = date.value;
          cell.numFmt = date.fmt;
          display = 17;
        } else {
          display = raw.length;
        }
      } else if (typeof raw === "number") {
        const fmt = numberFormat(headers[c - 1], label);
        if (fmt) cell.numFmt = fmt;
        display = fmt === MONEY ? Math.abs(raw).toLocaleString("en-US", { minimumFractionDigits: 2 }).length + 2 : String(raw).length;
      }

      if (!isNote) {
        widths[c - 1] = Math.max(widths[c - 1], Math.min(display, 48));
        cell.border = { top: thin, bottom: thin, left: thin, right: thin };
        if (r % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
        cell.alignment = { vertical: "middle", horizontal: typeof cell.value === "number" ? "right" : "left" };
      }
    }
  }

  for (let c = 1; c <= colCount; c++) {
    ws.getColumn(c).width = Math.min(Math.max(widths[c - 1] + 2, 10), 50);
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
