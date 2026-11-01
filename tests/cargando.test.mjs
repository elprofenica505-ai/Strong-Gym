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
 * La respuesta tiene dos capas, y **ninguna** vacía la pantalla:
 *   1. Una cinta de brasas arriba con «Cargando…» en cuanto se toca cualquier
 *      enlace interno (NavigationProgress). Lo que había sigue a la vista.
 *   2. Un ícono de fuego dentro de la misma tarjeta o módulo tocado
 *      (LinkPending).
 *
 * Se probó también una pantalla de esqueleto gris (loading.tsx) y el gimnasio la
 * rechazó: las letras e imágenes desaparecían y daba sensación de pausa. Queda
 * prohibido volver a ponerla: la prueba de abajo lo impide.
 */
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("el aviso de carga está montado y es una cascada de fuego", () => {
  const layout = source("src/app/[locale]/layout.tsx");
  assert.match(layout, /<NavigationProgress \/>/);
  assert.match(layout, /@\/components\/layout\/navigation-progress/);

  // Fuego de marca: barrido rojo→naranja→ámbar, chispas y llama que titila.
  const css = source("src/app/globals.css");
  assert.match(css, /@keyframes fire-sweep/);
  assert.match(css, /@keyframes fire-spark/);
  assert.match(css, /@keyframes fire-flicker/);
  assert.match(css, /\.fire-bar-slow/);
  assert.match(css, /rgb\(251 191 36/);

  const bar = source("src/components/layout/navigation-progress.tsx");
  assert.match(bar, /Cargando…/);
  assert.match(bar, /role="status"/);
  assert.match(bar, /aria-live="polite"/);
  assert.match(bar, /fire-bar/);
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
