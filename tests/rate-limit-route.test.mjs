import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLoader } from "./helpers/react-loader.mjs";
import { rateLimitStub } from "./helpers/rate-limit-stub.mjs";

/**
 * El límite, visto desde afuera (SEG-07).
 *
 * Lo que ve una persona que se pasa: **429 con los segundos que faltan**, y un
 * aviso en la pantalla con ese número — no un «error» genérico que no dice
 * nada. Y lo importante: un fallo de la base no deja a nadie sin poder enviar.
 */

const load = (path) =>
  createLoader({
    "@/lib/security/rate-limit": rateLimitStub,
    "@/lib/supabase/env":
      "export const isSupabaseConfigured=false;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
    "@/lib/supabase/server":
      "export const getSupabaseServerClient=async()=>null;",
    "@/lib/data/queries": "export const getCurrentUser=async()=>null;",
  })(path);

const contact = () => load("app/api/contact/route.ts");
const newsletter = () => load("app/api/newsletter/route.ts");

const body = {
  name: "María Gutiérrez",
  email: "maria@ejemplo.com",
  message: "Quiero saber los horarios de boxeo de la tarde.",
};

const post = (url, payload) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://strong.test" },
    body: JSON.stringify(payload),
  });

test("cuando el límite frena, responde 429 con los segundos para volver", async () => {
  globalThis.__rateLimit = { allowed: false, retryAfterSeconds: 420, source: "shared" };
  try {
    const { POST } = await contact();
    const response = await POST(post("https://strong.test/api/contact", body));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "420");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: "RATE_LIMIT", retryAfterSeconds: 420 });
  } finally {
    globalThis.__rateLimit = null;
  }
});

test("la suscripción también avisa cuánto esperar", async () => {
  globalThis.__rateLimit = { allowed: false, retryAfterSeconds: 90, source: "shared" };
  try {
    const { POST } = await newsletter();
    const response = await POST(
      post("https://strong.test/api/newsletter", { email: "maria@ejemplo.com" }),
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "90");
    assert.equal((await response.json()).retryAfterSeconds, 90);
  } finally {
    globalThis.__rateLimit = null;
  }
});

test("si el límite deja pasar, la ruta sigue su camino normal", async () => {
  globalThis.__rateLimit = null;
  const { POST } = await contact();
  const response = await POST(post("https://strong.test/api/contact", body));
  // Sin Supabase conectado la ruta responde 503: lo que importa es que **no**
  // sea 429, o sea, que el límite no se comió el envío.
  assert.notEqual(response.status, 429);
  assert.equal(response.status, 503);
});

test("la pantalla muestra los segundos, no un error genérico", () => {
  const form = readFileSync(new URL("../src/components/sections/contact-form.tsx", import.meta.url), "utf8");
  assert.match(form, /response\.status === 429/);
  assert.match(form, /retryAfterSeconds/);
  assert.match(form, /dict\.contact\.tooFast\.replace\("\{seconds\}"/);

  const newsletter = readFileSync(
    new URL("../src/components/layout/newsletter-form.tsx", import.meta.url),
    "utf8",
  );
  assert.match(newsletter, /response\.status === 429/);
  assert.match(newsletter, /dict\.contact\.tooFast/);

  for (const file of ["es", "en"]) {
    const dict = readFileSync(
      new URL(`../src/i18n/dictionaries/${file}.ts`, import.meta.url),
      "utf8",
    );
    assert.match(dict, /tooFast:/, `falta el aviso en ${file}`);
    assert.match(dict, /\{seconds\}/, `el aviso de ${file} no dice cuánto esperar`);
  }
});
