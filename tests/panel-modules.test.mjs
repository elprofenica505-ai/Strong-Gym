import { test } from "node:test";
import assert from "node:assert/strict";
import { activeModuleId, panelAccess, visibleModules } from "../src/lib/admin/modules.ts";

const ids = (mods) => mods.map((m) => m.id);
const childIds = (mods, id) => mods.find((m) => m.id === id)?.children.map((c) => c.id) ?? [];

test("administrador ve todos los módulos y todas sus secciones", () => {
  const mods = visibleModules("admin");
  assert.deepEqual(ids(mods), ["inicio", "clientes", "finanzas", "operacion", "administracion"]);
  assert.deepEqual(childIds(mods, "finanzas"), ["caja", "cuentas", "gastos", "reportes"]);
  assert.deepEqual(childIds(mods, "administracion"), ["roles", "importar", "herramientas", "ayuda"]);
});

test("caja ve finanzas, clientes y operación, pero no reportes ni administración", () => {
  const mods = visibleModules("cashier");
  assert.deepEqual(ids(mods), ["inicio", "clientes", "finanzas", "operacion"]);
  assert.deepEqual(childIds(mods, "finanzas"), ["caja", "cuentas", "gastos"]);
  assert.equal(mods.some((m) => m.id === "administracion"), false);
});

test("entrenador y cliente no ven módulos de gestión", () => {
  assert.deepEqual(visibleModules("trainer"), []);
  assert.deepEqual(visibleModules("member"), []);
  assert.deepEqual(visibleModules(null), []);
  assert.equal(panelAccess("trainer"), "none");
});

test("el rol staff retirado no tiene acceso a módulos", () => {
  assert.deepEqual(visibleModules("staff"), []);
});

test("modo demo muestra todo para poder revisar el diseño", () => {
  assert.equal(visibleModules(null, true).length, 5);
});

test("la sección activa es la más específica", () => {
  const mods = visibleModules("admin");
  assert.equal(activeModuleId("/panel", mods), "inicio");
  assert.equal(activeModuleId("/panel/caja", mods), "finanzas");
  assert.equal(activeModuleId("/panel/finanzas", mods), "finanzas");
  assert.equal(activeModuleId("/panel/administracion/roles", mods), "administracion");
  assert.equal(activeModuleId("/panel/clientes", mods), "clientes");
  assert.equal(activeModuleId("/panel/operacion", mods), "operacion");
  assert.equal(activeModuleId("/panel/otra-cosa", mods), null);
});

test("un prefijo parcial no activa un módulo (/panel/cajas no es caja)", () => {
  const mods = visibleModules("admin");
  assert.equal(activeModuleId("/panel/cajas", mods), null);
});
