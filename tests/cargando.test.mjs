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
  assert.match(css, /@keyframes flame-a/);
  assert.match(css, /@keyframes ember-rise/);
  assert.match(css, /@keyframes fire-sweep/);
  assert.match(css, /rgb\(251 191 36/);

  const fire = source("src/components/layout/fire-transition.tsx");
  assert.match(fire, /Cargando…/);
  assert.match(fire, /role="status"/);
  assert.match(fire, /aria-live="polite"/);
  assert.match(fire, /fire-flame-tongue/);
  assert.match(fire, /fire-ember/);
  assert.match(fire, /fire-glow/);
  assert.match(fire, /fire-halo/);
  // Lenguas dibujadas: una silueta por llama, no una esfera.
  assert.match(fire, /function flamePath/);
  assert.match(fire, /<path d=\{d\}/);
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
  assert.match(fire, /MIN_VISIBLE_MS = 1_100/);
  assert.match(fire, /FADE_OUT_MS = 320/);
  // Y no aparece si la pantalla abre al instante: primero espera 120 ms.
  assert.match(fire, /SHOW_DELAY_MS = 120/);
  assert.match(fire, /revealTimer = setTimeout\(reveal, SHOW_DELAY_MS\)/);
  // Mientras cubre no deja tocar dos veces.
  assert.match(css, /\.fire-overlay \{[^}]*pointer-events: auto/);
  // Nada de filtros de desenfoque: en Android dejan manchas de GPU.
  assert.doesNotMatch(css, /\.fire-(overlay|stage|bed|tongue)[^}]*backdrop-filter/);
  assert.doesNotMatch(fire, /backdrop-blur/);
});

test("la animación respeta «reducir movimiento» sin congelarse", () => {
  const css = source("src/app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  // Con la opción activada no hay desplazamientos…
  assert.match(css, /\.fire-stage,\s*\n\s*\.fire-ember,\s*\n\s*\.fire-line \{\s*\n\s*animation: none/);
  // …pero el fuego late: una imagen fija parecía que la app se colgó.
  assert.match(css, /\.fire-glow,\s*\n\s*\.fire-flame-tongue \{\s*\n\s*animation: fire-calm/);
  assert.match(css, /@keyframes fire-calm/);
  assert.match(css, /@keyframes fire-calm \{[\s\S]{0,120}opacity/);
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
  assert.match(bar, /setTimeout\(\(\) => \{[\s\S]{0,120}fadeOut\(\);[\s\S]{0,20}\}, giveUpAfter\)/);
  // «Atrás» con la misma ruta no se queda colgado los 8 s completos.
  assert.match(bar, /start\(null, 3_000\)/);
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

test("el fuego se mueve de verdad: lenguas onduladas, cada una a su ritmo", () => {
  const css = source("src/app/globals.css");
  const fire = source("src/components/layout/fire-transition.tsx");

  // Siete lenguas, cada una con su ritmo, su retraso y su mecido: el
  // movimiento viene de piezas desfasadas.
  assert.match(fire, /const FLAMES: readonly Flame\[\]/);
  const flames = fire.slice(fire.indexOf("const FLAMES"), fire.indexOf("/** Chispas:"));
  assert.equal((flames.match(/left: \d+/g) ?? []).length, 7);
  for (const motion of ["flame-a", "flame-b", "flame-c"]) {
    assert.match(css, new RegExp(`@keyframes ${motion}`));
  }
  assert.match(fire, /"--motion": `flame-\$\{flame\.motion\}`/);

  // La silueta es una llama: base llena y punta larga que se afina.
  assert.match(fire, /Math\.min\(1, Math\.pow\(1 - t, 1\.3\)/);
  // Y ondula: el centro se desvía con una onda que crece hacia la punta.
  assert.match(fire, /const wobble = Math\.sin\(t \* Math\.PI \* 2 \* waves \+ phase\)/);
  assert.match(fire, /Math\.pow\(t, 1\.3\)/);

  // Cada mecido mueve en los dos ejes y estira la llama: no es un parpadeo.
  const move = css.slice(css.indexOf("@keyframes flame-a"), css.indexOf("@keyframes ember-rise"));
  assert.match(move, /translate3d\(1\.2%, -3%, 0\) scaleY\(1\.06\) skewX\(1\.6deg\)/);
  assert.match(move, /translate3d\(-1\.4%, -5%, 0\) scaleY\(1\.08\)/);
  assert.match(move, /translate3d\(-1\.2%, -4\.5%, 0\)/);

  // Y dura lo suficiente para que el ojo lo vea.
  assert.match(fire, /MIN_VISIBLE_MS = 1_100/);
});

test("el fuego no usa filtros de desenfoque en ninguna pieza", () => {
  const css = source("src/app/globals.css");
  const fire = source("src/components/layout/fire-transition.tsx");
  // Sin comentarios: ahí sí se nombran los filtros, para explicar que no van.
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = code.slice(code.indexOf(".fire-overlay {"), code.indexOf("@keyframes fire-flicker"));
  assert.doesNotMatch(block, /blur\(/);
  assert.doesNotMatch(block, /backdrop-filter/);
  assert.doesNotMatch(block, /[{;]\s*filter:/);
  // El emblema tampoco lleva sombra difusa: un filtro en Android deja manchas.
  assert.doesNotMatch(fire.replace(/\/\*[\s\S]*?\*\//g, ""), /drop-shadow/);
});

test("la capa es opaca: la pantalla vieja no se transparenta", () => {
  const css = source("src/app/globals.css");
  const overlay = css.slice(css.indexOf(".fire-overlay {"), css.indexOf(".fire-overlay[data-state"));
  // Degradado con colores sólidos, sin alfa: tapa de verdad.
  assert.match(overlay, /background: radial-gradient\(120% 85% at 50% 108%, #1c0a06 0%/);
  assert.doesNotMatch(overlay, /rgb\([^)]*\/ 0\.\d+\)/);
});
