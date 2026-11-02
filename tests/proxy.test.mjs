import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";

// Ejecutar el proxy real con el SDK real, sin contactar Supabase ni usar claves reales.
const env = `export const SUPABASE_URL = "https://test-project.supabase.co";
export const SUPABASE_ANON_KEY = "public-test-key-not-a-real-secret";
export const isSupabaseConfigured = true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;`;
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

// El trueno de la pantalla de carga: el navegador lo pide como archivo y el
// proxy no puede mandarlo al idioma (quedaría en /es/sounds/… y no existe).
test("los archivos de /public se sirven tal cual: el trueno no se redirige al idioma", async () => {
  const envOk = `export const SUPABASE_URL = "https://test-project.supabase.co";
export const SUPABASE_ANON_KEY = "public-test-key-not-a-real-secret";
export const isSupabaseConfigured = true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;`;
  const i18n = await import(import.meta.resolve("../src/i18n/config.ts"));
  const proxySource = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  const compiledProxy = ts.transpileModule(proxySource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
    .replace('"@/i18n/config"', JSON.stringify(dataUrl(
      `export const LOCALE_COOKIE = ${JSON.stringify(i18n.LOCALE_COOKIE)};
       export const defaultLocale = "es";
       export const isLocale = (v) => v === "es" || v === "en";
       export const detectLocale = () => "es";`)))
    .replace('"@/lib/supabase/env"', JSON.stringify(dataUrl(
      `export const CONFIGURATION_UNAVAILABLE = false;`)))
    .replace('"@/lib/supabase/proxy-client"', JSON.stringify(dataUrl(
      `export const updateSession = async (request, response) => response;`)))
    .replace('"next/server"', JSON.stringify(import.meta.resolve("next/server.js")));
  const { default: proxy } = await import(dataUrl(compiledProxy));

  for (const path of ["/sounds/trueno.mp3", "/brand/emblema-strong.webp", "/sw.js", "/icon.svg"]) {
    const response = await proxy(new NextRequest(`https://strong-gym.example${path}`));
    assert.notStrictEqual(response.status, 307, `${path} terminó redirigido`);
    assert.notStrictEqual(response.status, 308, `${path} terminó redirigido`);
    assert.ok(!response.headers.get("location"), `${path} terminó redirigido`);
  }

  // Y una pantalla normal sí sigue yendo al idioma.
  const page = await proxy(new NextRequest("https://strong-gym.example/panel"));
  assert.match(page.headers.get("location") ?? "", /\/es\/panel$/);

  // El matcher del proxy tampoco se mete con el audio.
  const matcher = proxySource.match(/"\/\(\(\?!_next\/static[^"]+"/)?.[0] ?? "";
  assert.ok(matcher.includes("mp3"), "el matcher no excluye el audio");
});
