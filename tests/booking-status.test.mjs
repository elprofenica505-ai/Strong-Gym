import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";
import {
  canStaffChangeBookingStatus,
  staffBookingStatusActions,
  staffBookingStatusRequestSchema,
  staffBookingStatusResultSchema,
} from "../src/lib/admin/booking-status.ts";

const bookingId = "11111111-1111-4111-8111-111111111111";
const validRequest = {
  bookingId,
  status: "attended",
  expectedStatus: "confirmed",
};

test("acciones visibles: confirmada puede pasar a los tres estados del personal", () => {
  assert.deepEqual(staffBookingStatusActions("confirmed"), [
    "attended",
    "no_show",
    "cancelled",
  ]);
});

test("acciones visibles: asistida y ausente se pueden corregir entre sí o cancelar", () => {
  assert.deepEqual(staffBookingStatusActions("attended"), [
    "no_show",
    "cancelled",
  ]);
  assert.deepEqual(staffBookingStatusActions("no_show"), [
    "attended",
    "cancelled",
  ]);
  assert.equal(canStaffChangeBookingStatus("attended", "attended"), false);
});

test("acciones visibles: cancelada es terminal desde Operación", () => {
  assert.deepEqual(staffBookingStatusActions("cancelled"), []);
});

test("pedido: solo acepta escalares, UUID y estados cerrados", () => {
  assert.ok(staffBookingStatusRequestSchema.safeParse(validRequest).success);
  assert.equal(
    staffBookingStatusRequestSchema.safeParse({
      ...validRequest,
      status: "confirmed",
    }).success,
    false,
  );
  assert.equal(
    staffBookingStatusRequestSchema.safeParse({
      ...validRequest,
      bookingId: [bookingId],
    }).success,
    false,
  );
  assert.equal(
    staffBookingStatusRequestSchema.safeParse({
      ...validRequest,
      expectedStatus: 123,
    }).success,
    false,
  );
  assert.equal(
    staffBookingStatusRequestSchema.safeParse({ ...validRequest, extra: true })
      .success,
    false,
  );
});

test("resultado RPC: cambio e idempotencia deben ser coherentes", () => {
  const changed = {
    id: bookingId,
    session_id: "ses_ejemplo",
    status: "attended",
    previous_status: "confirmed",
    changed: true,
    cancelled_at: null,
  };
  assert.ok(staffBookingStatusResultSchema.safeParse(changed).success);
  assert.ok(
    staffBookingStatusResultSchema.safeParse({
      ...changed,
      previous_status: "attended",
      changed: false,
    }).success,
  );
  assert.equal(
    staffBookingStatusResultSchema.safeParse({
      ...changed,
      status: "cancelled",
    }).success,
    false,
  );
  assert.equal(
    staffBookingStatusResultSchema.safeParse({
      ...changed,
      previous_status: "attended",
    }).success,
    false,
  );
  assert.equal(
    staffBookingStatusResultSchema.safeParse({ ...changed, changed: false })
      .success,
    false,
  );
});

const { POST } = await createLoader({
  "@/lib/data/queries":
    "export const getCurrentUser=async()=>globalThis.__bookingStatusUser;",
  "@/lib/supabase/env":
    "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
  "@/lib/supabase/server":
    "export const getSupabaseServerClient=async()=>globalThis.__bookingStatusDb;",
})("app/api/admin/bookings/route.ts");

function setup({ user, result, error } = {}) {
  const calls = [];
  globalThis.__bookingStatusUser = user ?? {
    id: "22222222-2222-4222-8222-222222222222",
    role: "cashier",
    mfa: "ok",
  };
  globalThis.__bookingStatusDb = {
    rpc(name, args) {
      calls.push({ name, args });
      return {
        abortSignal: () => Promise.resolve({ data: result ?? null, error: error ?? null }),
      };
    },
  };
  return calls;
}

function request(body = validRequest, headers = {}) {
  return new Request("https://strong.test/api/admin/bookings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://strong.test",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const rpcResult = {
  id: bookingId,
  session_id: "ses_ejemplo",
  status: "attended",
  previous_status: "confirmed",
  changed: true,
  cancelled_at: null,
};

test("API: caja con MFA guarda y devuelve el estado confirmado por la RPC", async () => {
  const calls = setup({ result: rpcResult });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    bookingId,
    sessionId: "ses_ejemplo",
    status: "attended",
    previousStatus: "confirmed",
    changed: true,
    cancelledAt: null,
  });
  assert.deepEqual(calls, [
    {
      name: "staff_set_booking_status",
      args: {
        p_booking_id: bookingId,
        p_status: "attended",
        p_expected_status: "confirmed",
      },
    },
  ]);
});

test("API: entrenador y caja sin MFA quedan fuera antes de llamar la RPC", async () => {
  for (const user of [
    { id: "u1", role: "trainer", mfa: "ok" },
    { id: "u2", role: "cashier", mfa: "verify" },
    { id: "u3", role: "member", mfa: "not_required" },
  ]) {
    const calls = setup({ user, result: rpcResult });
    const response = await POST(request());
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "AUTH");
    assert.deepEqual(calls, []);
  }
});

test("API: origen cruzado y cuerpo inválido no llegan a la base", async () => {
  let calls = setup({ result: rpcResult });
  let response = await POST(
    request(validRequest, { "sec-fetch-site": "cross-site" }),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);

  calls = setup({ result: rpcResult });
  response = await POST(request({ ...validRequest, status: ["attended"] }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, "INVALID_STATUS");
  assert.deepEqual(calls, []);
});

test("API: estado cambiado por otra persona devuelve conflicto claro", async () => {
  setup({ error: { code: "P0001", message: "STALE_STATUS" } });
  const response = await POST(request());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error, "STALE_STATUS");
  assert.match(body.message, /Otra persona ya cambió/);
});

test("API: si falta la migración no finge un guardado", async () => {
  setup({ error: { code: "PGRST202", message: "function not found" } });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "SETUP_REQUIRED");
});

test("API: una respuesta RPC de otra reserva no es éxito", async () => {
  setup({
    result: {
      ...rpcResult,
      id: "99999999-9999-4999-8999-999999999999",
    },
  });
  const response = await POST(request());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "UNKNOWN");
});
