import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";
const connected = createLoader({
  "server-only": "export {};",
  "@/lib/supabase/env": "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
  "@/lib/data/queries": `
 export const getCurrentUser=async()=>globalThis.__dataUser;
 export const getMyBookings=async()=>globalThis.__dataRead();
 export const getMyAssignedPlan=async()=>globalThis.__dataRead();
 export const getClasses=async()=>globalThis.__dataRead();
 export const getPlans=async()=>globalThis.__dataRead();
 export const getAllBookings=async()=>globalThis.__dataRead();
 export const getContactMessages=async()=>globalThis.__dataRead();
 export const countMembers=async()=>globalThis.__dataRead();
 export const getBookedSessionIds=async()=>globalThis.__dataIds();
 export const getSessionsForWeek=async()=>globalThis.__dataWeek();`,
  "@/lib/supabase/server":
    "export const getSupabaseServerClient=async()=>globalThis.__dataDb();",
  "next/navigation":
    'export const useRouter=()=>({}); export function redirect(path){throw new Error("REDIRECT:"+path)}',
});
const user = { id: "test-user", role: "admin", profileStatus: "ready" };
const request = (name) =>
  new Request(`https://strong.test/api/${name}`, {
    method: name === "account" ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      name === "contact"
        ? {
            name: "Nombre de prueba",
            email: "example@example.com",
            message: "Mensaje ficticio para prueba",
          }
        : name === "newsletter"
          ? { email: "example@example.com" }
          : { fullName: "Nombre de prueba" },
    ),
  });
for (const name of ["contact", "newsletter", "account"]) {
  const method = name === "account" ? "PATCH" : "POST";
  test(`${name}: no configurado devuelve 503, no éxito demo`, async () => {
    const api = await createLoader({
      "@/lib/supabase/env": "export const isSupabaseConfigured=false;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=true;",
      "@/lib/supabase/server":
        "export const getSupabaseServerClient=async()=>null;",
      "@/lib/data/queries": "export const getCurrentUser=async()=>null;",
    })(`app/api/${name}/route.ts`);
    const res = await api[method](request(name));
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "DEMO");
  });
  for (const failure of ["null", "throw", "sql"]) {
    test(`${name}: fallo conectado ${failure} no responde éxito ni filtra detalles`, async () => {
      globalThis.__dataUser = user;
      globalThis.__dataDb = () => {
        if (failure === "null") return null;
        if (failure === "throw") throw Error("SECRET");
        const chain = {};
        for (const f of [
          "insert",
          "upsert",
          "update",
          "eq",
          "select",
          "single",
        ])
          chain[f] = () => chain;
        chain.then = (resolve) =>
          resolve({ error: { code: "42501", message: "SECRET" } });
        return { from: () => chain };
      };
      const api = await connected(`app/api/${name}/route.ts`);
      const res = await api[method](request(name));
      assert.ok(res.status >= 500);
      const body = await res.text();
      assert.ok(!body.includes('"ok":true'));
      assert.ok(!body.includes("SECRET"));
    });
  }
  test(`${name}: escritura confirmada devuelve éxito`, async () => {
    globalThis.__dataUser = user;
    const chain = {};
    for (const f of ["insert", "upsert", "update", "eq", "select", "single"])
      chain[f] = () => chain;
    chain.then = (resolve) => resolve({ data: { id: "saved" }, error: null });
    globalThis.__dataDb = () => ({ from: () => chain });
    const api = await connected(`app/api/${name}/route.ts`);
    const res = await api[method](request(name));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });
}
for (const name of ["bookings", "sessions"]) {
  test(`${name}: fallo de lectura devuelve 503 y no-cache`, async () => {
    globalThis.__dataUser = user;
    globalThis.__dataRead = globalThis.__dataWeek = () => {
      throw Error("SECRET");
    };
    const api = await connected(`app/api/${name}/route.ts`);
    const res = await api.GET(new Request(`https://strong.test/api/${name}`));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.ok(!(await res.text()).includes("SECRET"));
  });
}
test("bookings: sesión ausente no se presenta como lista vacía válida", async () => {
  globalThis.__dataUser = null;
  const api = await connected("app/api/bookings/route.ts");
  assert.equal((await api.GET()).status, 401);
});
test("sessions: lectura correcta sin sesiones es 200 vacío real", async () => {
  globalThis.__dataUser = null;
  globalThis.__dataWeek = () => ({
    week: { key: "2026-W42", start: new Date(), end: new Date() },
    sessions: [],
  });
  const api = await connected("app/api/sessions/route.ts");
  const res = await api.GET(new Request("https://strong.test/api/sessions"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).sessions, []);
});
test("sessions: fallo de reservas del usuario no se presenta como ninguna reserva", async () => {
  globalThis.__dataUser = user;
  globalThis.__dataIds = () => {
    throw Error("SECRET");
  };
  const api = await connected("app/api/sessions/route.ts");
  assert.equal(
    (await api.GET(new Request("https://strong.test/api/sessions"))).status,
    503,
  );
});
for (const page of ["panel", "mi-cuenta", "horarios"]) {
  test(`${page}: error SSR tiene reintento y no panel/métricas vacías`, async () => {
    globalThis.__dataUser = user;
    globalThis.__dataRead = globalThis.__dataWeek = () => {
      throw Error("SECRET");
    };
    const { default: Page } = await connected(`app/[locale]/${page}/page.tsx`);
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ locale: "es" }),
        searchParams: Promise.resolve({}),
      }),
    );
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes("Reintentar consulta"));
    assert.ok(!html.includes("SECRET"));
    assert.ok(!html.includes("application/ld+json"));
  });
}
