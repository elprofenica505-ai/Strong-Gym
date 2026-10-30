import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./helpers/react-loader.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test",
});
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "FormData"])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = dom.window;
const { render, screen, fireEvent, cleanup } = await import("@testing-library/react");

const reactUrl = JSON.stringify(import.meta.resolve("react"));
const load = createLoader({
  "next/navigation": `export const usePathname = () => globalThis.__pathname;`,
  "lucide-react": `import React from ${reactUrl};
    export const RotateCcw = (props) => React.createElement("span", props);`,
});
const PanelError = (await load("app/[locale]/panel/error.tsx")).default;

afterEach(cleanup);

function mount({ pathname = "/es/panel/administracion/horarios", digest, reset = () => {} } = {}) {
  globalThis.__pathname = pathname;
  const spy = { resets: 0 };
  render(
    React.createElement(PanelError, {
      error: Object.assign(new Error("boom"), { digest }),
      reset: () => {
        spy.resets += 1;
        reset();
      },
    }),
  );
  return spy;
}

test("El panel avisa en castellano que no se guardó nada y ofrece reintentar", () => {
  mount({ digest: "abc123" });
  assert.match(document.body.textContent, /Esta pantalla no cargó/);
  assert.match(document.body.textContent, /No se guardó ni se borró nada/);
  assert.ok(document.body.textContent.includes("abc123"));
  assert.equal(screen.getByRole("button").textContent, "Reintentar");
});

test("Sin código de error no se muestra una línea vacía", () => {
  mount({});
  assert.equal(document.querySelectorAll("p.font-mono").length, 0);
});

test("En inglés el aviso cambia de idioma y mantiene el botón", () => {
  mount({ pathname: "/en/panel/administracion/horarios" });
  assert.match(document.body.textContent, /This screen did not load/);
  assert.equal(screen.getByRole("button").textContent, "Retry");
});

test("El botón reintentar llama a reset y no recarga la página", () => {
  const spy = mount({});
  fireEvent.click(screen.getByRole("button"));
  assert.equal(spy.resets, 1);
});
