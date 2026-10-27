import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLoader } from "./helpers/react-loader.mjs";
import {
  adminClassActiveRequestSchema,
  adminClassActiveResultSchema,
} from "../src/lib/admin/class-active.ts";

const classId = "cls_boxeo";
const validRequest = {
  classId,
  isActive: false,
  expectedIsActive: true,
};

test("pedido: solo acepta un ID de texto sin espacios y booleanos escalares", () => {
  assert.ok(adminClassActiveRequestSchema.safeParse(validRequest).success);
  assert.equal(
    adminClassActiveRequestSchema.safeParse({
      ...validRequest,
      classId: [classId],
    }).success,
    false,
  );
  assert.equal(
    adminClassActiveRequestSchema.safeParse({
      ...validRequest,
      classId: "cls boxeo",
    }).success,
    false,
  );
  assert.equal(
    adminClassActiveRequestSchema.safeParse({
      ...validRequest,
      classId: "x".repeat(161),
    }).success,
    false,
  );
  assert.equal(
    adminClassActiveRequestSchema.safeParse({
      ...validRequest,
      isActive: "false",
    }).success,
    false,
  );
  assert.equal(
    adminClassActiveRequestSchema.safeParse({
      ...validRequest,
      expectedIsActive: 1,
    }).success,
    false,
  );
  assert.equal(
    adminClassActiveRequestSchema.safeParse({ ...validRequest, extra: true })
      .success,
    false,
  );
});

test("resultado RPC: cambio e idempotencia deben ser coherentes", () => {
  const changed = {
    id: classId,
    is_active: false,
    previous_is_active: true,
    changed: true,
  };
  assert.ok(adminClassActiveResultSchema.safeParse(changed).success);
  assert.ok(
    adminClassActiveResultSchema.safeParse({
      ...changed,
      previous_is_active: false,
      changed: false,
    }).success,
  );
  assert.equal(
    adminClassActiveResultSchema.safeParse({
      ...changed,
      previous_is_active: false,
    }).success,
    false,
  );
  assert.equal(
    adminClassActiveResultSchema.safeParse({ ...changed, changed: false })
      .success,
    false,
  );
  assert.equal(
    adminClassActiveResultSchema.safeParse({ ...changed, extra: true }).success,
    false,
  );
});

const { POST } = await createLoader({
  "@/lib/data/queries":
    "export const getCurrentUser=async()=>globalThis.__classActiveUser;",
  "@/lib/supabase/env":
    "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
  "@/lib/supabase/server":
    "export const getSupabaseServerClient=async()=>globalThis.__classActiveDb;",
})("app/api/admin/classes/route.ts");

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
  globalThis.__classActiveUser = user;
  globalThis.__classActiveDb = {
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
  return new Request("https://strong.test/api/admin/classes", {
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
  id: classId,
  is_active: false,
  previous_is_active: true,
  changed: true,
};

test("API: administración con MFA guarda y devuelve el estado confirmado", async () => {
  const calls = setup({ result: rpcResult });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    classId,
    isActive: false,
    previousIsActive: true,
    changed: true,
  });
  assert.deepEqual(calls, [
    {
      name: "admin_set_class_active",
      args: {
        p_class_id: classId,
        p_is_active: false,
        p_expected_is_active: true,
      },
    },
  ]);
});

test("API: una repetición idempotente confirmada también es éxito", async () => {
  setup({
    result: {
      ...rpcResult,
      previous_is_active: false,
      changed: false,
    },
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    classId,
    isActive: false,
    previousIsActive: false,
    changed: false,
  });
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

test("API: origen cruzado y cuerpo no escalar no llegan a la base", async () => {
  let calls = setup({ result: rpcResult });
  let response = await POST(
    request(validRequest, { "sec-fetch-site": "cross-site" }),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);

  calls = setup({ result: rpcResult });
  response = await POST(request({ ...validRequest, isActive: [false] }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, "INVALID_ACTIVE_STATE");
  assert.deepEqual(calls, []);
});

test("API: estado cambiado por otra persona devuelve conflicto claro", async () => {
  setup({ error: { code: "P0001", message: "STALE_ACTIVE_STATE" } });
  const response = await POST(request());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error, "STALE_ACTIVE_STATE");
  assert.match(body.message, /Otra persona ya cambió/);
});

test("API: disciplina inexistente y AUTH de la RPC se mapean sin fingir éxito", async () => {
  setup({ error: { code: "P0001", message: "NOT_FOUND" } });
  let response = await POST(request());
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "NOT_FOUND");

  setup({ error: { code: "P0001", message: "AUTH" } });
  response = await POST(request());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "AUTH");
});

test("API: si falta la migración no finge un guardado", async () => {
  setup({ error: { code: "PGRST202", message: "function not found" } });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "SETUP_REQUIRED");
});

test("API: un cambio cuyo estado anterior no era el esperado no es éxito", async () => {
  setup({
    result: {
      ...rpcResult,
      is_active: false,
      previous_is_active: false,
      changed: true,
    },
  });
  const response = await POST(request());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "UNKNOWN");
});

test("Operación: la pestaña Clases queda visible en móvil sin desplazamiento lateral", () => {
  const source = readFileSync(
    new URL("../src/components/admin/admin-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes('id: "classes", label: dict.admin.tabs.classes'));
  const tablist = source.match(
    /className="([^"]*)"\s+role="tablist"/,
  )?.[1];
  assert.ok(tablist, "la barra de pestañas debe existir");
  // En móvil es cuadrícula 2×2: las cuatro pestañas se ven sin desplazar.
  assert.ok(tablist.includes("grid grid-cols-2"));
  assert.ok(!tablist.replace("sm:overflow-x-auto", "").includes("overflow-x-auto"));
  // Los botones no fuerzan ancho fijo en móvil (eso empujaba Clases fuera).
  assert.ok(source.includes("justify-center gap-2 rounded-xl px-3 py-2.5"));
  assert.ok(!source.includes('"flex shrink-0 items-center gap-2 rounded-xl px-4'));
});

test("API: una respuesta de otra disciplina o con otro estado no es éxito", async () => {
  setup({ result: { ...rpcResult, id: "cls_otra" } });
  let response = await POST(request());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "UNKNOWN");

  setup({
    result: {
      ...rpcResult,
      is_active: true,
      previous_is_active: true,
      changed: false,
    },
  });
  response = await POST(request());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "UNKNOWN");
});
