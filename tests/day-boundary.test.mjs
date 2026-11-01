import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLoader } from "./helpers/react-loader.mjs";

/**
 * OP-07: la fecha de las pantallas abiertas.
 *
 * El problema real: el gimnasio deja la tablet abierta en Horarios o en el
 * Panel, pasa la medianoche y la pantalla sigue mostrando «hoy» como ayer.
 *
 * Lo que se cuida acá: que el cálculo del día sea el de Managua y no el del
 * aparato, que la medianoche local sea la correcta (UTC−6 todo el año), que el
 * temporizador nunca quede en cero y que el refresco sea suave (no recargar la
 * página y perder lo escrito).
 */
const loader = createLoader();
const { managuaDayKey, nextManaguaMidnight, msUntilNextDayChange, dayChanged, MAX_TIMER_MS } =
  await loader("lib/time/day-boundary.ts");

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("el día es el de Managua, no el del aparato", () => {
  // 05:30 UTC del 1 de noviembre = 23:30 del 31 de octubre en Managua.
  assert.equal(managuaDayKey(new Date("2026-11-01T05:30:00Z")), "2026-10-31");
  // 06:00 UTC = medianoche del 1 de noviembre en Managua.
  assert.equal(managuaDayKey(new Date("2026-11-01T06:00:00Z")), "2026-11-01");
  // Un minuto antes de la medianoche siguiente sigue siendo el mismo día.
  assert.equal(managuaDayKey(new Date("2026-11-02T05:59:59Z")), "2026-11-01");
});

test("la próxima medianoche de Managua es a las 06:00 UTC", () => {
  assert.equal(
    nextManaguaMidnight(new Date("2026-11-01T05:30:00Z")).toISOString(),
    "2026-11-01T06:00:00.000Z",
  );
  assert.equal(
    nextManaguaMidnight(new Date("2026-11-01T06:00:00Z")).toISOString(),
    "2026-11-02T06:00:00.000Z",
  );
  // Cruzando fin de mes y de año.
  assert.equal(
    nextManaguaMidnight(new Date("2026-12-31T23:00:00Z")).toISOString(),
    "2027-01-01T06:00:00.000Z",
  );
});

test("el temporizador nunca queda en cero y despierta a más tardar en 15 minutos", () => {
  const justBefore = new Date("2026-11-02T05:59:59.500Z");
  const wait = msUntilNextDayChange(justBefore);
  assert.ok(wait >= 1000, "nunca menos de un segundo");
  assert.ok(wait <= MAX_TIMER_MS);

  const farAway = new Date("2026-11-01T12:00:00Z");
  assert.equal(msUntilNextDayChange(farAway), MAX_TIMER_MS);
});

test("sólo se refresca cuando el día cambió de verdad", () => {
  assert.equal(dayChanged("2026-11-01", new Date("2026-11-01T23:00:00Z")), false);
  assert.equal(dayChanged("2026-11-01", new Date("2026-11-02T07:00:00Z")), true);
  // Sin fecha previa no hay nada que comparar: no se refresca.
  assert.equal(dayChanged("", new Date("2026-11-02T07:00:00Z")), false);
});

test("el refresco es suave: no recarga la página ni pierde lo escrito", () => {
  const component = source("src/components/layout/day-boundary.tsx");
  assert.match(component, /router\.refresh\(\)/);
  assert.doesNotMatch(component, /location\.reload/);
  assert.doesNotMatch(component, /location\.href\s*=/);
  // También revisa cuando la pestaña vuelve a primer plano (la tablet dormida).
  assert.match(component, /visibilitychange/);
  assert.match(component, /pageshow/);
});

test("está montado en el layout para que alcance a Horarios, Panel y Mi cuenta", () => {
  const layout = source("src/app/[locale]/layout.tsx");
  assert.match(layout, /<DayBoundary \/>/);
  assert.match(layout, /@\/components\/layout\/day-boundary/);
});
