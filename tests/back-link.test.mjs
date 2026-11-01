import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";

/**
 * El botón de volver (EX-05).
 *
 * El dueño se quejó de que el retroceso de la ficha era una flecha diminuta
 * (`← Biblioteca`, 12 px) y pidió «una flecha más grande y que diga atrás».
 * Lo que se cuida acá: que diga Atrás, que la flecha exista y sea un dibujo
 * (no un carácter suelto), que el área para tocar sea de 44 px o más y que el
 * enlace lleve a donde tiene que llevar.
 */
const loader = createLoader({ "server-only": "export {};" });
const { BackLink } = await loader("components/ui/back-link.tsx");

const render = (props) => renderToStaticMarkup(React.createElement(BackLink, props));

test("dice «Atrás», no sólo la flecha", () => {
  const html = render({ href: "/es/mi-cuenta/ejercicios" });
  assert.match(html, />Atrás</);
});

test("la flecha es un dibujo, no un carácter que se encoge", () => {
  const html = render({ href: "/es/mi-cuenta/ejercicios" });
  assert.match(html, /<svg/);
  assert.ok(!html.includes("←"), "no debe volver el carácter de flecha chiquito");
});

test("el área para tocar llega al mínimo cómodo del pulgar", () => {
  const html = render({ href: "/es/mi-cuenta/ejercicios" });
  assert.match(html, /min-h-11/, "menos de 44 px no es un botón en el teléfono");
});

test("se ve como un botón, no como una etiqueta", () => {
  const html = render({ href: "/es/mi-cuenta/ejercicios" });
  assert.match(html, /rounded-full/);
  assert.match(html, /border/);
  assert.match(html, /bg-card/);
});

test("lleva a la ruta que recibe", () => {
  const html = render({ href: "/es/mi-cuenta/ejercicios" });
  assert.match(html, /href="\/es\/mi-cuenta\/ejercicios"/);
});

test("dice a dónde vuelve, en chiquito pero con su nombre", () => {
  const html = render({ href: "/es/mi-cuenta/ejercicios", hint: "Biblioteca" });
  assert.match(html, />Biblioteca</);
  assert.match(html, /aria-label="Atrás: Biblioteca"/);
});

test("sin pista, el lector de pantalla escucha sólo «Atrás»", () => {
  const html = render({ href: "/es/mi-cuenta" });
  assert.match(html, /aria-label="Atrás"/);
});

test("deja agregar margen desde la pantalla que lo usa", () => {
  const html = render({ href: "/es", className: "mb-2" });
  assert.match(html, /mb-2/);
});
