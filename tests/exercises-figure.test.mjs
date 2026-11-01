import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";

/**
 * Imagen de un ejercicio (EX-01).
 *
 * El origen publica dos fotos por movimiento (inicio y final). Mostrarlas
 * alternadas es lo que hace que la ficha se lea como el GIF del catálogo. Lo
 * que se cuida acá: que se usen las dos cuando existen, que nunca se pida una
 * ruta inventada y que una sola foto no rompa la tarjeta.
 */
const { ExerciseFigure, exerciseFrames, exerciseImage } = await createLoader({
  "server-only": "export {};",
})("components/exercises/exercise-figure.tsx");

const render = (props) => renderToStaticMarkup(React.createElement(ExerciseFigure, props));

const PAIR = {
  imageStart: "images/flat/leg-press-start.webp",
  imagePeak: "images/flat/leg-press-peak.webp",
  imageMain: null,
};

test("con dos fotos se alternan solas, sin JavaScript", () => {
  const html = render({ name: "Prensa de piernas", frames: PAIR });
  assert.match(html, /data-animate="true"/, "no marcó la figura como animada");
  assert.match(html, /class="frame-a"/);
  assert.match(html, /class="frame-b"/);
  assert.equal((html.match(/<img/g) ?? []).length, 2, "tienen que ser dos fotos");
  assert.ok(html.includes("/api/exercises/image?path=images%2Fflat%2Fleg-press-start.webp"));
  assert.ok(html.includes("/api/exercises/image?path=images%2Fflat%2Fleg-press-peak.webp"));
});

test("la primera foto lleva el nombre y la segunda queda oculta para lectores", () => {
  const html = render({ name: "Prensa de piernas", frames: PAIR });
  assert.match(html, /alt="Prensa de piernas"/);
  assert.match(html, /aria-hidden="true"/);
});

test("con una sola foto se muestra quieta", () => {
  const html = render({
    name: "Lagartijas",
    frames: { imageStart: null, imagePeak: null, imageMain: "images/flat/push-up-main.webp" },
  });
  assert.doesNotMatch(html, /data-animate/, "no debería animar una sola foto");
  assert.equal((html.match(/<img/g) ?? []).length, 1);
  assert.match(html, /alt="Lagartijas"/);
});

test("una foto suelta de inicio sirve como portada", () => {
  const frames = { imageStart: "images/flat/leg-press-start.webp", imagePeak: null, imageMain: null };
  assert.equal(exerciseImage(frames), "/api/exercises/image?path=images%2Fflat%2Fleg-press-start.webp");
  assert.equal(exerciseFrames(frames).animated, false);
  assert.match(render({ name: "Prensa", frames }), /<img/);
});

test("sin ninguna foto se dice, no se deja un hueco roto", () => {
  const html = render({ name: "Sin foto", frames: { imageStart: null, imagePeak: null, imageMain: null } });
  assert.ok(html.includes("Sin imagen"));
  assert.doesNotMatch(html, /<img/);
  assert.equal(exerciseImage({ imageStart: null, imagePeak: null, imageMain: null }), null);
});

test("la ruta de la imagen siempre pasa por el proxy propio", () => {
  const html = render({ name: "Prensa", frames: PAIR });
  assert.doesNotMatch(html, /repdb\.co|jsdelivr|raw\.githubusercontent/);
  assert.equal((html.match(/\/api\/exercises\/image/g) ?? []).length, 2);
});
