import test from "node:test";
import assert from "node:assert/strict";
import { toImportRows } from "../src/lib/exercises/import.ts";

/**
 * La traducción del JSON del catálogo a filas de la base.
 *
 * Lo que se cuida acá: que «glúteo» encuentre `gluteus_maximus` (el dataset
 * habla en inglés), que una imagen externa no entre, y que un registro roto no
 * tumbe las 700 filas buenas.
 */
const bueno = {
  id: "barbell-hip-thrust",
  name_es: "Empuje de cadera con barra",
  name_en: "Barbell Hip Thrust",
  description_es: "Glúteo en su punto más fuerte.",
  instructions_es: ["Apoyá la espalda en el banco."],
  instructions_en: ["Rest your back on the bench."],
  tips_es: ["Apretá el glúteo arriba."],
  tips_en: [],
  category: "strength",
  force_type: "push",
  mechanic: "compound",
  difficulty: "intermediate",
  body_part: "upper_legs",
  equipment: "barbell",
  primary_muscles: ["gluteus_maximus"],
  secondary_muscles: ["hamstrings"],
  goals: ["hypertrophy"],
  tags: ["hip_hinge"],
  met: 6,
  is_unilateral: false,
  is_bodyweight: false,
  images: { flat: { start: "images/flat/hip-thrust-start.webp", peak: "images/flat/hip-thrust-peak.webp" } },
};

test("una fila buena entra completa", () => {
  const { rows, skipped } = toImportRows({ exercises: [bueno] });
  assert.equal(skipped, 0);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.id, "barbell-hip-thrust");
  assert.equal(row.name_es, "Empuje de cadera con barra");
  assert.deepEqual(row.primary_muscles, ["gluteus_maximus"]);
  assert.equal(row.image_start, "images/flat/hip-thrust-start.webp");
  assert.equal(row.image_peak, "images/flat/hip-thrust-peak.webp");
  assert.equal(row.image_main, null);
  assert.equal(row.met, 6);
});

test("el texto de búsqueda trae las palabras del socio, no los slugs", () => {
  const row = toImportRows([bueno]).rows[0];
  const search = row.search_extra.toLowerCase();
  for (const palabra of ["glúteo", "piernas", "isquiotibiales", "barra", "hipertrofia", "fuerza", "intermedio"]) {
    assert.ok(search.includes(palabra), `la búsqueda no incluye «${palabra}»: ${row.search_extra}`);
  }
  assert.doesNotMatch(row.search_extra, /gluteus_maximus|upper_legs|barbell\b/, "se coló un slug en la búsqueda");
});

test("un equipo vacío se busca como peso corporal", () => {
  const row = toImportRows([{ ...bueno, equipment: null }]).rows[0];
  assert.ok(row.search_extra.includes("Peso corporal"));
});

test("sólo se aceptan imágenes del directorio del catálogo", () => {
  const conUrl = toImportRows([
    {
      ...bueno,
      images: {
        flat: {
          start: "https://ejemplo.com/foto.jpg",
          peak: "../../../etc/passwd",
          main: "images/flat/hip-thrust-main.webp",
        },
      },
    },
  ]).rows[0];
  assert.equal(conUrl.image_start, null);
  assert.equal(conUrl.image_peak, null);
  assert.equal(conUrl.image_main, "images/flat/hip-thrust-main.webp");
});

test("un registro sin id o sin nombre se descarta y no rompe la carga", () => {
  const { rows, skipped } = toImportRows({
    exercises: [
      bueno,
      { ...bueno, id: "" },
      { ...bueno, id: "sin-nombre", name_es: "", name_en: "" },
      { ...bueno, id: "x".repeat(81) },
      "no soy un objeto",
      null,
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(skipped, 5);
});

test("sin nombre en español se usa el inglés, y viceversa", () => {
  const soloIngles = toImportRows([{ ...bueno, name_es: undefined }]).rows[0];
  assert.equal(soloIngles.name_es, "Barbell Hip Thrust");
  const soloEspanol = toImportRows([{ ...bueno, name_en: "" }]).rows[0];
  assert.equal(soloEspanol.name_en, "Empuje de cadera con barra");
});

test("un catálogo vacío o con otra forma no inventa filas", () => {
  assert.deepEqual(toImportRows({}), { rows: [], skipped: 0 });
  assert.deepEqual(toImportRows(null), { rows: [], skipped: 0 });
  assert.deepEqual(toImportRows({ ejercicios: [bueno] }), { rows: [], skipped: 0 });
});

test("dos ejercicios con el mismo id se mandan igual: la base decide", () => {
  // El upsert idempotente vive en la base; acá no se deduplica a escondidas.
  const { rows } = toImportRows([bueno, bueno]);
  assert.equal(rows.length, 2);
});
