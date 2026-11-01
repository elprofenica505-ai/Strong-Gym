import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CASH_NOTES_MAX,
  EXPECTED_FILL_NOTE,
  canPrefillExpected,
  markExpectedFill,
} from "../src/lib/finance/cash-session.ts";

/**
 * «Usar lo esperado» y el control de faltantes.
 *
 * El botón rellena lo contado con lo que la base calcula. Eso es cómodo y es
 * peligroso: si el cajero lo toca, un faltante de C$200 se convierte en un
 * cierre «que cuadra», sin diferencia y sin motivo. Por eso se ofrece sólo a
 * administración y, cuando se usa, deja constancia en la nota del cierre.
 */
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("sólo el administrador puede rellenar el arqueo con lo esperado", () => {
  assert.equal(canPrefillExpected("admin"), true);
});

test("caja no puede rellenar el arqueo, aunque tenga todos los permisos", () => {
  assert.equal(canPrefillExpected("cashier"), false);
  assert.equal(canPrefillExpected("trainer"), false);
  assert.equal(canPrefillExpected("member"), false);
  assert.equal(canPrefillExpected("staff"), false);
  assert.equal(canPrefillExpected(null), false);
  assert.equal(canPrefillExpected(undefined), false);
  // Ni variantes escritas a mano ni comodines.
  assert.equal(canPrefillExpected("Admin"), false);
  assert.equal(canPrefillExpected("administrador"), false);
  assert.equal(canPrefillExpected("*"), false);
});

test("usar lo esperado deja constancia; no se pisa el motivo ya escrito", () => {
  assert.equal(markExpectedFill(""), EXPECTED_FILL_NOTE);
  assert.equal(markExpectedFill("   "), EXPECTED_FILL_NOTE);
  assert.equal(
    markExpectedFill("Turno sin novedades."),
    `Turno sin novedades. · ${EXPECTED_FILL_NOTE}`,
  );
  // Tocar dos veces no duplica el aviso.
  const once = markExpectedFill("Turno sin novedades.");
  assert.equal(markExpectedFill(once), once);
  // Una nota que ya no entra en el largo permitido se deja intacta.
  const long = "x".repeat(CASH_NOTES_MAX - 5);
  assert.equal(markExpectedFill(long), long);
});

test("la pantalla de caja muestra el botón sólo cuando llega el permiso", () => {
  const panel = source("src/components/admin/cash-session-panel.tsx");
  // El botón vive dentro de la condición, no al lado.
  assert.match(
    panel,
    /\{canPrefillExpected \? \(\s*<button[\s\S]{0,1200}?Usar lo esperado/,
  );
  // Y la condición viene apagada por defecto: sin prop, no hay botón.
  assert.match(panel, /canPrefillExpected = false/);
  // Al usarlo se anota en el cierre, no se rellena en silencio.
  assert.match(panel, /setCloseNotes\(\(current\) => markExpectedFill\(current\)\)/);
});

test("caja recibe el permiso desde el rol real, no desde el navegador", () => {
  const page = source("src/app/[locale]/panel/caja/page.tsx");
  assert.match(
    page,
    /canPrefillExpected\(user\?\.role\) && user\?\.mfa === "ok"/,
  );
  assert.match(page, /canPrefillExpected=\{fillExpected\}/);
  // En demo no se abre la puerta.
  assert.match(page, /const fillExpected = !isDemo &&/);
  // El panel de caja pasa el permiso al arqueo.
  const panel = source("src/components/admin/cash-panel.tsx");
  assert.match(panel, /<CashSessionPanel[\s\S]{0,200}canPrefillExpected=\{canPrefillExpected\}/);
});

test("al cajero se le explica que la diferencia se justifica, no se rellena", () => {
  const panel = source("src/components/admin/cash-session-panel.tsx");
  assert.match(panel, /el faltante no se puede tapar rellenando con/);
  // El motivo obligatorio cuando no cuadra sigue en su lugar.
  assert.match(panel, /needsReason \? "Motivo del faltante o sobrante \(obligatorio\)"/);
});
