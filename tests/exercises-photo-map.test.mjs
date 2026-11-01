import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * El mapa curado de fotos reales (EX-04, migración `00093`).
 *
 * El mapa es dato, y el dato se puede revisar sin base: acá se comprueba que
 * cada fila tenga forma de ruta que el proxy de imágenes acepta, que ninguna
 * ficha vieja se repita y que dos fichas viejas no terminen mostrando el mismo
 * movimiento (eso sería duplicar contenido con otro nombre).
 *
 * Lo que **no** se prueba acá: que la foto sea del ejercicio correcto. Eso se
 * revisó a mano, par por par, y no hay consulta que lo adivine.
 */
const MAPA = readFileSync(
  new URL("../supabase/migrations/00093_fotos_reales_del_segundo_catalogo.sql", import.meta.url),
  "utf8",
);

/** Saca el bloque `(values …)` con las filas `('id', 'Carpeta', 'Nombre')`. */
const filas = [...MAPA.matchAll(/^ {2}\('([^']+)', '([^']+)', '((?:[^']|'')*)'\)/gm)].map((m) => ({
  id: m[1],
  folder: m[2],
  nombre: m[3].replace(/''/g, "'"),
}));

/** La misma forma que exige `src/app/api/exercises/image/route.ts`. */
const RUTA = /^[A-Za-z0-9][A-Za-z0-9 _().,'&-]{0,90}\/[01]\.jpg$/;

test("el mapa trae las fichas revisadas una por una", () => {
  assert.equal(filas.length, 185, "cambió la cantidad de fichas mapeadas");
});

test("ninguna ficha vieja se repite", () => {
  const ids = filas.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, `repetidas: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
});

test("ningún movimiento nuevo se usa dos veces", () => {
  const carpetas = filas.map((f) => f.folder);
  const repetidas = carpetas.filter((c, i) => carpetas.indexOf(c) !== i);
  assert.deepEqual(repetidas, [], "dos fichas distintas mostrarían las mismas fotos");
});

test("cada carpeta tiene la forma que el proxy acepta", () => {
  for (const { folder } of filas) {
    assert.match(`${folder}/0.jpg`, RUTA, `ruta inválida: ${folder}`);
  }
});

test("los ids son los del catálogo, en minúsculas y con guiones", () => {
  for (const { id } of filas) {
    assert.match(id, /^[a-z0-9][a-z0-9-]{0,60}$/, `id raro: ${id}`);
  }
});

test("el nombre del origen queda guardado, para poder revisarlo después", () => {
  for (const { nombre } of filas) {
    assert.ok(nombre.trim().length > 2, `sin nombre de origen: ${nombre}`);
  }
});

test("la bicicleta de sala no se mapea a la bicicleta de piso del origen", () => {
  // En el catálogo nuevo `Air_Bike` es un abdominal en el piso, no la máquina.
  assert.ok(!filas.some((f) => f.folder === "Air_Bike"));
});

test("las fichas de sala que más se usan están", () => {
  const porId = new Map(filas.map((f) => [f.id, f.folder]));
  assert.equal(porId.get("bench-press"), "Barbell_Bench_Press_-_Medium_Grip");
  assert.equal(porId.get("squat"), "Barbell_Squat");
  assert.equal(porId.get("leg-press"), "Leg_Press");
  assert.equal(porId.get("lat-pulldown"), "Wide-Grip_Lat_Pulldown");
});

test("la migración no borra nada: sólo agrega tabla, columnas y disparador", () => {
  assert.match(MAPA, /create table if not exists public\.exercise_photo_map/);
  assert.ok(!/delete\s+from/i.test(MAPA), "la migración no debe borrar filas");
  assert.ok(!/drop table/i.test(MAPA), "la migración no debe borrar tablas");
  assert.match(MAPA, /create trigger exercises_keep_photo/);
});
