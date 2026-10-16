import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const dataUrl = (s) =>
  `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const modules = {
  "@/lib/data/queries": dataUrl(
    "export const getCurrentUser=async()=>globalThis.__crmTest.user;",
  ),
  "@/lib/supabase/server": dataUrl(
    "export const getSupabaseServerClient=async()=>globalThis.__crmTest.db;",
  ),
  "@/lib/auth/current-user": new URL(
    "../src/lib/auth/current-user.ts",
    import.meta.url,
  ).href,
  "@/lib/crm/schemas": new URL("../src/lib/crm/schemas.ts", import.meta.url)
    .href,
  "next/server": import.meta.resolve("next/server.js"),
  zod: import.meta.resolve("zod"),
};
const source = readFileSync(
  new URL("../src/app/api/admin/clients/route.ts", import.meta.url),
  "utf8",
);
const code = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /from "([^"]+)"/g,
    (_, name) => `from ${JSON.stringify(modules[name])}`,
  );
const { GET, POST } = await import(dataUrl(code));
let calls = [];
function reset(role = "staff") {
  calls = [];
  globalThis.__crmTest = {
    user: role ? { id: "test", role } : null,
    db: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: "ac000000-0000-4000-8000-000000000001", error: null };
      },
    },
  };
}
function req(body, origin = "https://gym.example") {
  return new Request("https://gym.example/api/admin/clients", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "gym.example",
      origin,
    },
    body: JSON.stringify(body),
  });
}
test("API rechaza anónimo y member antes de consultar DB", async () => {
  for (const [role, status] of [
    [null, 401],
    ["member", 403],
  ]) {
    reset(role);
    assert.equal(
      (await GET(new Request("https://gym.example/api/admin/clients"))).status,
      status,
    );
    assert.equal(calls.length, 0);
  }
});
test("API valida formulario; el cliente no necesita email/teléfono/login", async () => {
  reset();
  assert.equal((await POST(req({ action: "create", name: "X" }))).status, 422);
  assert.equal(calls.length, 0);
  const response = await POST(req({ action: "create", name: "Cliente nuevo" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(calls[0], {
    name: "crm_create_client",
    args: {
      p_name: "Cliente nuevo",
      p_phone: "",
      p_email: "",
      p_plan: "",
      p_duplicate_confirmed: false,
    },
  });
});
test("API no acepta POST cross-origin y no procesa token QR por GET", async () => {
  reset();
  assert.equal(
    (
      await POST(
        req(
          { action: "create", name: "Cliente nuevo" },
          "https://otro.example",
        ),
      )
    ).status,
    403,
  );
  assert.equal(calls.length, 0);
  assert.equal(
    (await POST(req({ action: "find-card", token: "no-es-uuid" }))).status,
    422,
  );
});
test("falta de migración se muestra como error, no datos demo ni éxito", async () => {
  reset();
  globalThis.__crmTest.db.rpc = async () => ({
    data: null,
    error: { code: "PGRST202" },
  });
  const response = await GET(
    new Request("https://gym.example/api/admin/clients"),
  );
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error.includes("FASE2.sql"));
});

const detailId = "ac000000-0000-4000-8000-000000000001";
const detailRequest = () =>
  new Request(`https://gym.example/api/admin/clients?id=${detailId}`);
test("API detalle vacío/inválido falla explícitamente, nunca responde éxito null", async () => {
  for (const data of [null, {}, { client: { id: "otro" } }]) {
    reset();
    globalThis.__crmTest.db.rpc = async () => ({ data, error: null });
    const response = await GET(detailRequest());
    assert.ok([404, 503].includes(response.status));
    assert.match(
      (await response.json()).code,
      /^CRM_DETAIL_(EMPTY|INVALID_RESPONSE)$/,
    );
  }
});
test("API diferencia error de esquema/permisos por operación sin filtrar SQL, PII ni mensajes internos", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  for (const code of ["42703", "42501", "PGRST202", "unknown unsafe"]) {
    reset();
    globalThis.__crmTest.db.rpc = async () => ({
      data: null,
      error: {
        code,
        message: "secret-email@test SQL select full_name from profiles",
      },
    });
    const response = await GET(detailRequest());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(
      body.code,
      `CRM_DETAIL_${code === "unknown unsafe" ? "UNKNOWN" : code}`,
    );
    assert.doesNotMatch(JSON.stringify(body), /secret-email|select full_name/);
  }
  assert.doesNotMatch(
    JSON.stringify(logs),
    /secret-email|select full_name|unknown unsafe/,
  );
});
test("API detalle retorna datos de la ficha pedida y mantiene no-store", async () => {
  reset();
  const data = {
    client: { id: detailId },
    card: "token",
    payments: [],
    events: [],
    visits: [],
  };
  globalThis.__crmTest.db.rpc = async () => ({ data, error: null });
  const response = await GET(detailRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), data);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
