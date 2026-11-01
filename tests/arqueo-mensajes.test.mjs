import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLOSE_SUCCESS_BALANCED,
  checkClose,
  closeSavedWithDifference,
} from "../src/lib/finance/cash-session.ts";

/**
 * Cierre de caja: qué se dice y cuándo.
 *
 * Pedido del dueño, tal cual: mientras el cajero escribe **no** se le avisa si
 * falta o sobra dinero. Al tocar «Cerrar caja» pasan dos cosas, y sólo dos:
 *   · cuadra  → se guarda y aparece un mensaje verde de operación exitosa;
 *   · no cuadra → se abre un panel rojo que pide el motivo, y todavía no se
 *     guarda nada hasta que lo escriba.
 */
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("si cuadra, se guarda y el mensaje verde es el pedido", () => {
  const check = checkClose({
    expected: { nio: 1700, usd: 20 },
    counted: { nio: 1700, usd: 20 },
    notes: "",
  });
  assert.equal(check.status, "ready");
  assert.equal(check.status === "ready" && check.balanced, true);
  assert.equal(check.status === "ready" && check.differenceNio, 0);
  assert.equal(CLOSE_SUCCESS_BALANCED, "Operación exitosa, gracias por tus servicios, Bendiciones!");
});

test("si falta plata y no hay motivo, no se guarda: se pide el motivo", () => {
  const check = checkClose({
    expected: { nio: 1700, usd: 20 },
    counted: { nio: 1650, usd: 20 },
    notes: "   ",
  });
  assert.equal(check.status, "needs_reason");
  assert.equal(check.status === "needs_reason" && check.differenceNio, -50);
  assert.equal(check.status === "needs_reason" && check.differenceUsd, 0);
});

test("si sobra plata en dólares también se pide el motivo", () => {
  const check = checkClose({
    expected: { nio: 100, usd: 20 },
    counted: { nio: 100, usd: 25 },
    notes: "",
  });
  assert.equal(check.status, "needs_reason");
  assert.equal(check.status === "needs_reason" && check.differenceUsd, 5);
});

test("con el motivo escrito, el cierre con diferencia sí se guarda", () => {
  const check = checkClose({
    expected: { nio: 1700, usd: 20 },
    counted: { nio: 1650, usd: 20 },
    notes: "Faltaron C$50: no se pudo dar vuelto en un cobro.",
  });
  assert.equal(check.status, "ready");
  assert.equal(check.status === "ready" && check.balanced, false);
  assert.equal(check.status === "ready" && check.differenceNio, -50);
});

test("el motivo demasiado largo se rechaza antes de mandar nada", () => {
  const check = checkClose({
    expected: { nio: 10, usd: 0 },
    counted: { nio: 5, usd: 0 },
    notes: "x".repeat(501),
  });
  assert.equal(check.status, "invalid");
});

test("el aviso del cierre con diferencia dice qué faltó, en su moneda", () => {
  const texto = closeSavedWithDifference({ nio: -50, usd: 0 });
  assert.match(texto, /faltaron/);
  assert.match(texto, /50/);
  assert.match(texto, /córdobas/);
  assert.match(texto, /Últimos cierres/);
  const dolares = closeSavedWithDifference({ nio: 0, usd: 5 });
  assert.match(dolares, /sobraron/);
  assert.match(dolares, /dólares/);
});

test("la pantalla ya no adelanta la diferencia mientras se escribe", () => {
  const panel = source("src/components/admin/cash-session-panel.tsx");
  // Nada de cálculo en vivo de la diferencia: se fue el bloque que mostraba
  // «Córdobas: Falta C$50 · Dólares: Cuadra exacto» antes de guardar.
  assert.doesNotMatch(panel, /liveDifference/);
  assert.doesNotMatch(panel, /bothCounted/);
  assert.doesNotMatch(panel, /para ver si cuadra/);
  // La diferencia sólo aparece cuando el intento de cierre la destapa.
  assert.match(panel, /closeBlocked/);
  assert.match(panel, /El cuadre de caja no cuadró correctamente/);
  // El motivo está en un campo que sólo existe si no cuadró.
  assert.match(panel, /\{closeBlocked \? \(\s*<label className=\{labelClass\}>/);
  assert.match(panel, /Motivo del faltante o sobrante \(obligatorio\)/);
  // Y el verde del cierre que cuadra es el mensaje pedido.
  assert.match(panel, /setNotice\(CLOSE_SUCCESS_BALANCED\)/);
});

test("el panel rojo no se muestra si todavía no se intentó cerrar", () => {
  const panel = source("src/components/admin/cash-session-panel.tsx");
  // El estado arranca vacío y sólo lo llena el intento de cierre que no cuadra.
  assert.match(panel, /useState<\{[\s\S]{0,80}nio: number;[\s\S]{0,40}usd: number;[\s\S]{0,20}\} \| null>\(null\)/);
  assert.match(panel, /setCloseBlocked\(\{ nio: check\.differenceNio, usd: check\.differenceUsd \}\)/);
});
