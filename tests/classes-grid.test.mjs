import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createLoader } from "./helpers/react-loader.mjs";

const load = createLoader({
  "@/lib/data/queries": `export async function getClasses() {
    globalThis.__catalogReads++;
    if (globalThis.__catalogFailure) throw new Error("offline");
    return globalThis.__catalogClasses;
  }`,
  "@/components/ui/reveal": `import React from ${JSON.stringify(import.meta.resolve("react"))};
    export const Reveal=({children,className})=>React.createElement("div",{className},children);`,
  "@/components/ui/reload-button": `import React from ${JSON.stringify(import.meta.resolve("react"))};
    export const ReloadButton=({label})=>React.createElement("button",null,label);`,
  "next/link": `import React from ${JSON.stringify(import.meta.resolve("react"))};
    export default function Link({children,...props}) { return React.createElement("a",props,children); }`,
});
const { ClassesGrid } = await load("components/sections/classes-grid.tsx");
const fixture = (slug, capacity = 20) => ({
  id: slug, slug, capacity, name_es: slug, name_en: slug,
  description_es: "Actividad EJEMPLO", description_en: "EXAMPLE activity",
  intensity: "high", duration_min: 60, color: "#d81a22", is_active: true,
});
async function render(locale = "es", classes = [fixture("boxeo")], failure = false) {
  globalThis.__catalogReads = 0;
  globalThis.__catalogFailure = failure;
  globalThis.__catalogClasses = classes;
  const html = renderToStaticMarkup(await ClassesGrid({locale}));
  assert.equal(globalThis.__catalogReads, 1);
  return new JSDOM(html).window.document;
}

for (const [locale, capacity, action, hint] of [
  ["es", "Capacidad: 20 personas por sesión", "Ver horarios y reservar", "Los lugares disponibles se muestran al elegir día y hora."],
  ["en", "Capacity: 20 people per session", "View schedule and book", "Available spots are shown when you choose a date and time."],
]) test(`Inicio ${locale}: capacidad no se presenta como disponibilidad ni reserva directa`, async () => {
  const doc = await render(locale);
  const card = doc.querySelector("article");
  assert.ok(card.textContent.includes(capacity));
  assert.ok(card.textContent.includes(hint));
  const actionLink = [...card.querySelectorAll("a")].find(link => link.textContent.trim() === action);
  assert.ok(actionLink);
  assert.equal(actionLink.getAttribute("href"), `/${locale}/horarios`);
  assert.doesNotMatch(card.textContent, /20 lugares libres|20 available spots|19\/20/);
});

test("Inicio: capacidad viene de datos configurados, no un 20 fijo ni ocupación inventada", async () => {
  const doc = await render("es", [fixture("boxeo", 37)]);
  assert.ok(doc.querySelector("article").textContent.includes("Capacidad: 37 personas por sesión"));
  assert.doesNotMatch(doc.querySelector("article").textContent, /Capacidad: 20|lugares libres/);
});

test("Inicio: acceso libre y consulta no se convierten en reservas por sesión", async () => {
  const doc = await render("es", [fixture("musculacion",40),fixture("zumba",30)]);
  const [free,ask] = doc.querySelectorAll("article");
  assert.ok(free.textContent.includes("Capacidad: 40 personas"));
  assert.ok(free.textContent.includes("No se reserva"));
  assert.ok(ask.textContent.includes("Capacidad: 30 personas"));
  assert.ok(ask.textContent.includes("Horario por WhatsApp"));
  assert.doesNotMatch(doc.body.textContent, /personas por sesión|Ver horarios y reservar/);
});

test("Inicio: fallo de lectura no muestra cupos vacíos ni actividades ficticias", async () => {
  const doc = await render("es", [fixture("boxeo")], true);
  assert.ok(doc.querySelector('[role="alert"]'));
  assert.equal(doc.querySelectorAll("article").length, 0);
  assert.doesNotMatch(doc.body.textContent, /Capacidad:|20 lugares/);
});

test("Inicio: catálogo realmente vacío conserva mensaje explícito", async () => {
  const doc = await render("es", []);
  assert.ok(doc.body.textContent.includes("Todavía no hay disciplinas publicadas"));
  assert.equal(doc.querySelectorAll("article").length, 0);
  assert.equal(doc.querySelector('[role="alert"]'), null);
});
