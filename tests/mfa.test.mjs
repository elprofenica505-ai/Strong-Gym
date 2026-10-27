import { test } from "node:test";
import assert from "node:assert/strict";
import { mfaStateFromLevels, isTotpCode } from "../src/lib/auth/current-user.ts";
import { createLoader } from "./helpers/react-loader.mjs";
const { readMfaState, startTotpEnrollment, verifiedTotpFactorId, verifyTotpCode } = await createLoader({})("lib/auth/mfa-actions.ts");

test("estado MFA: sólo aal2 abre al personal; todo lo demás queda bloqueado", () => {
  assert.equal(mfaStateFromLevels("admin", { currentLevel: "aal2", nextLevel: "aal2" }), "ok");
  assert.equal(mfaStateFromLevels("cashier", { currentLevel: "aal1", nextLevel: "aal2" }), "verify");
  assert.equal(mfaStateFromLevels("admin", { currentLevel: "aal1", nextLevel: "aal1" }), "enroll");
  assert.equal(mfaStateFromLevels("admin", null), "unavailable");
  assert.equal(mfaStateFromLevels("admin", { currentLevel: "aal1", nextLevel: null }), "unavailable");
  assert.equal(mfaStateFromLevels("member", { currentLevel: "aal1", nextLevel: "aal1" }), "not_required");
  assert.equal(mfaStateFromLevels("owner", { currentLevel: "aal2", nextLevel: "aal2" }), "not_required");
});

test("código TOTP: exactamente 6 dígitos", () => {
  assert.equal(isTotpCode("123456"), true);
  for (const bad of ["12345", "1234567", "12a456", " 123456", ""]) assert.equal(isTotpCode(bad), false);
});

function mfaClient(overrides = {}) {
  const calls = [];
  const mfa = {
    getAuthenticatorAssuranceLevel: async () => overrides.aal ?? { data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null },
    listFactors: async () => overrides.list ?? { data: { all: [], totp: [] }, error: null },
    unenroll: async (params) => { calls.push(["unenroll", params.factorId]); return { data: { id: params.factorId }, error: null }; },
    enroll: async (params) => { calls.push(["enroll", params.factorType]); return overrides.enroll ?? { data: { id: "f1", type: "totp", totp: { qr_code: "data:image/svg+xml;utf8,<svg/>", secret: "SECRETO_DE_PRUEBA" } }, error: null }; },
    challenge: async (params) => { calls.push(["challenge", params.factorId]); return { data: { id: "c1" }, error: null }; },
    verify: async (params) => { calls.push(["verify", params.challengeId, params.code]); return overrides.verify ?? { data: {}, error: null }; },
  };
  return { client: { auth: { mfa } }, calls };
}

test("lectura de estado: error o excepción devuelve unavailable", async () => {
  assert.equal(await readMfaState(mfaClient({ aal: { data: null, error: { message: "x" } } }).client, "admin"), "unavailable");
  const throwing = { auth: { mfa: { getAuthenticatorAssuranceLevel: async () => { throw new Error("red"); } } } };
  assert.equal(await readMfaState(throwing, "cashier"), "unavailable");
});

test("registro: elimina intentos sin verificar y devuelve QR/clave; no crea si la lectura falla", async () => {
  const { client, calls } = mfaClient({
    list: { data: { all: [{ id: "old", factor_type: "totp", status: "unverified" }, { id: "ok", factor_type: "totp", status: "verified" }], totp: [] }, error: null },
  });
  const result = await startTotpEnrollment(client);
  assert.deepEqual(calls, [["unenroll", "old"], ["enroll", "totp"]]);
  assert.equal(result.factorId, "f1");
  assert.equal(result.secret, "SECRETO_DE_PRUEBA");
  assert.equal(await startTotpEnrollment(mfaClient({ list: { data: null, error: { message: "x" } } }).client), "unavailable");
});

test("factor verificado: se usa el TOTP verificado o null si no hay", async () => {
  const withFactor = mfaClient({ list: { data: { all: [], totp: [{ id: "v1", status: "verified" }] }, error: null } });
  assert.equal(await verifiedTotpFactorId(withFactor.client), "v1");
  assert.equal(await verifiedTotpFactorId(mfaClient().client), null);
});

test("verificación: sólo con código de 6 dígitos y sin mensajes del proveedor", async () => {
  const { client, calls } = mfaClient();
  assert.deepEqual(await verifyTotpCode(client, "f1", "12345"), { ok: false, error: "code" });
  assert.equal(calls.length, 0);
  assert.deepEqual(await verifyTotpCode(client, "f1", "123456"), { ok: true });
  assert.deepEqual(calls, [["challenge", "f1"], ["verify", "c1", "123456"]]);
  const rejected = mfaClient({ verify: { data: null, error: { message: "EXAMPLE_PROVIDER_SECRET" } } });
  assert.deepEqual(await verifyTotpCode(rejected.client, "f1", "654321"), { ok: false, error: "code" });
});

test("pantalla MFA: primer render sin formulario ni secretos; copy ES/EN", async () => {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MfaSetup } = await createLoader({
    "next/navigation": "export const useRouter=()=>({refresh(){}});",
    "@/lib/supabase/client": "export const getSupabaseBrowserClient=()=>null;",
  })("components/auth/mfa-setup.tsx");
  for (const [locale, title] of [["es", "Verificación en dos pasos"], ["en", "Two-step verification"]]) {
    const html = renderToStaticMarkup(React.createElement(MfaSetup, { locale, role: "admin", initialState: "enroll" }));
    assert.match(html, new RegExp(title));
    assert.doesNotMatch(html, /<form|<input|<img|SECRETO/);
  }
});

test("pantalla MFA: escribir el código no depende de repintar toda la tarjeta y confirmar usa el valor del formulario", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://strong.test/es/mi-cuenta",
  });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "FormData", "HTMLFormElement", "HTMLInputElement"])
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true,
      writable: true,
    });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.self = dom.window;

  const { client, calls } = mfaClient();
  globalThis.__mfaBrowserClient = client;
  globalThis.__mfaRefreshes = 0;
  const React = (await import("react")).default;
  const { render, screen, fireEvent, waitFor, cleanup } = await import("@testing-library/react");
  const { MfaSetup } = await createLoader({
    "next/navigation": "export const useRouter=()=>({refresh(){globalThis.__mfaRefreshes+=1;}});",
    "@/lib/supabase/client": "export const getSupabaseBrowserClient=()=>globalThis.__mfaBrowserClient;",
  })("components/auth/mfa-setup.tsx");

  try {
    render(React.createElement(MfaSetup, { locale: "es", role: "admin", initialState: "enroll" }));
    const input = await screen.findByLabelText("Código de 6 dígitos");
    const confirm = screen.getByRole("button", { name: "Confirmar" });
    const qr = screen.getByAltText("Código QR para tu app de autenticación");
    assert.equal(confirm.disabled, true);

    fireEvent.change(input, { target: { value: "12a34" } });
    assert.equal(input.value, "1234");
    assert.equal(confirm.disabled, true);
    assert.equal(screen.getByAltText("Código QR para tu app de autenticación"), qr);

    fireEvent.change(input, { target: { value: "123456" } });
    assert.equal(confirm.disabled, false);
    fireEvent.change(input, { target: { value: "12345" } });
    assert.equal(confirm.disabled, true);
    fireEvent.change(input, { target: { value: "654321" } });
    assert.equal(confirm.disabled, false);

    fireEvent.click(confirm);
    await waitFor(() => assert.equal(globalThis.__mfaRefreshes, 1));
    assert.deepEqual(calls.filter(([name]) => name === "verify"), [["verify", "c1", "654321"]]);
    assert.equal(input.value, "");
    assert.equal(confirm.disabled, true);
  } finally {
    cleanup();
    dom.window.close();
  }
});
