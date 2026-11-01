import { test } from "node:test";
import assert from "node:assert/strict";
import { toSecondCatalogRows } from "../src/lib/exercises/second-catalog.ts";
import { SECOND_CATALOG_ES, SECOND_CATALOG_SIZE, translationFor } from "../src/lib/exercises/second-catalog-data.ts";

/**
 * El segundo catálogo (mancuerna, barra, máquina y polea) se carga con la
 * traducción escrita a mano.
 *
 * Lo que se comprueba acá es la parte que puede romperse en silencio:
 *   · que la curaduría esté completa (nombre y tres pasos) y sin repetidos;
 *   · que sólo entre lo traducido —nunca un ejercicio en inglés suelto—;
 *   · que las rutas de las fotos sean las del origen y nada más;
 *   · que el resultado tenga la misma forma que el catálogo actual, porque la
 *     pantalla, «Mi rutina» y el cronómetro no distinguen de dónde vino.
 */

const fixture = [
  {
    id: "Leverage_Chest_Press",
    name: "Leverage Chest Press",
    force: "push",
    level: "beginner",
    mechanic: "compound",
    equipment: "machine",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["shoulders", "triceps"],
    instructions: ["Sit at the machine.", "Press the handles forward.", "Come back under control."],
    category: "strength",
    images: ["Leverage_Chest_Press/0.jpg", "Leverage_Chest_Press/1.jpg"],
  },
];

test("la curaduría tiene nombre, tres pasos y nada vacío", () => {
  const entries = Object.entries(SECOND_CATALOG_ES);
  assert.equal(entries.length, SECOND_CATALOG_SIZE);
  assert.ok(entries.length > 60, `la curaduría quedó corta: ${entries.length}`);
  for (const [id, entry] of entries) {
    assert.ok(entry.name.trim().length > 3, `${id} no tiene nombre`);
    assert.equal(entry.steps.length, 3, `${id} no tiene tres pasos`);
    for (const step of entry.steps) assert.ok(step.trim().length > 5, `${id} tiene un paso vacío`);
    if (entry.tip) assert.ok(entry.tip.trim().length > 5, `${id} tiene un consejo vacío`);
  }
});

test("ningún ejercicio se carga dos veces", () => {
  const nombres = Object.values(SECOND_CATALOG_ES).map((entry) => entry.name.toLowerCase());
  const repetidos = nombres.filter((nombre, index) => nombres.indexOf(nombre) !== index);
  assert.deepEqual(repetidos, [], `nombres repetidos: ${repetidos.join(", ")}`);
});

test("la traducción se encuentra aunque la clave venga escrita distinto", () => {
  assert.ok(translationFor("Leverage_Chest_Press"));
  assert.ok(translationFor("leveragechestpress"));
  assert.equal(translationFor("no-existe"), undefined);
});

test("sólo entra lo que está traducido; el resto se cuenta como afuera", () => {
  const dataset = [...fixture, { id: "Algo_Sin_Traducir", name: "Something" }];
  const { rows, skipped } = toSecondCatalogRows(dataset);
  assert.equal(rows.length, 1);
  assert.equal(skipped, 1);
  assert.equal(rows[0].id, "fd-Leverage_Chest_Press");
  assert.equal(rows[0].source, "free-exercise-db");
});

test("el resultado tiene la misma forma que el catálogo actual", () => {
  const [row] = toSecondCatalogRows(fixture).rows;
  const obligatorias = [
    "id", "name_es", "name_en", "description_es", "instructions_es", "tips_es",
    "category", "difficulty", "body_part", "equipment", "primary_muscles",
    "secondary_muscles", "goals", "is_unilateral", "is_bodyweight",
    "image_start", "image_peak", "image_main", "search_extra", "source",
  ];
  for (const key of obligatorias) assert.ok(key in row, `falta ${key}`);
  assert.equal(row.name_en, "Leverage Chest Press");
  assert.match(row.name_es, /pecho/i);
  assert.deepEqual(row.instructions_es.length, 3);
  assert.equal(row.equipment, "machine");
  assert.equal(row.body_part, "chest");
  assert.equal(row.category, "strength");
  assert.equal(row.difficulty, "beginner");
  assert.equal(row.image_start, "Leverage_Chest_Press/0.jpg");
  assert.equal(row.image_peak, "Leverage_Chest_Press/1.jpg");
  assert.ok(row.search_extra.includes("Máquina"), "la búsqueda no incluye el equipo en español");
});

test("las fotos que no son del origen se descartan, nunca se enlazan", () => {
  const raras = ["https://ejemplo.com/x.jpg", "../../etc/passwd/0.jpg", "Leverage_Chest_Press/2.jpg", ""];
  const [row] = toSecondCatalogRows([{ ...fixture[0], images: raras }]).rows;
  assert.equal(row.image_start, null);
  assert.equal(row.image_peak, null);
});

test("un ejercicio sin fotos sigue entrando y la pantalla muestra «Sin imagen»", () => {
  const [row] = toSecondCatalogRows([{ ...fixture[0], images: [] }]).rows;
  assert.equal(row.image_start, null);
  assert.equal(row.image_main, null);
});

test("los datos rotos no rompen la carga: se cuentan y se sigue", () => {
  const { rows, skipped } = toSecondCatalogRows([null, 42, [], "texto", { id: "" }]);
  assert.equal(rows.length, 0);
  assert.equal(skipped, 5);
});

test("un dataset que no es una lista no rompe nada", () => {
  for (const entrada of [null, undefined, {}, "x", 7]) {
    assert.deepEqual(toSecondCatalogRows(entrada), { rows: [], skipped: 0 });
  }
});
