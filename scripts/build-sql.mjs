#!/usr/bin/env node
/**
 * ============================================================
 *  Genera el SQL de Supabase a partir del código de la web
 * ============================================================
 *  Hace dos cosas:
 *
 *   1. Copia la grilla semanal de clases desde
 *      `src/lib/data/demo-sessions.ts` al archivo
 *      `supabase/migrations/00002_seed.sql`, así el calendario
 *      de la web y el de la base de datos son siempre iguales.
 *
 *   2. Junta las migraciones en `supabase/SETUP.sql`, un único
 *      archivo para pegar de una sola vez en el SQL Editor.
 *
 *  Uso:
 *    node scripts/build-sql.mjs          # regenera los archivos
 *    node scripts/build-sql.mjs --check  # falla si están desactualizados (CI)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_ONLY = process.argv.includes("--check");

const DEMO_SESSIONS = join(ROOT, "src/lib/data/demo-sessions.ts");
const SEED = join(ROOT, "supabase/migrations/00002_seed.sql");
const SCHEMA = join(ROOT, "supabase/migrations/00001_schema.sql");
const SETUP = join(ROOT, "supabase/SETUP.sql");

const MARCAS = {
  inicio: "-- >>> PLANTILLA SEMANAL (generada por scripts/build-sql.mjs — no editar a mano) >>>",
  fin: "-- <<< PLANTILLA SEMANAL <<<",
};

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const ORDEN_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/* ------------------------------------------------------------
   1. Leer la grilla semanal desde el código de la web
   ------------------------------------------------------------ */

function leerPlantilla() {
  const codigo = readFileSync(DEMO_SESSIONS, "utf8");
  const bloque = codigo.match(/const WEEKLY_TEMPLATE[^{]*\{([\s\S]*?)\n\};/);
  if (!bloque) throw new Error("No encontré WEEKLY_TEMPLATE en demo-sessions.ts");

  const dias = [];
  const diaRegex = /(\d):\s*\[([\s\S]*?)\]/g;
  let coincidencia;

  while ((coincidencia = diaRegex.exec(bloque[1])) !== null) {
    const numeroDia = Number(coincidencia[1]);
    const slots = [...coincidencia[2].matchAll(/time:\s*"(\d{2}:\d{2})",\s*slug:\s*"([a-z-]+)"/g)].map(
      (slot) => ({ time: slot[1], slug: slot[2] }),
    );
    if (slots.length === 0) continue;
    dias.push({ dia: numeroDia, slots });
  }

  if (dias.length !== 7) {
    throw new Error(`Esperaba 7 días en la plantilla y encontré ${dias.length}`);
  }

  return dias.sort((a, b) => a.dia - b.dia);
}

/* ------------------------------------------------------------
   2. Armar el bloque SQL
   ------------------------------------------------------------ */

function bloqueSQL(plantilla) {
  const lineas = [
    MARCAS.inicio,
    "      -- Misma grilla que src/lib/data/demo-sessions.ts (la web).",
    "      -- día (0 = lunes), hora local del gimnasio, disciplina",
  ];

  // El último horario del último día va sin coma; el resto la lleva.
  const ultimoDia = plantilla[plantilla.length - 1].dia;

  for (const { dia, slots } of plantilla) {
    lineas.push(`      -- ${ORDEN_DIAS[dia]}`);

    slots.forEach((slot, i) => {
      const esFinalDeTodo = dia === ultimoDia && i === slots.length - 1;
      const valor = `(${dia}, '${slot.time}'::time, '${slot.slug}')`;
      lineas.push(`      ${valor}${esFinalDeTodo ? "" : ","}`);
    });
  }

  lineas.push(MARCAS.fin);
  return lineas.join("\n");
}

/* ------------------------------------------------------------
   3. Escribir los archivos
   ------------------------------------------------------------ */

const plantilla = leerPlantilla();
const cantidadSemanal = plantilla.reduce((total, dia) => total + dia.slots.length, 0);

const cambios = [];

/* --- 3a. El bloque de la plantilla dentro del esquema --- */
const schemaOriginal = readFileSync(SCHEMA, "utf8");
const iInicio = schemaOriginal.indexOf(MARCAS.inicio);
const iFin = schemaOriginal.indexOf(MARCAS.fin);

if (iInicio === -1 || iFin === -1) {
  throw new Error("Faltan las marcas de la plantilla semanal en 00001_schema.sql");
}

const schemaNuevo =
  schemaOriginal.slice(0, iInicio) +
  bloqueSQL(plantilla) +
  schemaOriginal.slice(iFin + MARCAS.fin.length);

if (schemaNuevo !== schemaOriginal) {
  cambios.push([SCHEMA, schemaNuevo]);
}

/* --- 3b. SETUP.sql con todo junto --- */
const cabecera = `-- ============================================================
--  STRONG GYM — CONFIGURACIÓN COMPLETA DE SUPABASE
-- ============================================================
--
--  CÓMO USARLO
--    1. Entrá a tu proyecto en https://supabase.com
--    2. Menú lateral → "SQL Editor" → "New query"
--    3. Copiá TODO este archivo y pegalo en el editor
--    4. Apretá "Run" (o Ctrl + Enter) y esperá unos segundos
--
--  Qué crea:
--    · Las tablas (socios, clases, reservas, consultas, novedades)
--    · Las reglas de seguridad: cada socio sólo ve sus propias reservas
--    · Las funciones de reservar y cancelar, sin sobreventa de cupos
--    · El contenido inicial: disciplinas, profes, planes
--    · Las clases de las próximas 4 semanas (${cantidadSemanal} por semana)
--
--  Es seguro correrlo más de una vez: no duplica datos.
--
--  ARCHIVO GENERADO — no lo edites a mano.
--  El original son supabase/migrations/00001_schema.sql y 00002_seed.sql.
--  Para regenerarlo:  node scripts/build-sql.mjs
-- ============================================================


`;

const setupNuevo =
  cabecera +
  "-- ############################################################\n" +
  "-- #  PARTE 1 de 2 — ESTRUCTURA (tablas, permisos y funciones)\n" +
  "-- #  Original: supabase/migrations/00001_schema.sql\n" +
  "-- ############################################################\n\n" +
  schemaNuevo.trimStart() +
  "\n\n\n-- ############################################################\n" +
  "-- #  PARTE 2 de 2 — DATOS INICIALES (disciplinas, profes, clases)\n" +
  "-- #  Original: supabase/migrations/00002_seed.sql\n" +
  "-- ############################################################\n\n" +
  readFileSync(SEED, "utf8").trimStart();

let setupOriginal = "";
try {
  setupOriginal = readFileSync(SETUP, "utf8");
} catch {
  // todavía no existe
}

if (setupNuevo !== setupOriginal) {
  cambios.push([SETUP, setupNuevo]);
}

/* ------------------------------------------------------------
   4. Guardar o avisar
   ------------------------------------------------------------ */

if (cambios.length === 0) {
  console.log(`✅ Todo al día — ${cantidadSemanal} clases por semana.`);
  process.exit(0);
}

if (CHECK_ONLY) {
  console.error("❌ Hay archivos SQL desactualizados respecto al código de la web:");
  for (const [archivo] of cambios) console.error(`   · ${relative(ROOT, archivo)}`);
  console.error("\n   Corré:  node scripts/build-sql.mjs");
  process.exit(1);
}

for (const [archivo, contenido] of cambios) {
  writeFileSync(archivo, contenido);
  console.log(`✏️  Actualizado ${relative(ROOT, archivo)}`);
}

console.log(`✅ Listo — ${cantidadSemanal} clases por semana.`);
