// Uso de un plan e historial de precios (00086): los textos que se leen en
// Administración → Planes. Se prueban sin base ni navegador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";

const load = createLoader();
const {
  describePriceChange,
  formatPlanDay,
  parsePlanUsage,
  personValidityText,
  planMainPrice,
  priceHistoryLine,
  usageSummary,
} = await load("lib/plans/usage.ts");

const counts = (over = {}) => ({
  holders_active: 0,
  holders_upcoming: 0,
  sold_this_month: 0,
  last_price_change: null,
  ...over,
});

test("sin gente dice que nadie lo tiene, sin ceros de relleno", () => {
  assert.equal(usageSummary(counts()), "Todavía nadie lo tiene");
});

test("cuenta las personas vigentes y los cobros del mes", () => {
  assert.equal(
    usageSummary(counts({ holders_active: 12, sold_this_month: 9 })),
    "12 personas con el plan vigente · 9 cobros este mes",
  );
});

test("una sola persona se dice en singular", () => {
  assert.equal(
    usageSummary(counts({ holders_active: 1, sold_this_month: 1 })),
    "1 persona con el plan vigente · 1 cobro este mes",
  );
});

test("las personas que empiezan después se cuentan aparte", () => {
  assert.equal(
    usageSummary(counts({ holders_active: 2, holders_upcoming: 3 })),
    "2 personas con el plan vigente · 3 empiezan después",
  );
});

test("sin cobros este mes no se inventa el renglón", () => {
  assert.equal(usageSummary(counts({ holders_active: 4 })), "4 personas con el plan vigente");
});

test("el precio que manda es el de la vigencia, no la tarifa rápida", () => {
  const price = planMainPrice({ validity_amount: 560, validity_currency: "NIO", price_nio: 150 });
  assert.equal(price?.amount, 560);
  assert.match(price?.label ?? "", /560/);
});

test("sin importe de vigencia se usa la tarifa rápida", () => {
  const price = planMainPrice({ validity_amount: null, price_nio: "150" });
  assert.equal(price?.amount, 150);
  assert.equal(planMainPrice({}), null);
});

test("el renglón dice desde cuándo y cuánto costaba antes", () => {
  const line = priceHistoryLine({
    action: "edicion",
    before: { validity_amount: 560, validity_currency: "NIO" },
    after: { validity_amount: 600, validity_currency: "NIO" },
    changedAt: "2026-11-02T15:00:00Z",
    changedByName: "Carlos Sequeira",
  });
  assert.match(line ?? "", /600 desde el 2 de noviembre de 2026 \(antes .*560/);
});

test("un plan nuevo dice desde cuándo rige su precio, no un valor anterior inventado", () => {
  const line = priceHistoryLine({
    action: "alta",
    before: null,
    after: { validity_amount: 300, validity_currency: "NIO" },
    changedAt: "2026-10-31T18:00:00Z",
    changedByName: null,
  });
  assert.match(line ?? "", /desde el 31 de octubre de 2026/);
  assert.match(line ?? "", /primera carga/i);
  assert.doesNotMatch(line ?? "", /antes/);
});

test("sin historial no se escribe ninguna fecha", () => {
  assert.equal(priceHistoryLine(null), null);
});

test("un guardado que no cambió el precio no se anuncia como cambio", () => {
  const line = priceHistoryLine({
    action: "edicion",
    before: { validity_amount: 560, validity_currency: "NIO" },
    after: { validity_amount: 560, validity_currency: "NIO" },
    changedAt: "2026-11-02T15:00:00Z",
    changedByName: "Carlos Sequeira",
  });
  assert.equal(line, null);
});

test("el renglón del historial cuenta qué pasó con nombre y precio", () => {
  assert.equal(
    describePriceChange({
      action: "edicion",
      before: { validity_amount: 560, validity_currency: "NIO" },
      after: { validity_amount: 600, validity_currency: "NIO" },
      changedAt: "2026-11-02T15:00:00Z",
      changedByName: null,
    }),
    "Pasó a C$600 (antes C$560).",
  );
  assert.equal(
    describePriceChange({
      action: "alta",
      before: null,
      after: { validity_amount: 300, validity_currency: "NIO" },
      changedAt: "2026-10-31T18:00:00Z",
      changedByName: null,
    }),
    "Primera carga: C$300.",
  );
});

test("una persona vigente dice hasta cuándo y cuántos días le quedan", () => {
  assert.equal(
    personValidityText({
      clientId: "x",
      name: "Ana",
      startedOn: "2026-10-28",
      expiresOn: "2026-11-26",
      daysLeft: 27,
      pricePaid: 560,
      currency: "NIO",
      state: "active",
    }),
    "Hasta el 26 de noviembre de 2026 · quedan 27 días",
  );
});

test("el día que vence se dice vence hoy, no cero días", () => {
  assert.match(
    personValidityText({
      clientId: "x",
      name: "Ana",
      startedOn: "2026-10-01",
      expiresOn: "2026-10-30",
      daysLeft: 0,
      pricePaid: 560,
      currency: "NIO",
      state: "active",
    }),
    /vence hoy/,
  );
});

test("una vigencia que empieza después lo dice con su fecha", () => {
  const text = personValidityText({
    clientId: "x",
    name: "Carla",
    startedOn: "2026-11-03",
    expiresOn: "2026-12-02",
    daysLeft: 0,
    pricePaid: 560,
    currency: "NIO",
    state: "upcoming",
  });
  assert.match(text, /Empieza el 3 de noviembre de 2026/);
});

test("una fecha mal formada no se convierte en una fecha inventada", () => {
  assert.equal(formatPlanDay("no-es-fecha"), "no-es-fecha");
});

test("lo que devuelve la base se valida antes de dibujarlo", () => {
  const usage = parsePlanUsage({
    plan: { id: "pln_gimnasio", name_es: "Gimnasio mensual", validity_amount: 560 },
    today: "2026-10-31",
    people: [
      {
        clientId: "a",
        name: "Ana López",
        startedOn: "2026-10-28",
        expiresOn: "2026-11-26",
        daysLeft: 27,
        pricePaid: "560",
        currency: "NIO",
        state: "active",
      },
      { clientId: "b", name: "Sin fechas" },
    ],
    history: [{ action: "edicion", before: {}, after: {}, changedAt: "2026-11-02T15:00:00Z" }],
  });
  assert.equal(usage?.people.length, 1);
  assert.equal(usage?.people[0].pricePaid, 560);
  assert.equal(usage?.history.length, 1);
});

test("una respuesta rara no se dibuja como si no hubiera gente", () => {
  assert.equal(parsePlanUsage(null), null);
  assert.equal(parsePlanUsage({ people: [] }), null);
  assert.equal(parsePlanUsage("no es un objeto"), null);
});
