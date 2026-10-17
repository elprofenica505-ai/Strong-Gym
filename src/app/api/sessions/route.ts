import { NextResponse } from "next/server";
import {
  getBookedSessionIds,
  getCurrentUser,
  getSessionsForWeek,
} from "@/lib/data/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions?week=2026-W42
 * Devuelve las clases de la semana pedida y en cuáles ya está anotado el usuario.
 * En modo demo devuelve la grilla de ejemplo generada en el servidor.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekKey = searchParams.get("week");

  try {
    const [{ week, sessions }, user] = await Promise.all([
      getSessionsForWeek(weekKey),
      getCurrentUser(),
    ]);

    const bookedSessionIds = user ? await getBookedSessionIds(user.id) : [];

    return NextResponse.json(
      {
        weekKey: week.key,
        weekStart: week.start.toISOString(),
        weekEnd: week.end.toISOString(),
        sessions,
        bookedSessionIds,
      },
      {
        headers: {
          // Depende de la sesión del usuario: nunca cachear en el CDN.
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "DATA_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
