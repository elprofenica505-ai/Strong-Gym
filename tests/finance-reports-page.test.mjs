import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";

const NOW = new Date().toISOString();
const SAMPLE = {
  generatedAt: NOW,
  rows: [{
    id: "t1", occurredAt: NOW, type: "income", status: "completed", amount: 100, currency: "NIO",
    amountNio: 100, amountUsd: 2.5, fxUsed: 40, methodId: "tarjeta_pos", categoryId: null, accountId: "caja", clientId: "c1",
    concept: "Mensualidad PRIVADA", reference: null, cashReceived: null, changeGiven: null, debtBefore: null, debtAfter: null,
    kind: "service_income", methodName: "Tarjeta POS", feePct: 3.5, categoryName: "", accountName: "Caja NIO",
    clientName: "Ana", commissionNio: 3.5,
  }],
  debtEntries: [],
  maps: { methods: {}, categories: {}, accounts: {}, clients: {} },
};

function loaderFor({ role = "admin", demo = false, data = SAMPLE, fail = false } = {}) {
  return createLoader({
    "server-only": "export {};",
    "@/lib/supabase/env": `export const isSupabaseConfigured=${!demo};export const DEMO_MODE=${demo};export const CONFIGURATION_UNAVAILABLE=false;`,
    "@/lib/supabase/server": "export const getSupabaseServerClient=async()=>({});",
    "@/lib/data/queries": `export const getCurrentUser=async()=>({id:'t',role:${JSON.stringify(role)},mfa:'ok'});export const getMonthlyPnl=async()=>[];export const getPaymentMethodsBreakdown=async()=>[];`,
    "@/lib/reports/load": `export async function loadFinanceReport(){ if (${fail}) { const e = new Error('x'); e.code='42501'; throw e; } return ${JSON.stringify(data)}; }`,
    "next/navigation": "export function redirect(p){throw new Error('REDIRECT:'+p);}",
  });
}

test("administración ve cierre, comparativo, pendientes y comisiones con el botón maestro", async () => {
  const { default: Page } = await loaderFor()("app/[locale]/panel/reportes/page.tsx");
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "es" }) }));
  for (const t of ["Cierre del día", "Comparativo mensual", "Pagos pendientes", "Comisiones", ">Exportar Excel maestro<"])
    assert.match(html, new RegExp(t));
  assert.match(html, /Mensualidad PRIVADA/);
  assert.match(html, /Tarjeta POS/);
});

test("error de lectura: aviso visible, sin cifras en cero", async () => {
  const { default: Page } = await loaderFor({ fail: true })("app/[locale]/panel/reportes/page.tsx");
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "es" }) }));
  assert.match(html, /Información financiera no disponible/);
  assert.doesNotMatch(html, />Exportar Excel maestro</);
  assert.doesNotMatch(html, /C\$ 0/);
});

test("caja no entra a reportes (redirige a Mi cuenta)", async () => {
  const { default: Page } = await loaderFor({ role: "cashier" })("app/[locale]/panel/reportes/page.tsx");
  await assert.rejects(Page({ params: Promise.resolve({ locale: "es" }) }), /REDIRECT:\/es\/mi-cuenta/);
});

test("demo: sin cifras inventadas", async () => {
  const { default: Page } = await loaderFor({ demo: true })("app/[locale]/panel/reportes/page.tsx");
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "es" }) }));
  assert.match(html, /En modo demo no se muestran cifras inventadas/);
  assert.doesNotMatch(html, /Mensualidad/);
});
