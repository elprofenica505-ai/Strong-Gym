import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

// Compila los componentes reales; sólo sustituye fronteras externas de Next/datos/contexto.
// No requiere claves, navegador ni servidor de producción.
function loader(overrides = {}) {
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    }).outputText.replace(/from "([^"]+)"/g, (_, name) => {
      if (name in overrides) return `from ${JSON.stringify(dataUrl(overrides[name]))}`;
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
        const file = [base + ".ts", base + ".tsx", base + "/index.ts"].find(existsSync);
        if (!file) throw new Error(`No se pudo resolver ${name}`);
        return `from ${JSON.stringify(load(file))}`;
      }
      return `from ${JSON.stringify(import.meta.resolve(name.startsWith("next/") ? name + ".js" : name))}`;
    });
    const url = dataUrl(compiled);
    modules.set(path, url);
    return url;
  }
  return async (path) => import(load(resolve(root, path)));
}

const dict = (await loader()("i18n/dictionaries/es.ts")).default;
const dictionary = `export const useDictionary = () => ({ locale: "es", dict: ${JSON.stringify(dict)} });`;
const navigation = `export const usePathname = () => "/es/panel";
export function redirect(path) { throw new Error("REDIRECT:" + path); }
export function notFound() { throw new Error("NOT_FOUND"); }`;
const baseUser = {
  id: "00000000-0000-4000-8000-000000000001", email: "test@example.com", fullName: "Admin de prueba",
  role: "admin", mfa: "ok", profileStatus: "ready", isDemo: false,
};

function context(user) {
  return {
    "@/components/providers/dictionary-provider": dictionary,
    "next/navigation": navigation,
    "@/lib/supabase/env": "export const isSupabaseConfigured = true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
    "@/lib/data/queries": `
      export const getCurrentUser = async () => (${JSON.stringify(user)});
      export const countMembers = async () => 0;
      export const getAllBookings = async () => [];
      export const getClasses = async () => [];
      export const getContactMessages = async () => [];
      export const getSessionsForWeek = async () => ({ sessions: [] });`,
    "@/components/providers/app-provider": `export const useApp = () => ({ user: ${JSON.stringify(user)}, hydrated: true, signOut() {}, toast() {} });`,
  };
}

for (const role of ["admin", "staff"]) {
  test(`render real ${role}: tarjetas de caja/herramientas y enlace Panel en el menú móvil`, async () => {
    const load = loader(context({ ...baseUser, role }));
    const { default: Page } = await load("app/[locale]/panel/page.tsx");
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "es" }) }));
    assert.ok(html.includes("Caja y cuentas"));
    assert.ok(html.includes("Herramientas"));
    assert.ok(html.includes('href="/es/panel/caja"'));
    assert.ok(html.includes('href="/es/panel/herramientas"'));
    assert.ok(!html.includes(dict.admin.noAccess));
    const { SideNav } = await load("components/layout/side-nav.tsx");
    const menu = renderToStaticMarkup(createElement(SideNav, { open: true, onClose() {} }));
    assert.ok(menu.includes('href="/es/panel"'));
    assert.ok(menu.includes(dict.nav.admin));
  });
}

test("render real member: denegado y sin Panel en el menú", async () => {
  const load = loader(context({ ...baseUser, role: "member" }));
  const { default: Page } = await load("app/[locale]/panel/page.tsx");
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "es" }) }));
  assert.ok(html.includes(dict.admin.noAccess));
  assert.ok(!html.includes("Caja y cuentas"));
  const { SideNav } = await load("components/layout/side-nav.tsx");
  const menu = renderToStaticMarkup(createElement(SideNav, { open: true, onClose() {} }));
  assert.ok(!menu.includes('href="/es/panel"'));
});

test("perfil con error: diagnóstico, no falsa denegación ni tarjetas privadas", async () => {
  const { default: Page } = await loader(context({ ...baseUser, role: null, profileStatus: "error" }))("app/[locale]/panel/page.tsx");
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "es" }) }));
  assert.ok(html.includes("No pudimos verificar tu perfil"));
  assert.ok(html.includes(baseUser.id));
  assert.ok(!html.includes(dict.admin.noAccess));
  assert.ok(!html.includes("Caja y cuentas"));
});

test("sin sesión: /panel redirige a ingresar", async () => {
  const { default: Page } = await loader(context(null))("app/[locale]/panel/page.tsx");
  await assert.rejects(Page({ params: Promise.resolve({ locale: "es" }) }), /REDIRECT:\/es\/ingresar/);
});

for (const locale of ["es", "en"]) {
  test(`/${locale}/admin redirige al panel con su guard`, async () => {
    const { default: Page } = await loader({ "next/navigation": navigation })("app/[locale]/admin/page.tsx");
    await assert.rejects(Page({ params: Promise.resolve({ locale }) }), new RegExp(`REDIRECT:/${locale}/panel`));
  });
}
