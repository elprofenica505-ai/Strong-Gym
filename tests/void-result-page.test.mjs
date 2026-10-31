import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";

/**
 * La pantalla de resultado de una anulación.
 *
 * Existe porque el 31 de octubre, cuatro veces seguidas, la anulación se
 * guardó en la base y el celular mostró un error: la respuesta del cobro no
 * llegaba completa. Esta página no recibe el resultado, lo **lee de la base**,
 * así que el estado que se muestra no depende de ningún cuerpo de respuesta.
 *
 * Lo que se prueba acá: que con la reversa guardada diga «quedó guardada» y
 * muestre el comprobante (incluido el stock devuelto), que sin reversa lo diga
 * y ofrezca reintentar, y que un error de lectura nunca se disfrace de
 * «no se anuló».
 */

const TRANSACTION = "e0e448a0-9ca3-42c5-960d-9647294beb2d";
const RECEIPT = {
  id: "4c1bd45b-fb6d-4f7f-b6d2-92a4c073ec10",
  kind: "void",
  amount: 560,
  reason: "El cliente se enfermó",
  actorId: "10be1244-4fd5-459b-9995-1d195e9e8ec1",
  concept: "Anulación: Gimnasio mensual",
  clientId: "ddbac9c0-04f4-47ef-9080-cbeea63b853a",
  currency: "NIO",
  accountId: "caja_fuerte_nio",
  actorName: "Carlos Sequeira",
  amountNio: 560,
  amountUsd: 14,
  reference: "SG-4c1bd45b",
  requestId: "616f89e1-d316-45b0-80e9-a22cc401785a",
  occurredAt: "2026-10-31T15:56:08.491891+00:00",
  originalId: TRANSACTION,
  reversalId: "4c1bd45b-fb6d-4f7f-b6d2-92a4c073ec10",
  accountName: "Caja Fuerte Córdobas",
  accountAfter: -96384,
  accountBefore: -95824,
  stockRestored: [
    { productId: "f7622a6e-189d-4736-8adb-f24127819856", name: "Agua fuente pura", qty: 2 },
  ],
  originalConcept: "Gimnasio mensual",
};
const PLAN = {
  transactionId: TRANSACTION,
  concept: "Gimnasio mensual",
  type: "income",
  amount: 560,
  currency: "NIO",
  occurredAt: "2026-10-28T23:52:00-06:00",
  accountId: "caja_fuerte_nio",
  isReversal: false,
  alreadyVoided: false,
  voidedAt: null,
  allowed: true,
  code: "ALLOWED",
};

function fakeDb({ plan, receipt, planError = null }) {
  return {
    rpc: () => ({
      abortSignal: async () => ({ data: plan, error: planError }),
      then: (ok, fail) => Promise.resolve({ data: plan, error: planError }).then(ok, fail),
    }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: receipt ? { receipt } : null, error: null }),
        }),
      }),
    }),
  };
}

async function render(db) {
  const loader = createLoader({
    "server-only": "export {};",
    "@/lib/supabase/env":
      "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
    "@/lib/supabase/server": `export const getSupabaseServerClient=async()=>globalThis.__voidDb;`,
    "@/lib/data/queries":
      "export const getCurrentUser=async()=>({id:'10be1244-4fd5-459b-9995-1d195e9e8ec1',role:'admin',mfa:'ok'});export const getVoidPlanImpact=async()=>globalThis.__voidImpact ?? [];",
    "next/navigation": "export function redirect(path){throw new Error('REDIRECT:'+path);}export function notFound(){throw new Error('NOT_FOUND');}",
  });
  globalThis.__voidDb = db;
  const { default: Page } = await loader("app/[locale]/panel/caja/anulacion/[id]/page.tsx");
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ locale: "es", id: TRANSACTION }) }),
  );
}

test("con la reversa guardada, la página cuenta lo que pasó de verdad", async () => {
  const html = await render(fakeDb({ plan: { ...PLAN, allowed: false, alreadyVoided: true, code: "ALREADY_VOIDED" }, receipt: RECEIPT }));
  assert.match(html, /La anulación quedó guardada/);
  assert.match(html, /C\$560/);
  assert.match(html, /El cliente se enfermó/);
  assert.match(html, /Carlos Sequeira/);
  // El stock devuelto se ve, no solo se guarda.
  assert.match(html, /Stock devuelto/);
  assert.match(html, /Agua fuente pura ×2/);
  // Y lleva al comprobante de la reversa.
  assert.match(html, /\/es\/panel\/comprobantes\/4c1bd45b-fb6d-4f7f-b6d2-92a4c073ec10/);
  // Nunca dice que falló.
  assert.doesNotMatch(html, /no quedó guardada/i);
});

test("sin reversa guardada, lo dice y ofrece reintentar con formulario", async () => {
  const html = await render(fakeDb({ plan: PLAN, receipt: null }));
  assert.match(html, /La anulación no quedó guardada/);
  assert.match(html, /sigue tal como estaba/);
  assert.match(html, /<form[^>]+method="post"/);
  assert.match(html, /action="\/api\/admin\/finance\/void"/);
  assert.match(html, new RegExp(`name="transactionId" value="${TRANSACTION}"`));
  assert.match(html, /Anular ahora/);
  assert.doesNotMatch(html, /La anulación quedó guardada/);
});

test("si la base ya dijo que no, se explica su motivo y no se ofrece reintentar", async () => {
  const html = await render(
    fakeDb({ plan: { ...PLAN, allowed: false, code: "NOT_TODAY" }, receipt: null }),
  );
  assert.match(html, /Esta anulación no se hizo/);
  assert.match(html, /Desde caja solo se anulan movimientos del día de hoy/);
  assert.match(html, /Código: NOT_TODAY/);
  assert.doesNotMatch(html, /action="\/api\/admin\/finance\/void"/);
});

test("si no hay ni estado ni comprobante, no afirma que no se hizo", async () => {
  // Sin plan y sin reversa (por ejemplo, la función devolvió una fila vacía):
  // el título no puede decir «Esta anulación no se hizo», porque no se sabe.
  const html = await render(fakeDb({ plan: null, receipt: null }));
  assert.match(html, /Todavía no pudimos leer si quedó guardada/);
  assert.match(html, /Volvé a entrar a esta pantalla/);
  assert.doesNotMatch(html, /Esta anulación no se hizo/);
  assert.doesNotMatch(html, /La anulación quedó guardada/);
  assert.doesNotMatch(html, /<form[^>]+method="post"/);
});

test("un error de lectura no se disfraza de «no se anuló» ni de cero", async () => {
  const html = await render(
    fakeDb({ plan: null, receipt: null, planError: { code: "42501", message: "permission denied" } }),
  );
  assert.match(html, /Información financiera no disponible/);
  assert.match(html, /FIN_VOID/);
  assert.doesNotMatch(html, /La anulación no quedó guardada/);
  assert.doesNotMatch(html, /La anulación quedó guardada/);
});

test("un id que no es un movimiento no se inventa", async () => {
  await assert.rejects(async () => {
    const loader = createLoader({
      "server-only": "export {};",
      "@/lib/supabase/env":
        "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
      "@/lib/supabase/server": `export const getSupabaseServerClient=async()=>null;`,
      "@/lib/data/queries":
        "export const getCurrentUser=async()=>({id:'x',role:'admin',mfa:'ok'});export const getVoidPlanImpact=async()=>[];",
      "next/navigation": "export function redirect(){throw new Error('REDIRECT');}export function notFound(){throw new Error('NOT_FOUND');}",
    });
    const { default: Page } = await loader("app/[locale]/panel/caja/anulacion/[id]/page.tsx");
    await Page({ params: Promise.resolve({ locale: "es", id: "no-es-uuid" }) });
  }, /NOT_FOUND/);
});

test("con una vigencia anulada, el resultado lo cuenta", async () => {
  globalThis.__voidImpact = [
    {
      id: "5acb745b-65ee-4e42-a736-b1a8479dccae",
      planId: "pln_gimnasio",
      planName: "Gimnasio",
      access: "gym",
      startedOn: "2026-12-27",
      expiresOn: "2027-01-25",
      pricePaid: 560,
      currency: "NIO",
      state: "active",
      voided: true,
    },
  ];
  try {
    const html = await render(
      fakeDb({ plan: PLAN, receipt: RECEIPT }),
    );
    assert.match(html, /La anulación quedó guardada/);
    assert.match(html, /quedó anulada/);
    assert.match(html, /Gimnasio: del 27 de diciembre de 2026 al 25 de enero de 2027/);
    assert.match(html, /sin perder días/);
  } finally {
    globalThis.__voidImpact = [];
  }
});

test("sin vigencias vivas, el resultado no mete advertencias de más", async () => {
  globalThis.__voidImpact = [
    {
      id: "x1",
      planId: "pln_gimnasio",
      planName: "Gimnasio",
      access: "gym",
      startedOn: "2026-01-01",
      expiresOn: "2026-01-30",
      pricePaid: 560,
      currency: "NIO",
      state: "expired",
      voided: false,
    },
  ];
  try {
    const html = await render(fakeDb({ plan: PLAN, receipt: RECEIPT }));
    assert.match(html, /La anulación quedó guardada/);
    assert.doesNotMatch(html, /quedó anulada/);
    assert.doesNotMatch(html, /se da de baja/);
  } finally {
    globalThis.__voidImpact = [];
  }
});
