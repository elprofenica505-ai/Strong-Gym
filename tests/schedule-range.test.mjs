import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { sessionsBoardFrom } from "../src/lib/admin/schedule-range.ts";

const root = new URL("..", import.meta.url).pathname;

test("El período arranca hoy y cubre las próximas cuatro semanas", () => {
  const board = sessionsBoardFrom("2026-10-30");
  assert.equal(board.from, "2026-10-30");
  assert.equal(board.today, "2026-10-30");
  assert.equal(board.to, "2026-11-26");
  assert.deepEqual(board.sessions, []);
});

test("Cruza el cambio de mes y de año sin correrse un día", () => {
  assert.equal(sessionsBoardFrom("2026-12-20").to, "2027-01-16");
  assert.equal(sessionsBoardFrom("2028-02-20").to, "2028-03-18"); // año bisiesto
});

test("El cálculo vive fuera de los archivos de navegador", () => {
  const source = readFileSync(join(root, "src/lib/admin/schedule-range.ts"), "utf8");
  assert.doesNotMatch(source, /^"use client";/m);
  assert.match(source, /export function sessionsBoardFrom/);
});

/**
 * Next no permite llamar una función suelta exportada desde un archivo
 * `"use client"` en el servidor. Esto ya rompió la pantalla de horarios
 * (digest 3768277961): acá se revisa el árbol real para que no vuelva a pasar.
 */
const RULE = /^["']use client["']/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

function isClientModule(file) {
  return RULE.test(readFileSync(file, "utf8").trimStart());
}

/** Nombres que un archivo importa como valor (no como tipo) desde `from`. */
function valueImportsFrom(source, from) {
  const names = [];
  const pattern = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) continue;
    if (match[3] !== from) continue;
    for (const part of match[2].split(",")) {
      const spec = part.trim();
      if (!spec || spec.startsWith("type ")) continue;
      names.push(spec.split(/\s+as\s+/)[0].trim());
    }
  }
  return names;
}

const appFiles = walk(join(root, "src/app"));
const clientModules = new Set(
  walk(join(root, "src/components"))
    .filter(isClientModule)
    .map((file) => "@/components/" + relative(join(root, "src/components"), file).replace(/\.(tsx?|js)$/, "")),
);

test("Ninguna página del servidor llama funciones sueltas de un archivo de navegador", () => {
  const offenders = [];
  for (const file of appFiles) {
    if (isClientModule(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const from of clientModules) {
      for (const name of valueImportsFrom(source, from)) {
        // Desde el servidor solo se pueden importar componentes (con mayúscula).
        if (!/^[A-Z]/.test(name)) {
          offenders.push(`${relative(root, file)} importa ${name} de ${from}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("La regla detecta el caso que rompió horarios", () => {
  const source =
    'import { ScheduleSessions, sessionsBoardFrom } from "@/components/admin/schedule-sessions";';
  const names = valueImportsFrom(source, "@/components/admin/schedule-sessions");
  assert.deepEqual(names, ["ScheduleSessions", "sessionsBoardFrom"]);
  assert.deepEqual(names.filter((name) => !/^[A-Z]/.test(name)), ["sessionsBoardFrom"]);
});
