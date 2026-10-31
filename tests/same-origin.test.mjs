import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { sameOrigin } from "../src/lib/security/same-origin.ts";

const apiRoot = new URL("../src/app/api/", import.meta.url).pathname;

function request(headers, url = "https://strong.test/api/x") {
  return new Request(url, { method: "POST", headers });
}

test("origen: rechaza el pedido cruzado aunque no venga origin", () => {
  assert.equal(sameOrigin(request({ "sec-fetch-site": "cross-site" })), false);
});

test("origen: acepta el pedido del mismo sitio", () => {
  assert.equal(
    sameOrigin(
      request({
        origin: "https://strong.test",
        "sec-fetch-site": "same-origin",
      }),
    ),
    true,
  );
});

test("origen: acepta cuando el pedido no trae encabezados de navegador", () => {
  assert.equal(sameOrigin(request({})), true);
});

test("origen: rechaza un origin de otro sitio", () => {
  assert.equal(
    sameOrigin(request({ origin: "https://sitio-ajeno.test" })),
    false,
  );
});

test("origen: rechaza un origin que no es una URL válida", () => {
  assert.equal(sameOrigin(request({ origin: "no-es-una-url" })), false);
});

test("origen: acepta si el host del proxy coincide aunque cambie la URL interna", () => {
  // Caso real detrás del proxy de despliegue: el pedido llega con otra URL
  // interna pero el encabezado `host` es el dominio público.
  assert.equal(
    sameOrigin(
      request(
        { origin: "https://strong-gym-gamma.vercel.app", host: "strong-gym-gamma.vercel.app" },
        "http://10.0.0.5:3000/api/x",
      ),
    ),
    true,
  );
});

/* Guardián: ninguna ruta que escriba puede quedar sin el guardia de origen, y
   nadie puede volver a definir su propia copia de `sameOrigin`. */
function routeFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full));
    else if (entry === "route.ts") found.push(full);
  }
  return found;
}

// Única excepción: el endpoint retirado responde 410 y no escribe nada.
const allowlist = new Set(["admin/reset/route.ts"]);

test("rutas: toda ruta que escribe usa el guardia de origen compartido", () => {
  const writes = /export async function (POST|PUT|PATCH|DELETE)\b/;
  const missing = routeFiles(apiRoot)
    .filter((file) => writes.test(readFileSync(file, "utf8")))
    .filter((file) => !allowlist.has(relative(apiRoot, file)))
    .filter((file) => !readFileSync(file, "utf8").includes("sameOrigin("))
    .map((file) => relative(apiRoot, file));

  assert.deepEqual(missing, []);
});

test("rutas: nadie define una copia local de sameOrigin", () => {
  const copies = routeFiles(apiRoot)
    .filter((file) => /function sameOrigin\s*\(/.test(readFileSync(file, "utf8")))
    .map((file) => relative(apiRoot, file));

  assert.deepEqual(copies, []);
});
