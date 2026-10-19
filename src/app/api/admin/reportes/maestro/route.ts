import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/queries";
import { isAdminRole } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { FinanceReadError } from "@/lib/finance/read-result";
import { loadFinanceReport } from "@/lib/reports/load";
import { MASTER_FILENAME, buildMasterWorkbook } from "@/lib/reports/workbook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * Excel maestro del gimnasio. Siempre el mismo nombre de archivo y siempre datos actuales.
 * Sólo administración. Un error de lectura responde 503; nunca se exporta una hoja vacía por fallo.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ code: "AUTH" }, { status: 403, headers: noStore });
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
    const buffer = await buildMasterWorkbook(data);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...noStore,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${MASTER_FILENAME}"`,
      },
    });
  } catch (error) {
    const code = error instanceof FinanceReadError ? error.code : "REPORT_FAILED";
    return NextResponse.json(
      { code, message: "No se pudo confirmar la información para el Excel. No se descargó un archivo incompleto." },
      { status: 503, headers: noStore },
    );
  }
}
