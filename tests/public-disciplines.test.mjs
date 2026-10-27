import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createLoader } from "./helpers/react-loader.mjs";
import {
  isPlanVisibleForDisciplines,
  publicDisciplineVisibility,
  selectPublicDisciplineText,
} from "../src/lib/public-disciplines.ts";

const dict = (await createLoader()("i18n/dictionaries/es.ts")).default;
const reactUrl = JSON.stringify(import.meta.resolve("react"));
const load = createLoader({
  "@/lib/data/queries": `
    export async function getClasses() { return globalThis.__pdClasses ?? []; }
    export async function getPlans() { return globalThis.__pdPlans ?? []; }
    export async function getCoaches() { return globalThis.__pdCoaches ?? []; }
  `,
  "@/components/ui/reveal": `import React from ${reactUrl};
    export const Reveal=({children,className})=>React.createElement("div",{className},children);`,
  "@/components/ui/reload-button": `import React from ${reactUrl};
    export const ReloadButton=({label})=>React.createElement("button",null,label);`,
  "@/components/providers/dictionary-provider":
    `export const useDictionary=()=>({locale:"es",dict:${JSON.stringify(dict)}});`,
  "next/link": `import React from ${reactUrl};
    export default function Link({children,...props}) { return React.createElement("a",props,children); }`,
  "next/image": `import React from ${reactUrl};
    export default function Image(props) { const {fill,priority,sizes,...rest}=props; return React.createElement("img",rest); }`,
});

const { Hero } = await load("components/sections/hero.tsx");
const { Marquee } = await load("components/sections/marquee.tsx");
const { Features } = await load("components/sections/features.tsx");
const { ClassesGrid } = await load("components/sections/classes-grid.tsx");
const { Plans } = await load("components/sections/plans.tsx");
const { Coaches } = await load("components/sections/coaches.tsx");
const { Faq } = await load("components/sections/faq.tsx");
const { SiteFooter } = await load("components/layout/site-footer.tsx");

const classFixture = (slug) => ({
  id: `cls_${slug}`,
  slug,
  name_es: slug === "musculacion" ? "Pesas y máquinas" : slug,
  name_en: slug,
  description_es: "Actividad EJEMPLO",
  description_en: "EXAMPLE activity",
  intensity: "medium",
  duration_min: 60,
  capacity: 40,
  color: "#d81a22",
  sort_order: 1,
  is_active: true,
});

const planFixture = (slug, name) => ({
  id: `pln_${slug}`,
  slug,
  name_es: name,
  name_en: name,
  tagline_es: "Plan EJEMPLO",
  tagline_en: "EXAMPLE plan",
  price: 20,
  price_nio: null,
  period: "month",
  features_es: ["Detalle EJEMPLO"],
  features_en: ["EXAMPLE detail"],
  is_popular: slug === "boxeo",
  sort_order: 1,
  is_active: true,
});

function rendered(element) {
  return new JSDOM(renderToStaticMarkup(element)).window.document;
}

test("visibilidad: deriva Boxeo/Zumba solo desde disciplinas activas", () => {
  assert.deepEqual(publicDisciplineVisibility(["musculacion"]), {
    showBoxing: false,
    showZumba: false,
  });
  assert.deepEqual(publicDisciplineVisibility(["boxeo"]), {
    showBoxing: true,
    showZumba: false,
  });
  assert.deepEqual(publicDisciplineVisibility(["zumba"]), {
    showBoxing: false,
    showZumba: true,
  });
  // Sin prop (usos aislados/legados) no se oculta nada por accidente.
  assert.deepEqual(publicDisciplineVisibility(), {
    showBoxing: true,
    showZumba: true,
  });
});

test("textos: cada combinación usa su variante sin anunciar disciplinas ocultas", () => {
  const variants = {
    both: "ambas",
    boxingOnly: "boxeo",
    danceOnly: "bailo",
    weightsOnly: "pesas",
  };
  assert.equal(
    selectPublicDisciplineText({ showBoxing: true, showZumba: true }, variants),
    "ambas",
  );
  assert.equal(
    selectPublicDisciplineText({ showBoxing: true, showZumba: false }, variants),
    "boxeo",
  );
  assert.equal(
    selectPublicDisciplineText({ showBoxing: false, showZumba: true }, variants),
    "bailo",
  );
  assert.equal(
    selectPublicDisciplineText({ showBoxing: false, showZumba: false }, variants),
    "pesas",
  );
});

test("planes: solo el plan asociado a la disciplina sigue su interruptor", () => {
  const hidden = { showBoxing: false, showZumba: false };
  assert.equal(isPlanVisibleForDisciplines("boxeo", hidden), false);
  assert.equal(isPlanVisibleForDisciplines("zumba", hidden), false);
  assert.equal(isPlanVisibleForDisciplines("pase-del-dia", hidden), true);
  assert.equal(isPlanVisibleForDisciplines("gimnasio-mensual", hidden), true);
});

test("landing: portada, cinta y tarjetas fijas omiten Boxeo/Zumba desactivados", () => {
  const hidden = { showBoxing: false, showZumba: false };
  const hero = rendered(React.createElement(Hero, hidden));
  assert.doesNotMatch(hero.body.textContent, /boxeo|bailoterapia/i);
  assert.match(hero.body.textContent, /Máquinas modernas y pesas libres/);

  const marquee = rendered(
    React.createElement(Marquee, { locale: "es", ...hidden }),
  );
  assert.doesNotMatch(marquee.body.textContent, /boxeo|zumba|bailoterapia/i);
  assert.match(marquee.body.textContent, /Pesas libres/);

  const features = rendered(
    React.createElement(Features, { locale: "es", ...hidden }),
  );
  assert.doesNotMatch(features.body.textContent, /boxeo|zumba|bailoterapia/i);
  assert.match(features.body.textContent, /Máquinas modernas/);
  assert.match(features.body.textContent, /Suplementos/);

  const visible = rendered(
    React.createElement(Features, {
      locale: "es",
      showBoxing: true,
      showZumba: true,
    }),
  );
  assert.match(visible.body.textContent, /Boxeo para todas las edades/);
  assert.match(visible.body.textContent, /Zumba y bailoterapia/);
});

test("landing: el subtítulo del catálogo no anuncia disciplinas inactivas", async () => {
  globalThis.__pdClasses = [classFixture("musculacion")];
  const doc = rendered(await ClassesGrid({ locale: "es" }));
  assert.match(doc.body.textContent, /Sala de pesas y máquinas de acceso libre\./);
  assert.doesNotMatch(doc.body.textContent, /boxeo|bailoterapia/i);
});

test("landing: Precios oculta la tarjeta Boxeo si la disciplina está inactiva", async () => {
  globalThis.__pdPlans = [
    planFixture("boxeo", "Boxeo"),
    planFixture("pase-del-dia", "Pase del día"),
  ];

  const hidden = rendered(
    await Plans({ locale: "es", activeClassSlugs: ["musculacion"] }),
  );
  assert.doesNotMatch(hidden.body.textContent, /Boxeo/);
  assert.match(hidden.body.textContent, /Pase del día/);
  assert.match(hidden.body.textContent, /Vestuario/);
  assert.doesNotMatch(hidden.body.textContent, /área de boxeo/i);

  const visible = rendered(
    await Plans({ locale: "es", activeClassSlugs: ["boxeo"] }),
  );
  assert.match(visible.body.textContent, /Boxeo/);
  assert.match(visible.body.textContent, /\$20/);
});

test("landing: Equipo, FAQ y pie no promocionan disciplinas inactivas", async () => {
  globalThis.__pdCoaches = [];
  const coaches = rendered(await Coaches({ locale: "es", showBoxing: false }));
  assert.doesNotMatch(coaches.body.textContent, /boxeo/i);
  assert.match(coaches.body.textContent, /Orientación para usar las máquinas/);

  const faq = rendered(
    React.createElement(Faq, {
      locale: "es",
      showBoxing: false,
      showZumba: false,
    }),
  );
  assert.doesNotMatch(faq.body.textContent, /boxeo|zumba|bailoterapia/i);
  assert.match(faq.body.textContent, /¿Venden suplementos\?/);

  const footer = rendered(
    React.createElement(SiteFooter, {
      locale: "es",
      showBoxing: false,
      showZumba: false,
    }),
  );
  assert.doesNotMatch(footer.body.textContent, /boxeo|zumba|bailoterapia/i);
  assert.equal(footer.querySelector('a[href="/es#boxeo"]'), null);
  assert.match(footer.body.textContent, /Pesas y máquinas/);
});

test("inicio: la sección especial de Boxeo solo se monta si está activa", () => {
  const source = readFileSync(
    new URL("../src/app/[locale]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.includes(
      "{visibility.showBoxing ? <Boxing locale={safeLocale} /> : null}",
    ),
  );
  assert.ok(source.includes("getPublicDisciplineState()"));
});
