import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./helpers/react-loader.mjs";

/**
 * Si una foto falla, la tarjeta no queda rota (EX-04b).
 *
 * En el teléfono, la tarjeta de «Curl con Barra Z» mostró el icono de imagen
 * rota con el nombre encima. El archivo existe: fue un tropiezo de red con
 * datos móviles. Ahora el componente vuelve a pedir la foto hasta dos veces y,
 * si tampoco llega, muestra un hueco discreto en vez de romper la tarjeta.
 */
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://strong.test" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event"])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = dom.window;
// IntersectionObserver no existe en jsdom: el componente ya lo contempla.
delete globalThis.IntersectionObserver;

const { render, screen, fireEvent, cleanup } = await import("@testing-library/react");
const loader = createLoader({ "server-only": "export {};" });
const { ExerciseFigure } = await loader("components/exercises/exercise-figure.tsx");

afterEach(() => cleanup());

const PAIR = {
  imageStart: "Barbell_Squat/0.jpg",
  imagePeak: "Barbell_Squat/1.jpg",
  imageMain: null,
};

test("si la foto falla una vez, se vuelve a pedir con otra dirección", () => {
  const { container } = render(React.createElement(ExerciseFigure, { name: "Sentadilla", frames: PAIR }));
  const primera = container.querySelector("img.frame-a");
  assert.ok(primera.src.includes("w=320"), "la primera petición es la normal");
  assert.ok(!primera.src.includes("&r="));

  fireEvent.error(primera);

  const reintento = container.querySelector("img.frame-a");
  assert.match(reintento.src, /&r=1$/, "el reintento tiene que ser una URL distinta");
  assert.match(
    reintento.getAttribute("srcset"),
    /&r=1 320w/,
    "el srcset también: si no, el navegador reusa la candidata que falló",
  );
});

test("si la foto nunca carga, queda un hueco discreto y no una imagen rota", () => {
  const { container } = render(React.createElement(ExerciseFigure, { name: "Sentadilla", frames: PAIR }));
  for (let intento = 0; intento < 3; intento++) {
    const img = container.querySelector("img.frame-a");
    if (!img) break;
    fireEvent.error(img);
  }
  assert.ok(!container.querySelector("img"), "no debe quedar la imagen rota en pantalla");
  assert.ok(screen.queryByText("Sin imagen"), "tiene que decir que no hay imagen");
});

test("con una sola foto, si falla también se avisa en vez de romper", () => {
  const frames = { imageStart: null, imagePeak: null, imageMain: "images/flat/hold-main.webp" };
  const { container } = render(React.createElement(ExerciseFigure, { name: "Plancha", frames }));
  fireEvent.error(container.querySelector("img"));
  fireEvent.error(container.querySelector("img"));
  fireEvent.error(container.querySelector("img"));
  assert.ok(screen.queryByText("Sin imagen"));
});
