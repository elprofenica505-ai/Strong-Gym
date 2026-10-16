import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";

// Ejecutar el proxy real con el SDK real, sin contactar Supabase ni usar claves reales.
const env = `export const SUPABASE_URL = "https://test-project.supabase.co";
export const SUPABASE_ANON_KEY = "public-test-key-not-a-real-secret";
export const isSupabaseConfigured = true;`;
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const source = readFileSync(new URL("../src/lib/supabase/proxy-client.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
  .replace('"./env"', JSON.stringify(dataUrl(env)))
  .replace('"next/server"', JSON.stringify(import.meta.resolve("next/server.js")))
  .replace('"@supabase/ssr"', JSON.stringify(import.meta.resolve("@supabase/ssr")));
const { updateSession } = await import(dataUrl(compiled));
const id = "00000000-0000-4000-8000-000000000001";
const user = { id, aud: "authenticated", role: "authenticated", email: "test@example.com", created_at: "2026-10-01T00:00:00Z" };
const jwt = (exp) => [
  { alg: "HS256", typ: "JWT" }, { sub: id, exp, role: "authenticated" },
].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".test-signature";

test("refresh: cookies nuevas llegan al render actual y al navegador; conserva idioma y headers del SDK", async () => {
  const now = Math.floor(Date.now() / 1000);
  const oldSession = { access_token: jwt(now - 60), refresh_token: "old-refresh", expires_at: now - 60, expires_in: 3600, token_type: "bearer", user };
  const newSession = { access_token: jwt(now + 3600), refresh_token: "new-refresh", expires_at: now + 3600, expires_in: 3600, token_type: "bearer", user };
  const cookie = "base64-" + Buffer.from(JSON.stringify(oldSession)).toString("base64url");
  const originalFetch = globalThis.fetch;
  let refreshCalls = 0;
  let verifiedNewToken = false;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/token")) {
      refreshCalls++;
      return Response.json(newSession);
    }
    assert.ok(String(url).endsWith("/user"));
    verifiedNewToken = new Headers(init.headers).get("authorization") === `Bearer ${newSession.access_token}`;
    return Response.json(user);
  };
  try {
    const request = new NextRequest("https://strong-gym.example/es/panel", {
      headers: { cookie: `sb-test-project-auth-token=${cookie}; strong-gym-locale=es` },
    });
    const initial = NextResponse.next();
    initial.cookies.set("strong-gym-locale", "es");
    initial.headers.set("x-test-preserved", "yes");
    const response = await updateSession(request, initial);
    assert.equal(refreshCalls, 1);
    assert.equal(verifiedNewToken, true);
    assert.equal(response.cookies.get("strong-gym-locale").value, "es");
    assert.equal(response.headers.get("x-test-preserved"), "yes");
    const updated = response.cookies.get("sb-test-project-auth-token").value;
    assert.notEqual(updated, cookie);
    assert.ok(response.headers.get("x-middleware-request-cookie").includes(updated));
    assert.ok(response.headers.get("x-middleware-override-headers").includes("cookie"));
    assert.ok(response.headers.get("cache-control").includes("no-store"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
