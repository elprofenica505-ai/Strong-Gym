import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLoader } from "./helpers/react-loader.mjs";
import {
  FUTURE_SESSION_GENERATION_WEEKS,
  adminFutureSessionsRequestSchema,
  adminFutureSessionsResultSchema,
} from "../src/lib/admin/future-sessions.ts";

const validRequest = { weeks: FUTURE_SESSION_GENERATION_WEEKS };
const rpcResult = {
  weeks: 4,
  first_monday: "2026-11-02",
  last_sunday: "2026-11-29",
  created_count: 27,
  scheduled_count: 36,
};

test("pedido: solo acepta una cantidad entera de semanas entre 1 y 8", () => {
  assert.equal(FUTURE_SESSION_GENERATION_WEEKS, 4);
  assert.ok(adminFutureSessionsRequestSchema.safeParse(validRequest).success);
  for (const weeks of [0, 9, 1.5, "4", [4], null]) {
    assert.equal(
      adminFutureSessionsRequestSchema.safeParse({ weeks }).success,
      false,
      `weeks=${JSON.stringify(weeks)} debe rechazarse`,
    );
  }
  assert.equal(
    adminFutureSessionsRequestSchema.safeParse({ ...validRequest, extra: true })
      .success,
    false,
  );
});

test("resultado RPC: el rango y los conteos deben ser coherentes", () => {
  assert.ok(adminFutureSessionsResultSchema.safeParse(rpcResult).success);
  assert.equal(
    adminFutureSessionsResultSchema.safeParse({
      ...rpcResult,
      last_sunday: "2026-11-28",
    }).success,
    false,
  );
  assert.equal(
    adminFutureSessionsResultSchema.safeParse({
      ...rpcResult,
      first_monday: "2026-02-30",
      last_sunday: "2026-03-29",
    }).success,
    false,
  );
  assert.equal(
    adminFutureSessionsResultSchema.safeParse({
      ...rpcResult,
      created_count: 37,
    }).success,
    false,
  );
  assert.equal(
    adminFutureSessionsResultSchema.safeParse({
      ...rpcResult,
      scheduled_count: -1,
    }).success,
    false,
  );
  assert.equal(
    adminFutureSessionsResultSchema.safeParse({ ...rpcResult, extra: true })
      .success,
    false,
  );
});

const { POST } = await createLoader({
  "@/lib/data/queries":
    "export const getCurrentUser=async()=>globalThis.__futureSessionsUser;",
  "@/lib/supabase/env":
    "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
  "@/lib/supabase/server":
    "export const getSupabaseServerClient=async()=>globalThis.__futureSessionsDb;",
})("app/api/admin/sessions/generate/route.ts");

function setup({
  user = {
    id: "22222222-2222-4222-8222-222222222222",
    role: "admin",
    mfa: "ok",
  },
  result,
  error,
} = {}) {
  const calls = [];
  globalThis.__futureSessionsUser = user;
  globalThis.__futureSessionsDb = {
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
  return new Request("https://strong.test/api/admin/sessions/generate", {
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

test("API: administración con MFA genera y devuelve el rango confirmado", async () => {
  const calls = setup({ result: rpcResult });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    weeks: 4,
    firstMonday: "2026-11-02",
    lastSunday: "2026-11-29",
    createdCount: 27,
    scheduledCount: 36,
  });
  assert.deepEqual(calls, [
    {
      name: "admin_generate_future_sessions",
      args: { p_weeks: 4 },
    },
  ]);
});

test("API: caja, entrenador, cliente y admin sin MFA no llegan a la RPC", async () => {
  for (const user of [
    { id: "u1", role: "cashier", mfa: "ok" },
    { id: "u2", role: "trainer", mfa: "ok" },
    { id: "u3", role: "member", mfa: "not_required" },
    { id: "u4", role: "admin", mfa: "verify" },
    null,
  ]) {
    const calls = setup({ user, result: rpcResult });
    const response = await POST(request());
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "AUTH");
    assert.deepEqual(calls, []);
  }
});

test("API: origen cruzado y semanas no escalares no llegan a la base", async () => {
  let calls = setup({ result: rpcResult });
  let response = await POST(
    request(validRequest, { "sec-fetch-site": "cross-site" }),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);

  calls = setup({ result: rpcResult });
  response = await POST(request({ weeks: [4] }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, "INVALID_FUTURE_WEEKS");
  assert.deepEqual(calls, []);
});

test("API: AUTH e INVALID_FUTURE_WEEKS de la RPC se mapean sin fingir éxito", async () => {
  setup({ error: { code: "P0001", message: "AUTH" } });
  let response = await POST(request());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "AUTH");

  setup({ error: { code: "P0001", message: "INVALID_FUTURE_WEEKS" } });
  response = await POST(request());
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, "INVALID_FUTURE_WEEKS");
});

test("API: si falta la migración no finge una generación", async () => {
  setup({ error: { code: "PGRST202", message: "function not found" } });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "SETUP_REQUIRED");
});

test("API: otro rango o conteos imposibles no son éxito", async () => {
  setup({ result: { ...rpcResult, weeks: 3, last_sunday: "2026-11-22" } });
  let response = await POST(request());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "UNKNOWN");

  setup({ result: { ...rpcResult, created_count: 40 } });
  response = await POST(request());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "UNKNOWN");
});

test("migración 00066: restaura specialties sin poblar datos ni generar sesiones", () => {
  const source = readFileSync(
    new URL(
      "../supabase/migrations/00066_coaches_specialties_generador.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(
    source.includes(
      "add column if not exists specialties text[] not null default '{}'::text[]",
    ),
  );
  assert.ok(source.includes("COACHES_SPECIALTIES_TYPE_MISMATCH"));
  assert.doesNotMatch(
    source,
    /\b(?:insert\s+into|update\s+public\.coaches|delete\s+from)\b/i,
  );
  assert.doesNotMatch(source, /select\s+public\.generate_week_sessions\s*\(/i);
});

test("Operación: el botón vive con Clases, pide 4 semanas y respeta permisos", () => {
  const source = readFileSync(
    new URL("../src/components/admin/admin-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes('fetch("/api/admin/sessions/generate"'));
  assert.ok(source.includes("weeks: FUTURE_SESSION_GENERATION_WEEKS"));
  assert.ok(source.includes("dict.admin.futureSessions.action"));
  assert.ok(source.includes("futureSessionsSaving"));
  assert.ok(source.includes("!canManageClasses ||"));
  assert.ok(source.includes("dict.admin.futureSessions.adminOnly"));
});
