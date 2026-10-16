import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function worker(fetch) {
  const handlers = {};
  const writes = [];
  const matches = [];
  const cache = {
    put: async (request) => { writes.push(request.url); },
    match: async (request) => {
      matches.push(request);
      // Sólo el fallback offline está disponible; nunca una página privada.
      if (request === "/es/offline") return new Response("Sin conexión");
      return undefined;
    },
  };
  vm.runInNewContext(source, {
    self: { location: { origin: "https://gym.example" }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => cache }, fetch, URL, Response,
  });
  return { handlers, writes, matches };
}

for (const path of ["/es/panel", "/es/mi-cuenta", "/es"]) {
  test(`SW no guarda HTML personalizado de ${path}`, async () => {
    const { handlers, writes } = worker(async () => new Response("HTML con sesión"));
    let response;
    handlers.fetch({ request: { method: "GET", mode: "navigate", url: `https://gym.example${path}` }, respondWith: (value) => { response = value; } });
    assert.equal(await (await response).text(), "HTML con sesión");
    assert.deepEqual(writes, []);
  });
}

test("SW sin red: no consulta una denegación/sesión vieja del panel", async () => {
  const { handlers, matches } = worker(async () => { throw new Error("offline"); });
  let response;
  handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://gym.example/es/panel", headers: new Headers() }, respondWith: (value) => { response = value; } });
  assert.equal(await (await response).text(), "Sin conexión");
  assert.deepEqual(matches, ["/es/offline"]);
});

test("SW no intercepta API ni RSC/prefetch", () => {
  const { handlers } = worker(() => assert.fail("no debería hacer fetch desde el SW"));
  for (const path of ["/api/account", "/es/panel?_rsc=test"]) {
    handlers.fetch({ request: { method: "GET", mode: "cors", url: `https://gym.example${path}` }, respondWith: () => assert.fail("no interceptar") });
  }
});
