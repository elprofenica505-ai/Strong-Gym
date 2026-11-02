import test from "node:test";
import assert from "node:assert/strict";
import {
  hashKey,
  parseDecision,
  retryText,
  windowSeconds,
  WRITE_RULES,
} from "../src/lib/security/rate-limit-core.ts";

/**
 * Límite de abuso compartido (SEG-07).
 *
 * El problema que resuelve: el contador vivía en la memoria de cada instancia,
 * así que repartir el ataque entre servidores —o esperar un despliegue— lo
 * reiniciaba. Ahora cuenta la base, y esto es lo que se puede probar sin ella.
 */

test("la llave se guarda hasheada: nunca viaja una IP ni un correo", () => {
  const key = hashKey("contact", "190.12.34.56");
  assert.match(key, /^[0-9a-f]{60}$/);
  assert.ok(!key.includes("190.12"));
  // Estable: la misma entrada da la misma llave (si no, el contador no cuenta).
  assert.equal(key, hashKey("contact", "190.12.34.56"));
  // Distinta por ruta y por IP: dos formularios no comparten contador.
  assert.notEqual(key, hashKey("newsletter", "190.12.34.56"));
  assert.notEqual(key, hashKey("contact", "190.12.34.57"));
  // La sal cambia el resultado: sin la sal del servidor no se puede adivinar.
  assert.notEqual(key, hashKey("contact", "190.12.34.56", "otra-sal"));
});

test("la respuesta de la base se lee tal cual cuando permite", () => {
  const decision = parseDecision({ allowed: true, count: 2, limit: 5, remaining: 3, retry_after_seconds: 120 });
  assert.deepEqual(decision, { allowed: true, retryAfterSeconds: 0, source: "shared" });
});

test("cuando bloquea, dice cuántos segundos faltan y los acota", () => {
  const decision = parseDecision({ allowed: false, retry_after_seconds: 42 });
  assert.equal(decision?.allowed, false);
  assert.equal(decision?.retryAfterSeconds, 42);
  // Basura de la base: ni cero ni un año.
  assert.equal(parseDecision({ allowed: false, retry_after_seconds: 0 })?.retryAfterSeconds, 1);
  assert.equal(parseDecision({ allowed: false, retry_after_seconds: 999_999 })?.retryAfterSeconds, 86_400);
  assert.equal(parseDecision({ allowed: false })?.retryAfterSeconds, 60);
});

test("una respuesta rara no se interpreta: se usa el respaldo en memoria", () => {
  for (const bad of [null, undefined, "ok", 7, {}, { count: 3 }, { allowed: "sí" }]) {
    assert.equal(parseDecision(bad), null);
  }
});

test("la ventana se expresa en segundos y nunca queda en cero", () => {
  assert.equal(windowSeconds(WRITE_RULES.publicForm), 600);
  assert.equal(windowSeconds({ limit: 3, windowMs: 400 }), 1);
});

test("las reglas frenan al robot sin trabar a la persona que trabaja", () => {
  // Formularios públicos: pocos y separados.
  assert.ok(WRITE_RULES.publicForm.limit <= 10);
  assert.ok(WRITE_RULES.publicForm.windowMs >= 5 * 60 * 1000);
  // Dinero y progreso: holgados, para que una jornada real nunca los toque.
  assert.ok(WRITE_RULES.finance.limit >= 100);
  assert.ok(WRITE_RULES.progress.limit >= 50);
  assert.ok(WRITE_RULES.booking.limit >= 20);
});

test("el aviso a la persona lleva el número de segundos, no un hueco", () => {
  assert.equal(
    retryText("Esperá {seconds} segundos.", 42),
    "Esperá 42 segundos.",
  );
  assert.equal(retryText("Esperá {seconds} segundos.", 0), "Esperá 1 segundos.");
  assert.equal(retryText("Esperá {seconds} segundos.", 41.6), "Esperá 42 segundos.");
});
