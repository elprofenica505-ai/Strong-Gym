// El aviso de vigencias: qué se da de baja al anular un cobro y qué quedó
// anulado después. Son textos que la persona lee justo antes de confirmar, así
// que se prueban las dos frases y los casos en que no hay nada que decir.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessLabel,
  parseVoidPlanImpact,
  planImpactDone,
  planImpactWarning,
} from "../src/lib/finance/voids.ts";

const segment = (over = {}) => ({
  id: "5acb745b-65ee-4e42-a736-b1a8479dccae",
  planId: "pln_gimnasio",
  planName: "Gimnasio",
  access: "gym",
  startedOn: "2026-10-28",
  expiresOn: "2026-11-26",
  pricePaid: 560,
  currency: "NIO",
  voided: false,
  state: "active",
  ...over,
});

test("antes de anular dice qué vigencia se da de baja y con qué fechas", () => {
  const aviso = planImpactWarning([segment()]);
  assert.match(aviso ?? "", /Este cobro activó la vigencia de Gimnasio: del 28 de octubre de 2026 al 26 de noviembre de 2026/);
  assert.match(aviso ?? "", /se da de baja/);
  assert.match(aviso ?? "", /se adelantan/);
});

test("con dos accesos, el aviso los nombra a los dos", () => {
  const aviso = planImpactWarning([
    segment(),
    segment({
      id: "otra",
      access: "class",
      planName: "Zumba",
      startedOn: "2026-10-28",
      expiresOn: "2026-11-26",
    }),
  ]);
  assert.match(aviso ?? "", /las vigencias de Gimnasio: del 28 de octubre de 2026 al 26 de noviembre de 2026; Clases: del 28 de octubre de 2026 al 26 de noviembre de 2026/);
  assert.match(aviso ?? "", /se dan de baja/);
});

test("un cobro sin vigencia no inventa advertencia", () => {
  assert.equal(planImpactWarning([]), null);
  assert.equal(planImpactWarning([segment({ state: "expired" })]), null);
});

test("una vigencia ya anulada no se anuncia como si estuviera viva", () => {
  assert.equal(planImpactWarning([segment({ voided: true, state: "voided" })]), null);
});

test("después de anular cuenta la vigencia que quedó anulada", () => {
  const hecho = planImpactDone([segment({ voided: true, state: "voided" })]);
  assert.match(hecho ?? "", /quedó anulada: Gimnasio: del 28 de octubre de 2026 al 26 de noviembre de 2026/);
  assert.match(hecho ?? "", /sin perder días/);
});

test("si no se anuló ninguna vigencia, no se afirma nada", () => {
  assert.equal(planImpactDone([]), null);
  assert.equal(planImpactDone([segment()]), null);
});

test("lo que devuelve la base se valida antes de dibujarlo", () => {
  const parsed = parseVoidPlanImpact([
    { ...segment(), pricePaid: null },
    { id: "rota" },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].pricePaid, null);
});

test("un estado desconocido no se dibuja", () => {
  assert.deepEqual(parseVoidPlanImpact([{ ...segment(), state: "inventado" }]), []);
  assert.deepEqual(parseVoidPlanImpact("no es una lista"), []);
});

test("los accesos se nombran como en el gimnasio", () => {
  assert.equal(accessLabel("gym"), "Gimnasio");
  assert.equal(accessLabel("boxing"), "Boxeo");
  assert.equal(accessLabel("class"), "Clases");
});
