import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createLoader } from "./helpers/react-loader.mjs";

async function report({ pnl = [], methods = [] } = {}) {
  const load = createLoader({
    "@/lib/data/queries": `export const getCurrentUser=async()=>({role:'staff'});export const getMonthlyPnl=async()=>${JSON.stringify(pnl)};export const getPaymentMethodsBreakdown=async()=>${JSON.stringify(methods)};`,
    "@/lib/supabase/env": "export const isSupabaseConfigured=true;",
    "next/navigation":
      'export function redirect(){throw Error("unexpected redirect");}',
    "@/components/admin/cash-panel":
      'export function formatMoney(){throw Error("SERVER_CALLED_CLIENT");}',
  });
  const { default: Page } = await load("app/[locale]/panel/reportes/page.tsx");
  const html = renderToStaticMarkup(
    await Page({ params: Promise.resolve({ locale: "es" }) }),
  );
  return new JSDOM(html);
}
function amounts(document) {
  return Object.fromEntries(
    [...document.querySelectorAll("dl > div")].map((el) => [
      el.querySelector("dt").textContent,
      el.querySelector("dd").textContent,
    ]),
  );
}
test("Reportes: egresos sin método no se describen como cobros ni ganancias", async () => {
  const dom = await report({
    methods: [
      {
        paymentMethodId: null,
        nameEs: null,
        txCount: 13,
        incomeNio: 0,
        expenseNio: 253100,
        totalNio: 253100,
      },
    ],
  });
  try {
    const doc = dom.window.document;
    assert.match(doc.body.textContent, /Sin método informado/);
    assert.match(doc.body.textContent, /13 movimientos completados/);
    assert.match(doc.body.textContent, /todo el historial/);
    assert.doesNotMatch(
      doc.body.textContent,
      /Qué método se usa más para cobrar|Otros/,
    );
    const values = amounts(doc);
    assert.match(values["Ingresos NIO"], /0$/);
    assert.match(values["Egresos NIO"], /253,100/);
    assert.match(values["Volumen NIO · no es resultado"], /253,100/);
  } finally {
    dom.window.close();
  }
});
test("Reportes: desglose mixto conserva importes de cada campo, sin netear ni convertir", async () => {
  const dom = await report({
    methods: [
      {
        paymentMethodId: "test",
        nameEs: "Método EJEMPLO",
        txCount: 2,
        incomeNio: 100,
        expenseNio: 40,
        totalNio: 140,
      },
    ],
  });
  try {
    const values = amounts(dom.window.document);
    assert.match(dom.window.document.body.textContent, /Método EJEMPLO/);
    assert.match(values["Ingresos NIO"], /100$/);
    assert.match(values["Egresos NIO"], /40$/);
    assert.match(values["Volumen NIO · no es resultado"], /140$/);
  } finally {
    dom.window.close();
  }
});
test("Reportes: período y signo se mantienen juntos, scroll acotado a la tabla", async () => {
  const dom = await report({
    pnl: [
      { month: "2026-10-01", incomeNio: 0, expenseNio: 86600, netNio: -86600 },
      {
        month: "2026-09-01",
        incomeNio: 0,
        expenseNio: 166500,
        netNio: -166500,
      },
    ],
  });
  try {
    const doc = dom.window.document,
      table = doc.querySelector("table"),
      region = table.parentElement;
    assert.ok(table.classList.contains("whitespace-nowrap"));
    assert.ok(table.classList.contains("min-w-[32rem]"));
    for (const c of ["w-full", "min-w-0", "max-w-full", "overflow-x-auto"])
      assert.ok(region.classList.contains(c));
    assert.equal(region.getAttribute("role"), "region");
    assert.equal(region.tabIndex, 0);
    const rows = [...table.querySelectorAll("tbody tr")];
    assert.equal(rows[0].children[0].textContent, "2026-10");
    assert.equal(rows[1].children[0].textContent, "2026-09");
    assert.match(rows[0].children[3].textContent, /-.*86,600/);
    assert.match(rows[1].children[3].textContent, /-.*166,500/);
    assert.equal(table.querySelectorAll('th[scope="col"]').length, 4);
  } finally {
    dom.window.close();
  }
});
test("Reportes: vacío confirmado no afirma ausencia universal de movimientos en doce meses", async () => {
  const dom = await report();
  try {
    const text = dom.window.document.body.textContent;
    assert.match(text, /Sin resultados mensuales informados en esta consulta/);
    assert.match(
      text,
      /Sin movimientos por método informados en esta consulta/,
    );
    assert.doesNotMatch(text, /Sin movimientos en los últimos 12 meses/);
  } finally {
    dom.window.close();
  }
});
