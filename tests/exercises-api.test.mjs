import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * Las dos rutas de la biblioteca (EX-01): `/api/exercises/image` y
 * `/api/exercises/routine`.
 *
 * La imagen se sirve por acá y no enlazada al origen, así que la ruta es la que
 * tiene que impedir que alguien pida un archivo cualquiera del servidor. Y la
 * rutina se guarda siempre a nombre del cliente de la sesión: la ruta sólo
 * valida la forma, nunca acepta un `client_id` del navegador.
 */

const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

const loadRoute = (path, modules) => {
  const source = readFileSync(new URL(`../src/app/api/exercises/${path}`, import.meta.url), "utf8");
  const code = ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/from "([^"]+)"/g, (_, name) => {
      assert.ok(modules[name], `la ruta importa ${name} y la prueba no lo cubre`);
      return `from ${JSON.stringify(modules[name])}`;
    });
  return import(dataUrl(code));
};

// ---------------------------------------------------------------- imágenes
const imageModules = {
  "next/server": import.meta.resolve("next/server.js"),
  sharp: import.meta.resolve("sharp"),
  "@/lib/data/queries": dataUrl("export const getCurrentUser = async () => globalThis.__img.user;"),
  // Las medidas viven en `figure.ts`; acá alcanza con los números exactos.
  "@/lib/exercises/figure": dataUrl(
    "export const FIGURE_WIDTHS = { card: 320, cardBig: 640, detail: 640, full: 960 };",
  ),
};
const { GET: imageGET } = await loadRoute("image/route.ts", imageModules);

const imageRequest = (path, ancho) =>
  new Request(
    `https://gym.example/api/exercises/image?path=${encodeURIComponent(path)}` +
      (ancho === undefined ? "" : `&w=${ancho}`),
  );

const withImage = async ({ user = { id: "u1" }, fetchImpl, path, ancho }) => {
  globalThis.__img = { user };
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await imageGET(imageRequest(path, ancho));
  } finally {
    globalThis.fetch = original;
  }
};

const webp = (bytes = 128) => new Response(new Uint8Array(bytes), { status: 200 });

test("la imagen no se sirve sin sesión", async () => {
  const response = await withImage({
    user: null,
    path: "images/flat/leg-press-start.webp",
    fetchImpl: async () => {
      throw new Error("no debería pedir el archivo sin sesión");
    },
  });
  assert.equal(response.status, 404);
});

test("sólo se aceptan rutas del catálogo, nunca rutas del servidor ni URLs", async () => {
  const intentos = [
    "../../../etc/passwd",
    "images/flat/../../../.env",
    "https://ejemplo.com/foto.webp",
    "images/flat/LEG-PRESS.webp",
    "images/flat/leg-press.png",
    "images/other/leg-press.webp",
    "",
  ];
  for (const path of intentos) {
    const response = await withImage({
      path,
      fetchImpl: async () => {
        throw new Error(`no debería pedir ${path}`);
      },
    });
    assert.equal(response.status, 404, `la ruta aceptó «${path}»`);
  }
});

test("una imagen válida se sirve como WebP, cacheada y sin adivinar el tipo", async () => {
  const pedidas = [];
  const response = await withImage({
    path: "images/flat/leg-press-start.webp",
    fetchImpl: async (url) => {
      pedidas.push(url);
      return webp();
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("cache-control") ?? "", /max-age=2592000/);
  assert.equal((await response.arrayBuffer()).byteLength, 128);
  assert.match(pedidas[0], /RepDB\/exercise-dataset.*images\/flat\/leg-press-start\.webp$/);
});

test("si el primer origen falla se prueba el segundo", async () => {
  const pedidas = [];
  const response = await withImage({
    path: "images/flat/leg-press-start.webp",
    fetchImpl: async (url) => {
      pedidas.push(url);
      return pedidas.length === 1 ? new Response("no", { status: 503 }) : webp();
    },
  });
  assert.equal(response.status, 200);
  assert.equal(pedidas.length, 2);
});

test("si ningún origen tiene la imagen, o viene vacía, la pantalla no se rompe", async () => {
  for (const fetchImpl of [
    async () => new Response("no", { status: 404 }),
    async () => webp(0),
    async () => {
      throw new Error("sin red");
    },
  ]) {
    const response = await withImage({ path: "images/flat/leg-press-start.webp", fetchImpl });
    assert.equal(response.status, 404);
  }
});


// ------------------------------------------------- reducción de peso (EX-06)
// Una foto de verdad, generada acá con el mismo procesador del servidor: se
// comprueba que el proxy entrega una imagen más chica y en WebP, no el archivo
// original de 850 px que hacía lenta la biblioteca.
const { default: sharp } = await import("sharp");
const fotoGrande = await sharp({
  create: { width: 850, height: 567, channels: 3, background: { r: 180, g: 30, b: 40 } },
})
  .jpeg({ quality: 90 })
  .toBuffer();

const conFoto = async (ancho) =>
  withImage({
    path: "Barbell_Squat/0.jpg",
    ancho,
    fetchImpl: async () => new Response(new Uint8Array(fotoGrande), { status: 200 }),
  });

test("la foto se entrega reducida y en WebP, no el original de 850 px", async () => {
  const response = await conFoto(320);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  const cuerpo = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(cuerpo).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(meta.width <= 320, `salió a ${meta.width} px`);
  assert.ok(
    cuerpo.length < fotoGrande.length,
    `no se achicó: ${cuerpo.length} vs ${fotoGrande.length} bytes`,
  );
});

test("cada medida se sirve en su propio ancho y sigue cacheada 30 días", async () => {
  for (const ancho of [320, 640]) {
    const response = await conFoto(ancho);
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(meta.width, ancho);
    assert.match(response.headers.get("cache-control") ?? "", /max-age=2592000, immutable/);
  }
});

test("una medida inventada no se atiende: cae en la chica", async () => {
  for (const ancho of [5000, 1, 0, -320, Number.NaN]) {
    const response = await conFoto(ancho);
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(meta.width, 320, `aceptó w=${ancho}`);
  }
});

test("si la reducción falla se entrega el original: la pantalla no se rompe", async () => {
  const response = await withImage({
    path: "Barbell_Squat/0.jpg",
    ancho: 320,
    fetchImpl: async () => new Response(new Uint8Array(64), { status: 200 }), // no es una imagen
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal((await response.arrayBuffer()).byteLength, 64);
});

test("las fotos del segundo catálogo se sirven como JPEG desde su origen", async () => {
  const pedidas = [];
  const response = await withImage({
    path: "Barbell_Squat/1.jpg",
    fetchImpl: async (url) => {
      pedidas.push(url);
      return new Response(new Uint8Array(64), { status: 200 });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.match(pedidas[0], /free-exercise-db.*exercises\/Barbell_Squat\/1\.jpg$/);
});

test("una foto con forma rara no se pide al origen", async () => {
  for (const path of [
    "Barbell_Squat/2.jpg",
    "Barbell_Squat/0.png",
    "../Barbell_Squat/0.jpg",
    "Barbell_Squat/../0.jpg",
    "exercises/Barbell_Squat/0.jpg",
    "/etc/passwd/0.jpg",
  ]) {
    const response = await withImage({
      path,
      fetchImpl: async () => {
        throw new Error(`no debería pedir ${path}`);
      },
    });
    assert.equal(response.status, 404, `la ruta aceptó «${path}»`);
  }
});

// ------------------------------------------------------------------ rutina
const routineCalls = [];
const routineModules = {
  "next/server": import.meta.resolve("next/server.js"),
  zod: import.meta.resolve("zod"),
  "@/lib/data/queries": dataUrl("export const getCurrentUser = async () => globalThis.__rt.user;"),
  "@/lib/security/same-origin": dataUrl("export const sameOrigin = () => globalThis.__rt.sameOrigin;"),
  "@/lib/exercises/queries": dataUrl(`
    export const saveRoutineItem = async (input) => {
      globalThis.__rt.calls.push({ kind: "save", input });
      return globalThis.__rt.result;
    };
    export const removeRoutineItem = async (exerciseId) => {
      globalThis.__rt.calls.push({ kind: "remove", exerciseId });
      return globalThis.__rt.result;
    };
  `),
};
const { POST: routinePOST } = await loadRoute("routine/route.ts", routineModules);

const post = async (body, overrides = {}) => {
  globalThis.__rt = {
    user: { id: "u1", role: "client" },
    sameOrigin: true,
    result: { ok: true },
    calls: routineCalls,
    ...overrides,
  };
  globalThis.__rt.calls.length = 0;
  return routinePOST(
    new Request("https://gym.example/api/exercises/routine", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://gym.example" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
};

test("la rutina no se toca desde otro sitio", async () => {
  const response = await post({ action: "remove", exerciseId: "leg-press" }, { sameOrigin: false });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ORIGIN");
  assert.equal(globalThis.__rt.calls.length, 0);
});

test("sin sesión no se guarda nada", async () => {
  const response = await post({ action: "remove", exerciseId: "leg-press" }, { user: null });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "AUTH");
  assert.equal(globalThis.__rt.calls.length, 0);
});

test("un pedido mal formado se rechaza antes de llegar a la base", async () => {
  const invalidos = [
    { action: "save", exerciseId: "" },
    { action: "save", exerciseId: "leg-press", sets: 0 },
    { action: "save", exerciseId: "leg-press", sets: 21 },
    { action: "save", exerciseId: "leg-press", restSeconds: 901 },
    { action: "save", exerciseId: "leg-press", note: "x".repeat(201) },
    { action: "borrar", exerciseId: "leg-press" },
    { action: "save", exerciseId: "leg-press", clientId: "otro" },
    "no es json",
  ];
  for (const body of invalidos) {
    const response = await post(body);
    assert.equal(response.status, 422, `aceptó ${JSON.stringify(body).slice(0, 60)}`);
    assert.equal((await response.json()).code, "INVALID");
  }
  assert.equal(globalThis.__rt.calls.length, 0);
});

test("guardar pasa la dosis y deja que la base resuelva al cliente", async () => {
  const response = await post({
    action: "save",
    exerciseId: "leg-press",
    sets: 4,
    reps: "12",
    restSeconds: 90,
    note: "Pesado",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    saved: true,
    exerciseId: "leg-press",
  });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(globalThis.__rt.calls[0], {
    kind: "save",
    input: { exerciseId: "leg-press", sets: 4, reps: "12", restSeconds: 90, note: "Pesado" },
  });
});

test("guardar sin dosis manda nulos, no ceros inventados", async () => {
  await post({ action: "save", exerciseId: "leg-press" });
  assert.deepEqual(globalThis.__rt.calls[0].input, {
    exerciseId: "leg-press",
    sets: null,
    reps: null,
    restSeconds: null,
    note: null,
  });
});

test("quitar un ejercicio responde y avisa que ya no está guardado", async () => {
  const response = await post({ action: "remove", exerciseId: "leg-press" });
  assert.deepEqual(await response.json(), {
    ok: true,
    saved: false,
    exerciseId: "leg-press",
  });
  assert.deepEqual(globalThis.__rt.calls[0], { kind: "remove", exerciseId: "leg-press" });
});

test("cada error de la base llega con su mensaje y su código de estado", async () => {
  const casos = [
    ["NO_CLIENT", 409],
    ["NOT_FOUND", 404],
    ["AUTH", 403],
    ["INVALID", 422],
  ];
  for (const [code, status] of casos) {
    const response = await post(
      { action: "save", exerciseId: "leg-press" },
      { result: { ok: false, code } },
    );
    const body = await response.json();
    assert.equal(response.status, status, `${code} debería responder ${status}`);
    assert.equal(body.code, code);
    assert.ok(body.message && body.message.length > 10, `${code} sin mensaje claro`);
  }

  const raro = await post(
    { action: "save", exerciseId: "leg-press" },
    { result: { ok: false, code: "PGRST202" } },
  );
  assert.equal(raro.status, 503);
  assert.equal((await raro.json()).code, "UNKNOWN");
});
