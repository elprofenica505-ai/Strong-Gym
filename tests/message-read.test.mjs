import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";
import {
  staffMessageReadRequestSchema,
  staffMessageReadResultSchema,
} from "../src/lib/admin/message-read.ts";

const messageId = "11111111-1111-4111-8111-111111111111";
const validRequest = {
  messageId,
  isRead: true,
  expectedIsRead: false,
};

test("pedido: solo acepta UUID y booleanos escalares, sin campos extra", () => {
  assert.ok(staffMessageReadRequestSchema.safeParse(validRequest).success);
  assert.equal(
    staffMessageReadRequestSchema.safeParse({
      ...validRequest,
      messageId: [messageId],
    }).success,
    false,
  );
  assert.equal(
    staffMessageReadRequestSchema.safeParse({
      ...validRequest,
      isRead: "true",
    }).success,
    false,
  );
  assert.equal(
    staffMessageReadRequestSchema.safeParse({
      ...validRequest,
      expectedIsRead: 0,
    }).success,
    false,
  );
  assert.equal(
    staffMessageReadRequestSchema.safeParse({ ...validRequest, extra: true })
      .success,
    false,
  );
});

test("resultado RPC: cambio e idempotencia deben ser coherentes", () => {
  const changed = {
    id: messageId,
    is_read: true,
    previous_is_read: false,
    changed: true,
  };
  assert.ok(staffMessageReadResultSchema.safeParse(changed).success);
  assert.ok(
    staffMessageReadResultSchema.safeParse({
      ...changed,
      previous_is_read: true,
      changed: false,
    }).success,
  );
  assert.equal(
    staffMessageReadResultSchema.safeParse({
      ...changed,
      previous_is_read: true,
    }).success,
    false,
  );
  assert.equal(
    staffMessageReadResultSchema.safeParse({ ...changed, changed: false })
      .success,
    false,
  );
});

const { POST } = await createLoader({
  "@/lib/data/queries":
    "export const getCurrentUser=async()=>globalThis.__messageReadUser;",
  "@/lib/supabase/env":
    "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
  "@/lib/supabase/server":
    "export const getSupabaseServerClient=async()=>globalThis.__messageReadDb;",
})("app/api/admin/messages/route.ts");

function setup({ user, result, error } = {}) {
  const calls = [];
  globalThis.__messageReadUser = user ?? {
    id: "22222222-2222-4222-8222-222222222222",
    role: "cashier",
    mfa: "ok",
  };
  globalThis.__messageReadDb = {
    rpc(name, args) {
      calls.push({ name, args });
      return {
        abortSignal: () =>
          Promise.resolve({ data: result ?? null, error: error ?? null }),
      };
    },
  };
  return calls;
}

function request(body = validRequest, headers = {}) {
  return new Request("https://strong.test/api/admin/messages", {
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
  id: messageId,
  is_read: true,
  previous_is_read: false,
  changed: true,
};

test("API: caja con MFA guarda y devuelve el estado confirmado por la RPC", async () => {
  const calls = setup({ result: rpcResult });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    messageId,
    isRead: true,
    previousIsRead: false,
    changed: true,
  });
  assert.deepEqual(calls, [
    {
      name: "staff_set_message_read",
      args: {
        p_message_id: messageId,
        p_is_read: true,
        p_expected_is_read: false,
      },
    },
  ]);
});

test("API: entrenador, cliente y caja sin MFA quedan fuera antes de la RPC", async () => {
  for (const user of [
    { id: "u1", role: "trainer", mfa: "ok" },
    { id: "u2", role: "member", mfa: "not_required" },
    { id: "u3", role: "cashier", mfa: "verify" },
  ]) {
    const calls = setup({ user, result: rpcResult });
    const response = await POST(request());
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "AUTH");
    assert.deepEqual(calls, []);
  }
});

test("API: origen cruzado y cuerpo no escalar no llegan a la base", async () => {
  let calls = setup({ result: rpcResult });
  let response = await POST(
    request(validRequest, { "sec-fetch-site": "cross-site" }),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);

  calls = setup({ result: rpcResult });
  response = await POST(request({ ...validRequest, isRead: [true] }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, "INVALID_READ_STATE");
  assert.deepEqual(calls, []);
});

test("API: estado cambiado por otra persona devuelve conflicto claro", async () => {
  setup({ error: { code: "P0001", message: "STALE_READ_STATE" } });
  const response = await POST(request());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error, "STALE_READ_STATE");
  assert.match(body.message, /Otra persona ya cambió/);
});

test("API: si falta la migración no finge un guardado", async () => {
  setup({ error: { code: "PGRST202", message: "function not found" } });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "SETUP_REQUIRED");
});

test("API: un cambio cuyo estado anterior no coincide con lo esperado no es éxito", async () => {
  setup({
    result: {
      ...rpcResult,
      is_read: true,
      previous_is_read: true,
      changed: true,
    },
  });
  const response = await POST(request());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "UNKNOWN");
});

test("API: una respuesta de otra consulta no es éxito", async () => {
  setup({
    result: { ...rpcResult, id: "99999999-9999-4999-8999-999999999999" },
  });
  const response = await POST(request());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "UNKNOWN");
});
