import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * `/api/admin/plans` — catálogo de planes y uso de un plan (00086).
 *
 * La misma ruta sirve las dos cosas porque es la misma pantalla y el mismo
 * permiso. Lo que se cuida acá: solo administración con segundo factor, un
 * fallo de lectura nunca se convierte en «nadie tiene el plan» y el id que
 * llega por la URL no se pasa crudo a la base sin límite.
 */

const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

/**
 * Compila un archivo del proyecto resolviendo sus imports locales por el mapa.
 * Se hace acá (y no solo con el transpilador) porque `usage.ts` importa
 * `format-money`, y un módulo cargado por URL no resuelve el alias `@/`.
 */
function compile(relative, map) {
  const file = new URL(`../src/${relative}`, import.meta.url);
  const code = ts
    .transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/from "([^"]+)"/g, (_, name) => {
      if (!(name in map)) throw new Error(`Sin resolver: ${name} en ${relative}`);
      return `from ${JSON.stringify(map[name])}`;
    });
  return dataUrl(code);
}

const formatMoneyUrl = compile("lib/finance/format-money.ts", {});
const usageUrl = compile("lib/plans/usage.ts", { "@/lib/finance/format-money": formatMoneyUrl });

const source = readFileSync(new URL("../src/app/api/admin/plans/route.ts", import.meta.url), "utf8");
const modules = {
  "next/server": import.meta.resolve("next/server.js"),
  zod: import.meta.resolve("zod"),
  "@/lib/auth/current-user": new URL("../src/lib/auth/current-user.ts", import.meta.url).href,
  "@/lib/data/queries": dataUrl(`
    export const getCurrentUser = async () => globalThis.__plans.user;
  `),
  "@/lib/supabase/server": dataUrl(`
    export const getSupabaseServerClient = async () => globalThis.__plans.client;
  `),
  "@/lib/security/same-origin": dataUrl(`
    export const sameOrigin = () => true;
  `),
  "@/lib/plans/usage": usageUrl,
};
const code = ts
  .transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  .outputText.replace(/from "([^"]+)"/g, (_, name) => `from ${JSON.stringify(modules[name])}`);
const { GET } = await import(dataUrl(code));

const USAGE = {
  plan: {
    id: "pln_gimnasio",
    name_es: "Gimnasio mensual",
    access_kind: "gym",
    duration_days: 30,
    validity_currency: "NIO",
    validity_amount: 560,
    price_nio: 560,
    is_active: true,
  },
  today: "2026-10-31",
  people: [
    {
      clientId: "ddbac9c0-04f4-47ef-9080-cbeea63b853a",
      name: "Socia de prueba",
      startedOn: "2026-10-28",
      expiresOn: "2026-11-26",
      daysLeft: 27,
      pricePaid: 560,
      currency: "NIO",
      state: "active",
    },
  ],
  history: [],
};

function reset(overrides = {}) {
  globalThis.__plans = {
    user: { id: "admin", role: "admin", mfa: "ok" },
    calls: [],
    data: USAGE,
    error: null,
    ...overrides,
  };
  globalThis.__plans.client = {
    rpc: (name, args) => {
      globalThis.__plans.calls.push({ name, args });
      return {
        abortSignal: async () => ({ data: globalThis.__plans.data, error: globalThis.__plans.error }),
      };
    },
  };
}

const call = (query = "") => GET(new Request(`https://gym.example/api/admin/plans${query}`));

test("sin sesión, cliente, entrenador y caja no ven los planes", async () => {
  for (const user of [
    null,
    { id: "socio", role: "member", mfa: "not_required" },
    { id: "profe", role: "trainer", mfa: "ok" },
    { id: "caja", role: "cashier", mfa: "ok" },
    { id: "admin", role: "admin", mfa: "verify" },
  ]) {
    reset({ user });
    const response = await call("?plan=pln_gimnasio");
    assert.equal(response.status, 403);
    assert.deepEqual(globalThis.__plans.calls, []);
  }
});

test("con ?plan= devuelve quiénes lo tienen, ya validado", async () => {
  reset();
  const response = await call("?plan=pln_gimnasio");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.usage.people.length, 1);
  assert.equal(body.usage.people[0].name, "Socia de prueba");
  assert.deepEqual(globalThis.__plans.calls, [
    { name: "admin_plan_usage", args: { p_plan: "pln_gimnasio" } },
  ]);
});

test("sin ?plan= devuelve el catálogo completo", async () => {
  reset({ data: { plans: [], classes: [] } });
  const response = await call();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { plans: [], classes: [] });
  assert.equal(globalThis.__plans.calls[0].name, "admin_plans_catalog");
});

test("si la base falla, la ruta lo dice y no devuelve una lista vacía", async () => {
  reset({ data: null, error: { code: "XX000", message: "boom" } });
  const response = await call("?plan=pln_gimnasio");
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, "UNKNOWN");
  assert.match(body.message, /No pudimos leer quiénes tienen este plan/);
});

test("si llega algo con otra forma, no se dibuja una lista vacía", async () => {
  reset({ data: { algo: "raro" } });
  const response = await call("?plan=pln_gimnasio");
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, "UNCONFIRMED");
  assert.doesNotMatch(body.message, /nadie/i);
});

test("un identificador absurdo se corta antes de consultar", async () => {
  reset();
  const response = await call(`?plan=${"x".repeat(200)}`);
  assert.equal(response.status, 404);
  assert.deepEqual(globalThis.__plans.calls, []);
});
