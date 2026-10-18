/** Verifica metadatos/imagenes y cierre seguro del build sin configurar por HTTP.
 * Requiere build con Supabase sin configurar (como CI). Servidor efímero, cerrado al terminar.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createLoader } from "../tests/helpers/react-loader.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.NODE_ENV = "production";
const { getSiteUrl } = await createLoader()("config/site.ts");
const canonicalOrigin = new URL(getSiteUrl()).origin;
const preview = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
const imageOrigin =
  process.env.VERCEL_ENV === "preview" && preview
    ? new URL(`https://${preview}`).origin
    : canonicalOrigin;
const child = spawn(
  process.execPath,
  [
    join(root, "node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    "0",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
const ready = new Promise((res, rej) => {
  const timer = setTimeout(
    () => rej(Error("El servidor de prueba no inició a tiempo")),
    30000,
  );
  const output = (chunk) => {
    logs += chunk.toString();
    const port = logs.match(/http:\/\/localhost:(\d+)/)?.[1];
    if (port && /Ready in/.test(logs)) {
      clearTimeout(timer);
      res(`http://127.0.0.1:${port}`);
    }
  };
  child.stdout.on("data", output);
  child.stderr.on("data", output);
  child.once("error", (error) => {
    clearTimeout(timer);
    rej(error);
  });
  child.once("exit", (code) => {
    clearTimeout(timer);
    rej(Error(`El servidor terminó (${code})`));
  });
});
try {
  const local = await ready;
  const fetchLocal = (path) =>
    fetch(`${local}${path}`, {
      headers: { "User-Agent": "Twitterbot/1.0", "Accept-Language": "es-NI" },
      signal: AbortSignal.timeout(20000),
    });
  for (const locale of ["es", "en"]) {
    const response = await fetchLocal(`/${locale}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Servicio temporalmente no disponible|Service temporarily unavailable/);
    assert.doesNotMatch(html, /admin123|demo-admin|strong-gym:demo-users/);
    const dom = new JSDOM(html);
    try {
      const doc = dom.window.document;
      assert.equal(doc.documentElement.lang, locale);
      const canonical = doc.querySelector('link[rel="canonical"]')?.href;
      assert.equal(canonical, `${canonicalOrigin}/${locale}`);
      for (const selector of [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
      ]) {
        const value = doc.querySelector(selector)?.getAttribute("content");
        assert.ok(value, `${locale}: falta ${selector}`);
        const image = new URL(value);
        assert.equal(image.origin, imageOrigin);
        assert.equal(image.pathname, `/${locale}/opengraph-image`);
        const result = await fetchLocal(`${image.pathname}${image.search}`);
        assert.equal(result.status, 200);
        assert.match(result.headers.get("content-type"), /^image\/png/);
        const bytes = Buffer.from(await result.arrayBuffer());
        assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(bytes.readUInt32BE(16), 1200);
        assert.equal(bytes.readUInt32BE(20), 630);
      }
      console.log(
        `✅ /${locale}: idioma, canonical y OG/Twitter absolutos; PNG 1200×630 responde 200.`,
      );
    } finally {
      dom.window.close();
    }
  }
  for (const path of ["es", "en"].flatMap(locale =>
    ["ingresar", "registro", "mi-cuenta", "panel", "panel/clientes", "panel/caja", "panel/reportes", "horarios"]
      .map(route => `/${locale}/${route}`))) {
    const res=await fetchLocal(path);
    assert.equal(res.status,503,path);
    assert.match(res.headers.get("cache-control"),/no-store/);
    const body=await res.text();
    assert.doesNotMatch(body, /admin123|demo-admin/);
    assert.match(body, path.startsWith("/en/") ? /Service temporarily unavailable/ : /Servicio temporalmente no disponible/);
  }
  for (const path of ["/api/bookings", "/api/admin/clients", "/api/admin/finance", "/api/admin/debts", "/api/account", "/api/contact", "/api/newsletter"]) {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      const res=await fetch(`${local}${path}`, {method, signal:AbortSignal.timeout(20000)});
      assert.equal(res.status,503,`${method} ${path}`);
      assert.match(res.headers.get("cache-control"),/no-store/);
      assert.equal((await res.json()).error,"CONFIGURATION_UNAVAILABLE");
    }
  }
  console.log("✅ Producción sin configuración: ingreso/panel/caja/reservas y API GET/POST/PATCH/DELETE bloqueados con 503, sin credenciales ni demo.");
  const oldImage = await fetchLocal("/opengraph-image");
  assert.equal(oldImage.status, 200);
  assert.match(oldImage.headers.get("content-type"), /^image\/png/);
  console.log(
    "✅ Enlace anterior /opengraph-image sigue funcionando mediante redirección por idioma.",
  );
  const missing = await fetchLocal("/es/esta-pagina-no-existe");
  assert.equal(missing.status, 503);
  await missing.text();
  assert.doesNotMatch(logs, /metadataBase property .*not set/);
  console.log(
    "✅ Sin configuración, rutas no públicas devuelven 503; sin advertencia de metadataBase en las solicitudes.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
}
