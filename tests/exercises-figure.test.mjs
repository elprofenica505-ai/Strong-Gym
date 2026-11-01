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
const { exerciseFrames, exerciseImage, figureUrl, figureNote, figureMotion } =
  await loader("lib/exercises/figure.ts");

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
  // `&` sale escapado como `&amp;` en el HTML: es correcto.
  assert.ok(html.includes("/api/exercises/image?path=images%2Fflat%2Fleg-press-start.webp&amp;w=320"));
  assert.ok(html.includes("/api/exercises/image?path=images%2Fflat%2Fleg-press-peak.webp&amp;w=320"));
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

test("con una sola foto igual se mueve: se acerca y se aleja", () => {
  const html = render({
    name: "Lagartijas",
    frames: { imageStart: null, imagePeak: null, imageMain: "images/flat/push-up-main.webp" },
  });
  assert.doesNotMatch(html, /data-animate/, "no se alternan dos fotos porque hay una sola");
  assert.match(html, /data-motion="soft"/, "tiene que marcar el movimiento suave");
  assert.equal((html.match(/<img/g) ?? []).length, 1, "una sola imagen, sin duplicarla");
  assert.match(html, /alt="Lagartijas"/);
  // La transición va escrita en línea, sin `@media`: ninguna preferencia del
  // sistema puede apagarla (fue el problema de EX-03).
  assert.match(html, /transition:transform \d+ms ease-in-out/);
  assert.match(html, /scale\(1\)/);
});

test("una foto suelta de inicio sirve como portada", () => {
  const frames = { imageStart: "images/flat/leg-press-start.webp", imagePeak: null, imageMain: null };
  assert.equal(exerciseImage(frames), "/api/exercises/image?path=images%2Fflat%2Fleg-press-start.webp&w=320");
  assert.equal(exerciseFrames(frames).animated, false);
  assert.equal(figureMotion(frames), "soft");
  assert.match(render({ name: "Prensa", frames }), /<img/);
});

test("sin ninguna foto se dice, no se deja un hueco roto", () => {
  const vacio = { imageStart: null, imagePeak: null, imageMain: null };
  const html = render({ name: "Sin foto", frames: vacio });
  assert.match(html, /Sin imagen/);
  assert.equal(exerciseImage(vacio), null);
  assert.equal(figureMotion(vacio), "none");
});

test("la ruta de la foto siempre pasa por el proxy", () => {
  assert.equal(figureUrl(null), null);
  assert.equal(figureUrl("Barbell_Squat/0.jpg"), "/api/exercises/image?path=Barbell_Squat%2F0.jpg&w=320");
  assert.equal(
    figureUrl("Barbell_Squat/0.jpg", 640),
    "/api/exercises/image?path=Barbell_Squat%2F0.jpg&w=640",
  );
});

// --- Peso de las imágenes (EX-06) ---
// La app se sentía lenta al entrar: cada tarjeta bajaba la foto original de
// 850 px y ~60 KB. Ahora se piden dos medidas y el navegador baja una sola.
const { FIGURE_VARIANTS, figureSrcSet } = await loader("lib/exercises/figure.ts");

test("la tarjeta ofrece dos medidas y el teléfono baja la chica", () => {
  const srcset = figureSrcSet("Barbell_Squat/0.jpg", FIGURE_VARIANTS.card.widths);
  assert.equal(
    srcset,
    "/api/exercises/image?path=Barbell_Squat%2F0.jpg&w=320 320w, /api/exercises/image?path=Barbell_Squat%2F0.jpg&w=640 640w",
  );
  // Sin `sizes`, el navegador supone 100vw y baja la grande en el teléfono.
  assert.match(FIGURE_VARIANTS.card.sizes, /vw/);
});

test("la tarjeta pide la foto chica antes que nada", () => {
  const html = render({ name: "Sentadilla", frames: PAIR });
  assert.match(html, /src="\/api\/exercises\/image\?path=[^"]*&amp;w=320"/);
  assert.match(html, /srcset="[^"]*320w[^"]*640w"/i);
});

test("la ficha pide la foto grande, que es la que se ve entera", () => {
  const html = render({ name: "Sentadilla", frames: PAIR, variant: "detail" });
  assert.match(html, /src="\/api\/exercises\/image\?path=[^"]*&amp;w=640"/);
  assert.match(html, /srcset="[^"]*640w[^"]*960w"/i);
});

test("nunca se piden medidas fuera de las tres acordadas", () => {
  const permitidas = new Set([320, 640, 960]);
  for (const variant of Object.values(FIGURE_VARIANTS)) {
    for (const width of variant.widths) {
      assert.ok(permitidas.has(width), `medida no prevista: ${width}`);
    }
  }
});

// --- Qué se dice cuando la imagen no se mueve (EX-04b) ---
// 32 fichas visibles tienen una sola imagen: posiciones que se mantienen,
// paseos con peso y máquinas de cardio. Antes la ficha decía «Imagen de
// referencia del movimiento» y parecía un error. Ahora se explica.
const FIJA = { imageStart: null, imagePeak: null, imageMain: "images/flat/hold-main.webp" };

test("con dos fotos se dice que alternan", () => {
  assert.match(figureNote(PAIR, "Sentadilla"), /alterna la posición inicial y la final/);
});

test("una posición que se mantiene explica que la imagen se mueve despacio", () => {
  const note = figureNote(FIJA, "Sentadilla Zercher Isométrica");
  assert.match(note, /posición que se mantiene/);
  assert.match(note, /se mueve despacio/);
  const sostén = figureNote(FIJA, "Sostén con Pesa Rusa sobre la Cabeza");
  assert.match(sostén, /posición que se mantiene/);
});

test("si el catálogo trae una sola foto, se dice sin inventar excusas", () => {
  const note = figureNote(FIJA, "Bicicleta Estática");
  assert.match(note, /una sola foto/);
  assert.match(note, /se acerca y se aleja/);
  assert.ok(!/mantiene/.test(note), "no debe decir que es una posición si no lo es");
});

test("las tres formas de movimiento se distinguen", () => {
  assert.equal(figureMotion(PAIR), "alternate");
  assert.equal(figureMotion(FIJA), "soft");
  assert.equal(figureMotion({ imageStart: null, imagePeak: null, imageMain: null }), "none");
});

test("la foto suelta también pide dos medidas al proxy", () => {
  const html = render({ name: "Bicicleta", frames: FIJA });
  assert.match(html, /srcset="[^"]*320w[^"]*640w"/i);
});
