import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

/**
 * El parche de patches/braces+3.0.3.patch limita las llaves anidadas para
 * corregir GHSA-vfj7-8cjw-p6xm (desborde de pila al expandir un patrón
 * profundo). Estos casos comprueban que la corrección está aplicada y que
 * los patrones normales no cambian.
 */

const require = createRequire(import.meta.url);
const braces = require("braces");

test("un patrón con llaves muy anidadas se rechaza en vez de desbordar la pila", () => {
  const deep = "{".repeat(4900) + "a" + "}".repeat(4900);

  assert.throws(
    () => braces.expand(deep),
    (error) => error instanceof SyntaxError && /Nesting depth/.test(error.message),
  );
});

test("los patrones normales siguen expandiéndose igual", () => {
  assert.deepEqual(braces.expand("a{b,c}d"), ["abd", "acd"]);
  assert.deepEqual(braces.expand("x{1..3}"), ["x1", "x2", "x3"]);
});

test("la profundidad razonable para un glob se sigue aceptando", () => {
  const ok = "{".repeat(900) + "a" + "}".repeat(900);
  assert.doesNotThrow(() => braces.expand(ok));
});
