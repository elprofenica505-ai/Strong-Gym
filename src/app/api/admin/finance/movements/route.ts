import { NextResponse } from "next/server";
import { canManageFinance } from "@/lib/auth/current-user";
import { getCashierPermissions, getCurrentUser, getMovementsPage } from "@/lib/data/queries";
import { FinanceReadError } from "@/lib/finance/read-result";
import {
  MOVEMENTS_PAGE_SIZE,
  parseMovementFilters,
} from "@/lib/finance/movements-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Una página del historial de movimientos de Caja (FIN-05).
 *
 * Existe porque la pantalla ya no filtra en el navegador: pide al servidor la
 * página que necesita y así puede llegar a un cobro viejo, no sólo a los
 * últimos 30. Devuelve el total que cumple los filtros y las 25 filas pedidas.
 *
 * Reglas:
 *   · Sólo administración o caja con el segundo factor verificado (`AUTH`).
 *     La base lo vuelve a comprobar: `finance_movements_page` exige
 *     `crm_is_staff()`, así que la ruta no es la única defensa.
 *   · El interruptor de gastos lo aplica el servidor: con los egresos
 *     apagados no se devuelven ni se cuentan, aunque la consulta los pida.
 *   · Un filtro imposible responde 422 con el motivo. Un fallo de lectura
 *     responde 503 y **nunca** una lista vacía: «no hay movimientos» y «no
 *     pudimos leer» no son lo mismo.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!canManageFinance(user)) {
    return NextResponse.json({ code: "AUTH" }, { status: 403, headers: noStore });
  }

  const url = new URL(request.url);
  const parsed = parseMovementFilters(url.searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { code: "INVALID_FILTER", message: parsed.message },
      { status: 422, headers: noStore },
    );
  }
  const { filters, page } = parsed.value;

  try {
    const permissions = await getCashierPermissions();
    // El navegador puede pedir egresos; si el interruptor está apagado, no se
    // ven y tampoco suman al total.
    if (!permissions.expenses && filters.direction === "expense") {
      return NextResponse.json(
        { ok: true, rows: [], total: 0, page: 0, pageSize: MOVEMENTS_PAGE_SIZE },
        { status: 200, headers: noStore },
      );
    }
    const result = await getMovementsPage(
      { ...filters, hideExpenses: !permissions.expenses },
      page,
    );
    return NextResponse.json(
      {
        ok: true,
        rows: result.rows,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      },
      { status: 200, headers: noStore },
    );
  } catch (error) {
    const code = error instanceof FinanceReadError ? error.code : "MOVEMENTS_FAILED";
    return NextResponse.json(
      {
        code,
        message:
          "No pudimos leer el historial de movimientos. No se muestra una lista vacía para no hacerte creer que no hay nada.",
      },
      { status: 503, headers: noStore },
    );
  }
}
