import { readData } from "@/lib/data/read-result";
import { NextResponse } from "next/server";
import { siteConfig } from "@/config/site";
import { getCurrentUser, getMyBookings } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ErrorCode =
  | "AUTH"
  | "DEMO"
  | "FULL"
  | "ALREADY_BOOKED"
  | "LIMIT"
  | "PAST"
  | "CANCELLED"
  | "NOT_FOUND"
  | "TOO_LATE"
  | "UNKNOWN";

function fail(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}

/** GET /api/bookings → reservas del usuario logueado. */
export async function GET() {
  if (!isSupabaseConfigured)
    return NextResponse.json({ bookings: [], mode: "demo" });

  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { error: "AUTH" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );

  const result = await readData(() => getMyBookings(user.id));
  if (!result.ok)
    return NextResponse.json(
      { error: "DATA_UNAVAILABLE", code: result.code },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  return NextResponse.json(
    { bookings: result.data, mode: "supabase" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** POST /api/bookings  { sessionId } → reserva un lugar en la clase. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return fail("DEMO", 503);

  const user = await getCurrentUser();
  if (!user) return fail("AUTH", 401);

  let sessionId: string | undefined;
  try {
    const body = (await request.json()) as { sessionId?: string };
    sessionId = body.sessionId;
  } catch {
    return fail("UNKNOWN", 400);
  }

  if (!sessionId) return fail("UNKNOWN", 400);

  const supabase = await getSupabaseServerClient();
  if (!supabase) return fail("DEMO", 503);

  // La validación de cupo y de duplicados vive en Postgres
  // (función book_session), así no hay condiciones de carrera.
  const { data, error } = await supabase.rpc("book_session", {
    p_session_id: sessionId,
  });

  if (error) {
    const message = `${error.message} ${error.details ?? ""}`.toUpperCase();
    if (message.includes("FULL")) return fail("FULL", 409);
    if (message.includes("ALREADY")) return fail("ALREADY_BOOKED", 409);
    if (message.includes("LIMIT")) return fail("LIMIT", 409);
    if (message.includes("PAST")) return fail("PAST", 409);
    if (message.includes("CANCELLED")) return fail("CANCELLED", 409);
    if (message.includes("NOT_FOUND")) return fail("NOT_FOUND", 404);
    return fail("UNKNOWN", 500);
  }

  return NextResponse.json({ ok: true, booking: data });
}

/** DELETE /api/bookings?id=... → cancela una reserva. */
export async function DELETE(request: Request) {
  if (!isSupabaseConfigured) return fail("DEMO", 503);

  const user = await getCurrentUser();
  if (!user) return fail("AUTH", 401);

  const bookingId = new URL(request.url).searchParams.get("id");
  if (!bookingId) return fail("UNKNOWN", 400);

  const supabase = await getSupabaseServerClient();
  if (!supabase) return fail("DEMO", 503);

  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });

  if (error) {
    const message = `${error.message} ${error.details ?? ""}`.toUpperCase();
    if (message.includes("NOT_FOUND")) return fail("NOT_FOUND", 404);
    if (message.includes("TOO_LATE")) return fail("TOO_LATE", 409);
    return fail("UNKNOWN", 500);
  }

  return NextResponse.json({
    ok: true,
    cancellationWindowHours: siteConfig.cancellationWindowHours,
  });
}
