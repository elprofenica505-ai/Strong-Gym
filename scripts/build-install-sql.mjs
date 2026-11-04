#!/usr/bin/env node
/**
 * ============================================================
 *  Genera `supabase/INSTALAR-BASE.sql`
 * ============================================================
 *  Un solo archivo con TODA la estructura de la base, para
 *  levantar un proyecto nuevo de Supabase desde cero, sin
 *  arrastrar ni un dato de nadie.
 *
 *  Qué entra: las 82 migraciones de estructura (tablas, RLS,
 *  funciones, disparadores, permisos, límites de abuso) y el
 *  catálogo genérico de métodos de pago y categorías de gasto.
 *
 *  Qué NO entra: los archivos con datos de ejemplo o con datos
 *  reales del gimnasio, y las secciones de `00011` que traían
 *  cuentas bancarias, entrenadores, transacciones y la apertura
 *  de caja.
 *
 *  Uso:  node scripts/build-install-sql.mjs
 *        node scripts/build-install-sql.mjs --check   (falla si el
 *        archivo del repo está desactualizado)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outFile = join(root, "supabase", "INSTALAR-BASE.sql");

/**
 * Migraciones que NO van al clon, con el motivo escrito, porque dentro de
 * un año nadie se va a acordar de por qué.
 */
const EXCLUIDAS = {
  "00002_seed.sql": "planes y clases de ejemplo (precios y disciplinas inventadas)",
  "00003_datos_reales.sql": "tarifas, disciplinas y grilla reales de Strong Gym",
  "00021_clients_seed.sql": "socios ficticios con is_demo = true",
};

/**
 * `00011_finance_seed.sql` se parte: la mitad de arriba es catálogo genérico
 * (métodos de pago y categorías de gasto) y sirve para cualquier gimnasio;
 * de la sección 3 en adelante son cuentas bancarias, entrenadores,
 * transacciones y la caja inicial de Strong.
 */
const RECORTE_00011 = "--  3. CUENTAS DEL GIMNASIO";

/**
 * Cadenas con datos de Strong que aparecen dentro del catálogo genérico.
 * Se sustituyen por un texto neutro: el gimnasio nuevo carga los suyos
 * desde Administración → Dinero, no hereda la cuenta de otro.
 */
const NEUTRALIZAR = [
  ["'Banco BAC · Cuenta C$ 123-456789 · Titular: Strong Fitness Gym S.A.'",
   "'Transferencia bancaria en córdobas · configurá tu cuenta en Administración → Dinero'"],
  ["'BAC Bank · Account NIO 123-456789 · Account holder: Strong Fitness Gym S.A.'",
   "'Bank transfer in córdobas · set your account in Admin → Money'"],
  ["'Banco BAC · Cuenta US$ 987-654321 · Titular: Strong Fitness Gym S.A.'",
   "'Transferencia bancaria en dólares · configurá tu cuenta en Administración → Dinero'"],
  ["'BAC Bank · Account USD 987-654321 · Account holder: Strong Fitness Gym S.A.'",
   "'Bank transfer in US dollars · set your account in Admin → Money'"],
  ["'Banco LAFISE · Cuenta C$ 555-444-333'",
   "'Transferencia bancaria · configurá el número de cuenta en Administración → Dinero'"],
  ["'LAFISE Bank · Account NIO 555-444-333'",
   "'Bank transfer · set the account number in Admin → Money'"],
  ["'Billetera móvil Tigo. Número 8500-1234. Comisión: 2%.'",
   "'Billetera móvil · configurá el número en Administración → Dinero'"],
  ["'Tigo mobile wallet. Number 8500-1234. 2% fee.'",
   "'Mobile wallet · set the number in Admin → Money'"],
  ["'Billetera móvil Claro. Número 8500-5678. Comisión: 2%.'",
   "'Billetera móvil · configurá el número en Administración → Dinero'"],
  ["'Claro mobile wallet. Number 8500-5678. 2% fee.'",
   "'Mobile wallet · set the number in Admin → Money'"],
  ["'Transferencia inmediata desde cualquier banco al 8888-1234.'",
   "'Transferencia inmediata · configurá el número en Administración → Dinero'"],
  ["'Instant transfer from any bank to 8888-1234.'",
   "'Instant bank transfer · set the number in Admin → Money'"],
  ["'Cliente Strong'", "'Cliente'"],
];

/**
 * El nombre del gimnasio también aparece en títulos y comentarios de las
 * migraciones. En el clon se lee «el gimnasio», no la marca de otro.
 */
const RENOMBRES = [
  ["Strong Fitness Gym — Esquema de base de datos", "Esquema de base de datos"],
  ["Strong Fitness Gym — FASE 1: Contabilidad, caja y pagos", "FASE 1: Contabilidad, caja y finanzas"],
  ["Strong Fitness Gym — FASE 1: Datos de ejemplo (seed)", "FASE 1: Catálogo base (sin datos de ejemplo)"],
  ["Strong Gym: permitir la lectura del perfil", "el gimnasio: permitir la lectura del perfil"],
  ["Strong Gym; cualquier", "el gimnasio; cualquier"],
];

/** Encabezado del bloque de `00011`, que describía datos que ya no están. */
const ENCABEZADO_00011_VIEJO = `--  Genera 40 socios ficticios con nombres nicaragüenses, 3 coaches,
--  los métodos de pago que el gimnasio acepta (efectivo, transferencia,
--  tarjeta, SINPE Móvil y billetera móvil), las cuentas del gimnasio,
--  categorías de gastos, planes y 60+ transacciones del mes en curso
--  para que el panel se vea con vida desde el primer login.`;

const ENCABEZADO_00011_NUEVO = `--  De la migración original se conservan SÓLO dos bloques genéricos:
--    · los métodos de pago (efectivo, transferencia, tarjeta, billetera)
--    · las categorías de gasto (alquiler, luz, agua, salarios…)
--  Quedaron afuera las cuentas bancarias, los entrenadores,
--  las transacciones de ejemplo y la apertura de caja.`;

function leerMigracion(nombre) {
  let texto = readFileSync(join(migrationsDir, nombre), "utf8");

  if (nombre === "00011_finance_seed.sql") {
    const lineas = texto.split("\n");
    const corte = lineas.findIndex((l) => l.startsWith(RECORTE_00011));
    if (corte < 0) {
      throw new Error("00011: no se encontró el corte de la sección 3. Revisá el archivo.");
    }
    texto = lineas.slice(0, corte - 2).join("\n");
    texto = texto.replace(ENCABEZADO_00011_VIEJO, ENCABEZADO_00011_NUEVO);
  }

  for (const [de, a] of NEUTRALIZAR) texto = texto.split(de).join(a);
  for (const [de, a] of RENOMBRES) texto = texto.split(de).join(a);
  return texto.trim();
}

function construir() {
  const todas = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const incluidas = todas.filter((f) => !(f in EXCLUIDAS));
  const bloques = incluidas.map((nombre) => {
    const barra = "═".repeat(59);
    return `-- ${barra}\n--  ${nombre}\n-- ${barra}\n\n${leerMigracion(nombre)}\n`;
  });

  const cabecera = `-- ============================================================
--  PLANTILLA DE BASE DE DATOS — INSTALACIÓN COMPLETA
-- ============================================================
--  La casa entera, sin los muebles.
--
--  QUÉ INCLUYE (todo lo que hace funcionar la aplicación)
--    · las 45 tablas: socios, clases, reservas, caja, finanzas,
--      progreso, rutinas, nutrición, productos, mensajes…
--    · las reglas de seguridad (RLS): cada rol ve sólo lo suyo
--    · las funciones y disparadores: cobrar, reservar, cerrar caja,
--      calcular vigencias, categorías automáticas, bitácora, límites
--      de abuso
--    · los permisos del personal y los interruptores de caja
--    · la configuración mínima genérica: métodos de pago y
--      categorías de gasto
--
--  QUÉ NO INCLUYE
--    · Ni un socio, ni una reserva, ni un cobro, ni una medición.
--    · Ni una cuenta bancaria, ni un entrenador, ni una tarifa.
--    · Cero datos personales. Cero cuentas de acceso.
--
--  CÓMO SE USA
--    1. Supabase → proyecto nuevo → SQL Editor → New query
--    2. Pegar TODO este archivo
--    3. Run. Tarda unos segundos.
--    4. Después correr PERSONALIZAR-GIMNASIO.sql
--
--  QUÉ SIGUE DESPUÉS DE ESTO (no está en ningún SQL)
--    · La biblioteca de ejercicios se descarga con el botón de
--      administración (necesita 2FA): no vive en la base ni en el
--      repositorio, viene del dataset oficial.
--    · Las disciplinas, horarios, planes y precios se cargan desde
--      el panel del gimnasio, no por SQL.
--
--  Generado por scripts/build-install-sql.mjs — no editar a mano.
--  ${incluidas.length} migraciones incluidas de ${todas.length}.
-- ============================================================


`;
  return cabecera + bloques.join("\n").replace(/\n+$/, "\n") + `
-- ============================================================
--  FIN DE LA INSTALACIÓN
-- ============================================================
--  Si el editor marca un error, no te asustes: cada bloque trae su
--  propio begin/commit y se puede volver a correr. Los errores
--  típicos son «ya existe», y son inofensivos.
`;
}

const sql = construir();
const check = process.argv.includes("--check");

if (check) {
  const actual = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  if (actual !== sql) {
    console.error("✗ supabase/INSTALAR-BASE.sql está desactualizado.");
    console.error("  Corré: node scripts/build-install-sql.mjs");
    process.exit(1);
  }
  console.log("✓ supabase/INSTALAR-BASE.sql está al día.");
} else {
  writeFileSync(outFile, sql, "utf8");
  const lineas = sql.split("\n").length;
  const kb = Math.round(Buffer.byteLength(sql) / 1024);
  console.log(`✓ supabase/INSTALAR-BASE.sql — ${lineas} líneas, ${kb} KB`);
}
