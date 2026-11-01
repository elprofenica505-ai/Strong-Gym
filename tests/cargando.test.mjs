import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/**
 * «Cargando»: que la app nunca se vea congelada.
 *
 * Lo que pedía el dueño: al tocar un módulo, una tarjeta o al entrar después
 * del segundo factor, la pantalla se quedaba quieta y no había ninguna figura
 * que confirmara que estaba trabajando; la gente tocaba dos veces.
 *
 * La respuesta tiene tres capas:
 *   1. Una barra arriba con «Cargando…» en cuanto se toca cualquier enlace
 *      interno (NavigationProgress).
 *   2. Un giro dentro de la misma tarjeta o módulo tocado (LinkPending).
 *   3. Un esqueleto con «Cargando…» mientras el servidor prepara la pantalla
 *      (panel/loading.tsx).
 */
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("la barra de avance está montada y trae su animación", () => {
  const layout = source("src/app/[locale]/layout.tsx");
  assert.match(layout, /<NavigationProgress \/>/);
  assert.match(layout, /@\/components\/layout\/navigation-progress/);

  const css = source("src/app/globals.css");
  assert.match(css, /@keyframes nav-progress/);
  assert.match(css, /--animate-nav-progress:/);

  const bar = source("src/components/layout/navigation-progress.tsx");
  assert.match(bar, /Cargando…/);
  assert.match(bar, /role="status"/);
  assert.match(bar, /aria-live="polite"/);
});

test("la barra no rompe la navegación ni se queda pegada mintiendo", () => {
  const bar = source("src/components/layout/navigation-progress.tsx");
  // Observa el toque: nunca cancela el enlace ni cambia la navegación.
  assert.doesNotMatch(bar, /preventDefault\(\)/);
  assert.doesNotMatch(bar, /router\.push/);
  // Ignora lo que no es una pantalla nueva de esta app.
  assert.match(bar, /url\.origin !== window\.location\.origin/);
  assert.match(bar, /anchor\.target/);
  assert.match(bar, /hasAttribute\("download"\)/);
  // Si la dirección no cambia, se apaga sola.
  assert.match(bar, /GIVE_UP_MS/);
  assert.match(bar, /setTimeout\(stop, GIVE_UP_MS\)/);
});

test("la tarjeta tocada muestra su propio giro", () => {
  const link = source("src/components/ui/link-pending.tsx");
  assert.match(link, /useLinkStatus/);
  assert.match(link, /if \(!pending\) return null/);

  // Navegación del panel y tarjetas del inicio del panel.
  assert.match(source("src/components/admin/panel-nav.tsx"), /<LinkPending/);
  assert.match(source("src/app/[locale]/panel/page.tsx"), /<LinkPending/);
});

test("cambiar de pantalla del panel muestra esqueleto con «Cargando…»", () => {
  const path = new URL("../src/app/[locale]/panel/loading.tsx", import.meta.url);
  assert.ok(existsSync(path), "falta panel/loading.tsx");
  const loading = readFileSync(path, "utf8");
  assert.match(loading, /Cargando…/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /animate-pulse/);
});

test("los botones que esperan respuesta avisan y no se pueden tocar dos veces", () => {
  const button = source("src/components/ui/button.tsx");
  assert.match(button, /loading\?: boolean/);
  assert.match(button, /disabled=\{disabled \|\| loading\}/);
  assert.match(button, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(button, /<Spinner size="sm" \/>/);

  // Entrada con correo, contraseña y segundo factor.
  assert.match(source("src/components/auth/auth-form.tsx"), /Loader2 className="size-4 animate-spin"/);
  assert.match(source("src/components/auth/mfa-setup.tsx"), /<Button type="submit" loading=\{busy\}/);
  assert.match(source("src/components/auth/recovery-form.tsx"), /<Button type="submit" loading=\{busy\}/);
});

test("los paneles que leen datos muestran el giro, no un texto solo", () => {
  assert.match(source("src/components/admin/cash-session-panel.tsx"), /title="Leyendo la caja…"/);
  assert.match(source("src/components/products/product-manager.tsx"), /title="Cargando productos…"/);
  assert.match(source("src/components/nutrition/nutrition-calculator.tsx"), /LoadingBlock/);
  // El arqueo avisa mientras abre y mientras cierra.
  const cash = source("src/components/admin/cash-session-panel.tsx");
  assert.match(cash, /Abriendo la caja…/);
  assert.match(cash, /Cerrando la caja…/);
  assert.match(cash, /aria-busy=/);
});
