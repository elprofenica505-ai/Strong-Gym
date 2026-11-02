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
 * Lo que el gimnasio pidió, después de dos intentos:
 *   1. **Nada** de esqueletos grises que borren letras e imágenes (se probó y se
 *      rechazó: daba sensación de pausa).
 *   2. Una **capa de fuego a pantalla completa** que cubra la interfaz durante
 *      la espera entre módulos y se retire sola al terminar (FireTransition).
 *   3. Un ícono de llama dentro de la tarjeta o módulo tocado (LinkPending),
 *      para saber cuál de todos está abriendo.
 *
 * Las pruebas de abajo fijan las tres cosas.
 */
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("la capa de fuego está montada en el layout", () => {
  const layout = source("src/app/[locale]/layout.tsx");
  assert.match(layout, /<FireTransition \/>/);
  assert.match(layout, /@\/components\/layout\/fire-transition/);

  // Fuego de marca: lecho de brasas, lenguas, chispas y hilo encendido.
  const css = source("src/app/globals.css");
  assert.match(css, /@keyframes fire-breathe/);
  assert.match(css, /@keyframes fire-lick/);
  assert.match(css, /@keyframes ember-rise/);
  assert.match(css, /@keyframes fire-sweep/);
  assert.match(css, /rgb\(251 191 36/);

  const fire = source("src/components/layout/fire-transition.tsx");
  assert.match(fire, /Cargando…/);
  assert.match(fire, /role="status"/);
  assert.match(fire, /aria-live="polite"/);
  assert.match(fire, /fire-bed/);
  assert.match(fire, /fire-tongue/);
  assert.match(fire, /fire-ember/);
});

test("la capa cubre toda la interfaz y no se queda pegada", () => {
  const css = source("src/app/globals.css");
  assert.match(css, /\.fire-overlay \{[^}]*position: fixed/);
  assert.match(css, /\.fire-overlay \{[^}]*inset: 0/);
  assert.match(css, /\.fire-overlay \{[^}]*z-index: 80/);
  // Cubre de verdad: sin transparencia que deje ver la pantalla a medio pintar.
  assert.match(css, /\.fire-overlay \{[^}]*opacity: 0/);
  assert.match(css, /\.fire-overlay\[data-state="shown"\] \{\s*opacity: 1;/);

  const fire = source("src/components/layout/fire-transition.tsx");
  // Se apaga sola si la pantalla nueva no llega.
  assert.match(fire, /GIVE_UP_MS = 8_000/);
  // Dura un mínimo y se desvanece: ni parpadeo ni corte seco.
  assert.match(fire, /MIN_VISIBLE_MS = 480/);
  assert.match(fire, /FADE_OUT_MS = 260/);
  // Y no aparece si la pantalla abre al instante: primero espera 140 ms.
  assert.match(fire, /SHOW_DELAY_MS = 140/);
  assert.match(fire, /revealTimer = setTimeout\(reveal, SHOW_DELAY_MS\)/);
  // Mientras cubre no deja tocar dos veces.
  assert.match(css, /\.fire-overlay \{[^}]*pointer-events: auto/);
  // Nada de filtros de desenfoque: en Android dejan manchas de GPU.
  assert.doesNotMatch(css, /\.fire-(overlay|stage|bed|tongue)[^}]*backdrop-filter/);
  assert.doesNotMatch(fire, /backdrop-blur/);
});

test("la animación respeta «reducir movimiento»", () => {
  const css = source("src/app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.fire-bed,[\s\S]{0,200}animation: none/);
});

test("la capa no rompe la navegación ni cambia de pantalla por su cuenta", () => {
  const bar = source("src/components/layout/fire-transition.tsx");
  // Observa el toque: nunca cancela el enlace ni cambia la navegación.
  assert.doesNotMatch(bar, /preventDefault\(\)/);
  assert.doesNotMatch(bar, /router\.push/);
  // Ignora lo que no es una pantalla nueva de esta app.
  assert.match(bar, /url\.origin !== window\.location\.origin/);
  assert.match(bar, /anchor\.target/);
  assert.match(bar, /hasAttribute\("download"\)/);
  // Si la dirección no cambia, se apaga sola.
  assert.match(bar, /GIVE_UP_MS/);
  assert.match(bar, /setTimeout\(\(\) => \{[\s\S]{0,120}fadeOut\(\);[\s\S]{0,20}\}, GIVE_UP_MS\)/);
});

test("la tarjeta tocada muestra su propio ícono de carga", () => {
  const link = source("src/components/ui/link-pending.tsx");
  assert.match(link, /useLinkStatus/);
  assert.match(link, /if \(!pending\) return null/);

  // Navegación del panel y tarjetas del inicio del panel.
  assert.match(source("src/components/admin/panel-nav.tsx"), /<LinkPending/);
  assert.match(source("src/app/[locale]/panel/page.tsx"), /<LinkPending/);
});

test("cambiar de pantalla NO vacía la vista ni la deja en gris", () => {
  // El esqueleto gris se quitó a pedido del gimnasio: parecía una pausa.
  for (const path of [
    "../src/app/[locale]/loading.tsx",
    "../src/app/[locale]/panel/loading.tsx",
  ]) {
    assert.equal(
      existsSync(new URL(path, import.meta.url)),
      false,
      `volvió a aparecer ${path}: no debe vaciar la pantalla al navegar`,
    );
  }
  // Y no queda ningún bloque gris de relleno en el código de avisos.
  const spinner = source("src/components/ui/spinner.tsx");
  assert.doesNotMatch(spinner, /animate-pulse/);
  assert.doesNotMatch(spinner, /LoadingSkeleton/);
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

test("los paneles que leen datos muestran la llama, no un texto solo", () => {
  assert.match(source("src/components/admin/cash-session-panel.tsx"), /title="Leyendo la caja…"/);
  assert.match(source("src/components/products/product-manager.tsx"), /title="Cargando productos…"/);
  assert.match(source("src/components/nutrition/nutrition-calculator.tsx"), /LoadingBlock/);
  // El aviso lleva la llama y la cinta de brasas, sin tapar la tarjeta.
  assert.match(source("src/components/ui/spinner.tsx"), /fire-flame/);
  assert.match(source("src/components/ui/link-pending.tsx"), /fire-flame/);
  // El arqueo avisa mientras abre y mientras cierra.
  const cash = source("src/components/admin/cash-session-panel.tsx");
  assert.match(cash, /Abriendo la caja…/);
  assert.match(cash, /Cerrando la caja…/);
  assert.match(cash, /aria-busy=/);
});
