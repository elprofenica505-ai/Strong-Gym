import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validBirthDate, todayInManagua } from "../src/lib/age/birth-date.ts";
import { HEALTH_CONSENT_VERSION } from "../src/lib/nutrition/consent.ts";

// 2026-10-21 en Managua (UTC-6): 2026-10-21 12:00 local = 18:00 UTC.
const now = new Date("2026-10-21T18:00:00Z");

test("fecha de hoy se toma en America/Managua", () => {
  assert.equal(todayInManagua(now), "2026-10-21");
  // 2026-10-22 03:00 UTC todavía es 21 de octubre en Managua.
  assert.equal(todayInManagua(new Date("2026-10-22T03:00:00Z")), "2026-10-21");
});

test("valida fechas reales, no futuras y desde 1920", () => {
  assert.equal(validBirthDate("1990-03-10", now), true);
  assert.equal(validBirthDate("2026-10-21", now), true, "hoy es válido como fecha, la edad la decide SQL");
  assert.equal(validBirthDate("2026-10-22", now), false, "futura");
  assert.equal(validBirthDate("1919-12-31", now), false, "antes de 1920");
  assert.equal(validBirthDate("2025-02-29", now), false, "no existe ese día");
  assert.equal(validBirthDate("10/03/1990", now), false, "formato");
  assert.equal(validBirthDate("", now), false, "vacío");
});

test("la versión del consentimiento coincide con la función SQL de la migración 00047", () => {
  const sql = readFileSync(new URL("../supabase/migrations/00047_menores_consentimiento_aprobacion.sql", import.meta.url), "utf8");
  assert.ok(sql.includes(`select '${HEALTH_CONSENT_VERSION}'::text`), "health_consent_version() debe devolver la misma versión");
});
