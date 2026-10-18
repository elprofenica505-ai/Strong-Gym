import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";
const { crmRequest } = await createLoader()("lib/crm/request.ts");
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
function hangingFetch(_url, { signal }) {
  return new Promise((_, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
}
test("GET tiene timeout de 15s y no reintenta ni inventa éxito", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  globalThis.fetch = (...args) => {
    calls++;
    return hangingFetch(...args);
  };
  const promise = crmRequest("/api/admin/clients?id=test");
  t.mock.timers.tick(15001);
  await assert.rejects(promise, /La lectura tardó demasiado/);
  assert.equal(calls, 1);
});
test("POST tiene timeout de 30s y advierte resultado incierto/misma referencia", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let received;
  globalThis.fetch = (url, init) => {
    received = init;
    return hangingFetch(url, init);
  };
  const promise = crmRequest("/api/admin/clients", {
    action: "payment",
    requestId: "persisted",
  });
  t.mock.timers.tick(30001);
  await assert.rejects(promise, /historial.*misma referencia/);
  assert.equal(JSON.parse(received.body).requestId, "persisted");
});
test("cancelación de lectura se propaga y no genera reintento automático", async () => {
  globalThis.fetch = hangingFetch;
  const abort = new AbortController();
  const promise = crmRequest("/api/admin/clients", undefined, abort.signal);
  abort.abort();
  await assert.rejects(promise, { name: "AbortError" });
});
test("JSON inválido y código no seguro no se filtran como datos válidos", async () => {
  globalThis.fetch = async () =>
    new Response("<html>error</html>", { status: 502 });
  await assert.rejects(crmRequest("/api/admin/clients"), /respuesta válida/);
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: "Error controlado",
        code: "private-client-email@test",
      }),
      { status: 503 },
    );
  await assert.rejects(crmRequest("/api/admin/clients"), {
    message: "Error controlado",
  });
});
test("éxito usa no-store; errores de red se traducen sin afirmar desconexión total", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.cache, "no-store");
    return new Response(JSON.stringify({ ok: true }));
  };
  assert.deepEqual(await crmRequest("/api/admin/clients"), { ok: true });
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    crmRequest("/api/admin/clients"),
    /No se pudo obtener la lectura/,
  );
});
