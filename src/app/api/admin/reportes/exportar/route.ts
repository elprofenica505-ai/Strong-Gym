import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/queries";
import { isAdminRole } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { FinanceReadError } from "@/lib/finance/read-result";
import { loadFinanceReport } from "@/lib/reports/load";
import { buildFilteredWorkbook } from "@/lib/reports/workbook";
import {
  buildMovementsCsv,
  exportFilename,
  filterLedger,
  parseExportFilters,
} from "@/lib/reports/export-filter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * Exportación completa con filtros (Excel o CSV). Sólo administración con verificación en dos pasos.
 * Incluye todos los movimientos que cumplen los filtros, no sólo los de la pantalla.
 * Un filtro inválido responde 422; un error de lectura responde 503. Nunca se entrega un archivo incompleto.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mfa !== "ok") {
    return NextResponse.json({ code: "AUTH" }, { status: 403, headers: noStore });
  }

  const url = new URL(request.url);
  const parsed = parseExportFilters(url.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ code: "INVALID_FILTER", message: parsed.message }, { status: 422, headers: noStore });
  }
  const format = url.searchParams.get("format") ?? "xlsx";
  if (format !== "xlsx" && format !== "csv") {
    return NextResponse.json({ code: "INVALID_FORMAT", message: "Formato no válido." }, { status: 422, headers: noStore });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503, headers: noStore });
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503, headers: noStore });
  }

  try {
    const data = await loadFinanceReport(supabase);
    const filters = parsed.filters;
    const disposition = `attachment; filename="${exportFilename(filters, format)}"`;
    if (format === "csv") {
      const body = buildMovementsCsv(filterLedger(data.rows, filters));
      return new NextResponse(body, {
        status: 200,
        headers: {
          ...noStore,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": disposition,
        },
      });
    }
    const buffer = await buildFilteredWorkbook(data, filters);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...noStore,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": disposition,
      },
    });
  } catch (error) {
    const code = error instanceof FinanceReadError ? error.code : "REPORT_FAILED";
    return NextResponse.json(
      { code, message: "No se pudo confirmar la información del reporte. No se descargó un archivo incompleto." },
      { status: 503, headers: noStore },
    );
  }
}
