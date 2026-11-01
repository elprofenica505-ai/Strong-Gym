import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";

/**
 * La imagen de un ejercicio (EX-01) y su movimiento.
 *
 * El origen publica dos fotos por movimiento (inicio y final). Lo que se cuida
 * acá: que se usen las dos cuando existen, que el cambio de foto lo haga el
 * componente —y no una animación de CSS que el teléfono pueda apagar—, que
 * nunca se pida una ruta inventada y que una sola foto no rompa la tarjeta.
 */
const loader = createLoader({ "server-only": "export {};" });
const { ExerciseFigure } = await loader("components/exercises/exercise-figure.tsx");
const { exerciseFrames, exerciseImage, figureUrl } = await loader("lib/exercises/figure.ts");

const render = (props) => renderToStaticMarkup(React.createElement(ExerciseFigure, props));

const PAIR = {
  imageStart: "images/flat/leg-press-start.webp",
  imagePeak: "images/flat/leg-press-peak.webp",
  imageMain: null,
};

test("con dos fotos se muestran las dos, listas para alternarse", () => {
  const html = render({ name: "Prensa de piernas", frames: PAIR });
  assert.match(html, /data-animate="true"/, "no marcó la figura como animada");
  assert.match(html, /class="frame-a"/);
  assert.match(html, /class="frame-b"/);
  assert.equal((html.match(/<img/g) ?? []).length, 2, "tienen que ser dos fotos");
  assert.ok(html.includes("/api/exercises/image?path=images%2Fflat%2Fleg-press-start.webp"));
  assert.ok(html.includes("/api/exercises/image?path=images%2Fflat%2Fleg-press-peak.webp"));
});

test("arranca en la posición inicial: la primera foto se ve y la segunda no", () => {
  const html = render({ name: "Prensa de piernas", frames: PAIR });
  assert.match(html, /class="frame-a" style="opacity:1"/);
  assert.match(html, /class="frame-b" style="opacity:0"/);
});

test("el movimiento no depende de una animación de CSS ni de prefers-reduced-motion", () => {
  const source = readFileSync(
    new URL("../src/components/exercises/exercise-figure.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /^"use client";/m, "la imagen tiene que ser un componente de cliente");
  assert.match(source, /setInterval/, "el cambio de foto lo tiene que hacer el componente");
  assert.doesNotMatch(source, /prefers-reduced-motion/);

  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /@keyframes exercise-frame/, "volvió la animación de CSS");
});

test("con dos fotos se alterna aunque el sistema pida reducir movimiento", () => {
  const html = render({ name: "Prensa de piernas", frames: PAIR, playing: true });
  assert.match(html, /data-playing="true"/);
  // La preferencia del sistema ya no apaga la imagen; sólo la pausa el socio.
  const paused = render({ name: "Prensa de piernas", frames: PAIR, playing: false });
  assert.match(paused, /data-playing="false"/);
  assert.match(paused, /class="frame-a" style="opacity:1"/);
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
  assert.match(html, /Sin imagen/);
  assert.equal(exerciseImage({ imageStart: null, imagePeak: null, imageMain: null }), null);
});

test("la ruta de la foto siempre pasa por el proxy", () => {
  assert.equal(figureUrl(null), null);
  assert.equal(figureUrl("Barbell_Squat/0.jpg"), "/api/exercises/image?path=Barbell_Squat%2F0.jpg");
});
