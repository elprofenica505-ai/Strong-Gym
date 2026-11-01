import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";
import { EXERCISE_ATTRIBUTION } from "../src/lib/exercises/terms.ts";

/**
 * La licencia del catálogo exige atribución visible. No alcanza con que exista
 * el componente: la prueba renderiza las tres pantallas de verdad y falla si
 * alguien la saca en un rediseño.
 */
const ATTRIBUTION = "Exercise data by RepDB (repdb.co)";
const HREF = "https://repdb.co";

const CARD = {
  id: "barbell-bench-press",
  nameEs: "Press de banca con barra",
  nameEn: "Barbell Bench Press",
  category: "strength",
  difficulty: "intermediate",
  bodyPart: "chest",
  equipment: "barbell",
  primaryMuscles: ["pectoralis_major"],
  isBodyweight: false,
  met: null,
  imageStart: null,
  imagePeak: null,
  imageMain: null,
};

const DETAIL = {
  ...CARD,
  descriptionEs: "Empuje acostado.",
  instructionsEs: ["Acostate en el banco.", "Bajá la barra al pecho."],
  tipsEs: [],
  forceType: "push",
  mechanic: "compound",
  secondaryMuscles: ["triceps_brachii"],
  goals: ["hypertrophy"],
  tags: [],
  isUnilateral: false,
  saved: null,
};

const ROUTINE_ITEM = {
  exerciseId: CARD.id,
  position: 1,
  sets: 3,
  reps: "10",
  restSeconds: 90,
  note: null,
  nameEs: CARD.nameEs,
  bodyPart: "chest",
  equipment: "barbell",
  difficulty: "intermediate",
  imageStart: null,
  imagePeak: null,
  imageMain: null,
};

const FACETS = {
  total: 1,
  bodyParts: { chest: 1 },
  equipment: { barbell: 1 },
  difficulty: { intermediate: 1 },
  category: { strength: 1 },
};

const json = (value) => JSON.stringify(value);

function loaderFor({ routine = [] } = {}) {
  return createLoader({
    "server-only": "export {};",
    "next/navigation": "export function redirect(p){throw new Error('REDIRECT:'+p);}",
    "next/link": `import React from ${JSON.stringify(import.meta.resolve("react"))};export default function Link({href,children,...rest}){return React.createElement('a',{href:typeof href==='string'?href:'#',...rest},children);}`,
    "@/lib/data/queries": "export const getCurrentUser=async()=>({id:'u1',role:'client',mfa:'ok'});",
    "@/lib/exercises/queries": `
      export async function getExerciseCatalog(){return {total:1,limit:24,offset:0,rows:[${json(CARD)}]};}
      export async function getExerciseFacets(){return ${json(FACETS)};}
      export async function getExerciseDetail(){return ${json(DETAIL)};}
      export async function getMyRoutine(){return {items:${json(routine)},canSave:true};}
      export class DataReadError extends Error {}
      export const saveRoutineItem=async()=>({ok:true});
      export const removeRoutineItem=async()=>({ok:true});
    `,
  });
}

const render = async (path, props) => {
  const { default: Page } = await loaderFor()(path);
  return renderToStaticMarkup(await Page(props));
};

const assertAttribution = (html, screen) => {
  assert.ok(html.includes(ATTRIBUTION), `${screen} no muestra el texto de atribución`);
  assert.ok(html.includes(HREF), `${screen} no enlaza a repdb.co`);
  assert.match(html, /target="_blank"/, `${screen} abre el enlace en la misma pestaña`);
};

test("el catálogo muestra la atribución del dataset", async () => {
  const html = await render("app/[locale]/mi-cuenta/ejercicios/page.tsx", {
    params: Promise.resolve({ locale: "es" }),
    searchParams: Promise.resolve({}),
  });
  assertAttribution(html, "El catálogo");
  assert.ok(html.includes("Press de banca con barra"), "el catálogo no lista el ejercicio");
  // Los chips dicen cuántos hay: así el socio ve de un vistazo qué es de sala.
  assert.ok(html.includes("Peso libre (1)"), "el chip de equipo no muestra el conteo");
  // Un chip sin ejercicios no se muestra: no se ofrece un filtro que no filtra.
  assert.ok(!html.includes("Máquinas (0)"), "el chip de máquinas vacío sigue en pantalla");
  assert.ok(html.includes("Fuerza (1)"), "falta el chip de tipo de trabajo");
});

test("el segundo catálogo también se acredita", async () => {
  for (const [file, params] of [
    ["app/[locale]/mi-cuenta/ejercicios/page.tsx", { params: Promise.resolve({ locale: "es" }), searchParams: Promise.resolve({}) }],
    ["app/[locale]/mi-cuenta/ejercicios/[id]/page.tsx", { params: Promise.resolve({ locale: "es", id: CARD.id }) }],
  ]) {
    const html = await render(file, params);
    assert.ok(
      html.includes(EXERCISE_ATTRIBUTION.secondText),
      `${file} no acredita el segundo origen`,
    );
    assert.ok(html.includes(EXERCISE_ATTRIBUTION.secondHref), `${file} no enlaza al segundo origen`);
  }
});

test("la ficha del ejercicio muestra la atribución", async () => {
  const html = await render("app/[locale]/mi-cuenta/ejercicios/[id]/page.tsx", {
    params: Promise.resolve({ locale: "es", id: CARD.id }),
  });
  assertAttribution(html, "La ficha");
  assert.ok(html.includes("Pecho"), "la ficha no traduce la zona");
});

test("mi rutina muestra la atribución, con ítems y vacía", async () => {
  const path = "app/[locale]/mi-cuenta/ejercicios/rutina/page.tsx";
  const lleno = await render(path, { params: Promise.resolve({ locale: "es" }) });
  assertAttribution(lleno, "Mi rutina");

  const conItems = await (async () => {
    const { default: Page } = await loaderFor({ routine: [ROUTINE_ITEM] })(path);
    return renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "es" }) }));
  })();
  assertAttribution(conItems, "Mi rutina con ejercicios");
  assert.ok(conItems.includes("Press de banca con barra"), "la rutina no lista el ejercicio guardado");
});

test("sin sesión no se muestra la biblioteca: manda a ingresar", async () => {
  const loader = createLoader({
    "server-only": "export {};",
    "next/navigation": "export function redirect(p){throw new Error('REDIRECT:'+p);}",
    "next/link": `import React from ${JSON.stringify(import.meta.resolve("react"))};export default function Link({href,children,...rest}){return React.createElement('a',{href:typeof href==='string'?href:'#',...rest},children);}`,
    "@/lib/data/queries": "export const getCurrentUser=async()=>null;",
    "@/lib/exercises/queries": "export async function getExerciseCatalog(){throw new Error('no debería leer');}export async function getExerciseFacets(){throw new Error('no debería leer');}",
  });
  const { default: Page } = await loader("app/[locale]/mi-cuenta/ejercicios/page.tsx");
  await assert.rejects(
    () => Page({ params: Promise.resolve({ locale: "es" }), searchParams: Promise.resolve({}) }),
    /REDIRECT:\/es\/ingresar/,
  );
});
