import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";

const { formatMoney } = await createLoader()("lib/finance/format-money.ts");
const expected = (amount, currency) =>
  new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

test("formateador compartido puro, sin frontera cliente, React, datos ni FX", () => {
  const source = readFileSync(
    new URL("../src/lib/finance/format-money.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /["']use client["']|\bimport\b|supabase|36\.5|fx_rate/,
  );
});
test("importes NIO/USD se presentan sin convertir ni cambiar signo o moneda", () => {
  for (const currency of ["NIO", "USD"])
    for (const amount of [0, 1, 20, 3, -86600, 12.34, 0.01]) {
      assert.equal(formatMoney(amount, currency), expected(amount, currency));
    }
});
test("desconocidos no se presentan como cero", () => {
  for (const value of [NaN, Infinity, -Infinity])
    assert.equal(formatMoney(value), "—");
});
test("formato compacto conserva el comportamiento de Caja y sus umbrales", () => {
  assert.equal(formatMoney(-86600, "NIO", { compact: true }), "C$ -86.6K");
  assert.equal(formatMoney(1250, "USD", { compact: true }), "US$ 1.3K");
  assert.equal(
    formatMoney(999, "USD", { compact: true }),
    expected(999, "USD"),
  );
});
for (const page of ["cuentas", "reportes"])
  for (const empty of [false, true]) {
    test(`${page}: servidor renderiza ${empty ? "vacío" : "con filas"} sin llamar al módulo cliente`, async () => {
      const queries = `export const getCurrentUser=async()=>({role:'staff'});
      export const getAccountsReceivable=async()=>${JSON.stringify(empty ? [] : [{ memberId: "test", fullName: "EJEMPLO", email: "", phone: null, totalOwedNio: 20, totalOwedUsd: 3, invoicesOpen: null, oldestDue: null, daysOverdue: null }])};
      export const getMonthlyPnl=async()=>${JSON.stringify(empty ? [] : [{ month: "2026-10-01", incomeNio: 0, expenseNio: 86600, netNio: -86600 }])};
      export const getPaymentMethodsBreakdown=async()=>${JSON.stringify(empty ? [] : [{ paymentMethodId: null, nameEs: null, icon: "Wallet", txCount: 1, totalNio: 86600, incomeNio: 0, expenseNio: 86600 }])};`;
      const load = createLoader({
        "@/lib/data/queries": queries,
        "@/lib/supabase/env": "export const isSupabaseConfigured=true;",
        "@/components/admin/cash-panel":
          "export function formatMoney(){throw Error('SERVER_CALLED_CLIENT_FUNCTION');}",
        "next/navigation":
          "export function redirect(){throw Error('UNEXPECTED_REDIRECT');}",
      });
      const { default: Page } = await load(
        `app/[locale]/panel/${page}/page.tsx`,
      );
      const html = renderToStaticMarkup(
        await Page({ params: Promise.resolve({ locale: "es" }) }),
      );
      assert.doesNotMatch(
        html,
        /SERVER_CALLED_CLIENT_FUNCTION|Información financiera no disponible/,
      );
      if (page === "cuentas")
        assert.match(html, empty ? /No hay deudas informadas/ : /EJEMPLO/);
      else
        assert.match(
          html,
          empty ? /Sin movimientos en los últimos 12 meses/ : /86,600/,
        );
    });
  }
