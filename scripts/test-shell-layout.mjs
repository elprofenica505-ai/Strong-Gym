import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import http from "node:http";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "../tests/helpers/react-loader.mjs";
import { chromium as playwright } from "playwright-core";
const root = fileURLToPath(new URL("..", import.meta.url));
const dict = (await createLoader()("i18n/dictionaries/es.ts")).default;
const monthly = [
  { month: "2026-10-01", incomeNio: 0, expenseNio: 86600, netNio: -86600 },
  { month: "2026-09-01", incomeNio: 0, expenseNio: 166500, netNio: -166500 },
];
const methods = [
  {
    paymentMethodId: null,
    nameEs: null,
    icon: "Wallet",
    txCount: 13,
    incomeNio: 0,
    expenseNio: 253100,
    totalNio: 253100,
  },
];
const summary = {
  incomeToday: 0,
  expenseToday: 0,
  netToday: 0,
  txToday: 0,
  incomeMonth: 0,
  expenseMonth: 86600,
  netMonth: -86600,
  txMonth: 6,
  pendingInvoices: null,
  totalOwed: 0,
  totalOwedUsd: 0,
  sourceModel: "bank_accounts_split",
  openRegisterCount: 0,
  openRegister: null,
};
const accounts = [
  {
    id: "ejemplo",
    name: "EJEMPLO - Caja NIO",
    currency: "NIO",
    balance: 0,
    kind: "caja_fuerte",
  },
];
const recent = [
  {
    id: "ejemplo",
    direction: "expense",
    status: "completed",
    amount: 11800,
    currency: "NIO",
    occurredAt: "2026-10-11T12:00:00Z",
    concept: "[SEED-GASTO] Alcaldía - tributos municipales de ejemplo",
    memberName: null,
  },
];
const pages = {};
for (const variant of ["ejemplo", "vacio", "importes-largos"]) {
  const large = variant === "importes-largos";
  const empty = variant === "vacio";
  const names = large
    ? "EJEMPLO Nombre de cuenta y método de pago muy largo para comprobar saltos de línea en celulares"
    : "Método EJEMPLO";
  const variantMethods = empty
    ? []
    : methods.map((m) => ({
        ...m,
        nameEs: names,
        totalNio: large ? 9999999999.99 : m.totalNio,
        expenseNio: large ? 9999999999.99 : m.expenseNio,
      }));
  const variantRecent = empty
    ? []
    : recent.map((t) => ({
        ...t,
        amount: large ? 9999999999.99 : t.amount,
        concept: large ? names : t.concept,
      }));
  const variantMonthly = empty
    ? []
    : monthly.map((m) => ({
        ...m,
        expenseNio: large ? 9999999999.99 : m.expenseNio,
        netNio: large ? -9999999999.99 : m.netNio,
      }));
  const variantSummary = empty
    ? { ...summary, expenseMonth: 0, netMonth: 0, txMonth: 0 }
    : summary;
  const variantAccounts = empty
    ? []
    : accounts.map((a) => ({
        ...a,
        name: large ? names : a.name,
        balance: large ? 9999999999.99 : a.balance,
      }));
  const debts = empty
    ? []
    : [
        {
          memberId: "ejemplo",
          fullName: large ? names : "Cliente EJEMPLO",
          email: large
            ? `${"ejemplo".repeat(12)}@example.com`
            : "prueba@example.com",
          phone: null,
          totalOwedNio: large ? 9999999999.99 : 10,
          totalOwedUsd: 5,
          invoicesOpen: null,
          daysOverdue: null,
          oldestDue: null,
        },
      ];
  const categories = empty
    ? []
    : [
        {
          id: "ejemplo",
          nameEs: large ? names : "Categoría EJEMPLO",
          slug: large ? "ejemplo".repeat(12) : "ejemplo",
        },
      ];
  const load = createLoader({
    "@/lib/supabase/env": "export const isSupabaseConfigured=true;",
    "@/lib/data/queries": `export const getCurrentUser=async()=>({role:'admin'});export const getMonthlyPnl=async()=>${JSON.stringify(variantMonthly)};export const getPaymentMethodsBreakdown=async()=>${JSON.stringify(variantMethods)};export const getCashSummary=async()=>(${JSON.stringify(variantSummary)});export const getAccounts=async()=>${JSON.stringify(variantAccounts)};export const getRecentTransactions=async()=>${JSON.stringify(variantRecent)};export const getAccountsReceivable=async()=>${JSON.stringify(debts)};export const getExpenseCategories=async()=>${JSON.stringify(categories)};export const getDailyCash=async()=>[];export const getPaymentMethods=async()=>[];`,
    "@/components/providers/dictionary-provider": `export const useDictionary=()=>({locale:'es',dict:${JSON.stringify(dict)}});`,
    "@/components/providers/app-provider": `export const useApp=()=>({user:{role:'admin',fullName:'Admin EJEMPLO'},isDemo:false,hydrated:true,bookings:[],signOut(){},toast(){}});`,
    "next/navigation": `export const usePathname=()=>'/es/panel/reportes';export const useRouter=()=>({});export function redirect(){throw Error('redirect')}`,
  });
  const { SiteShell } = await load("components/layout/site-shell.tsx");
  const { SiteFooter } = await load("components/layout/site-footer.tsx");
  for (const key of ["caja", "reportes", "cuentas", "gastos"]) {
    const { default: Page } = await load(`app/[locale]/panel/${key}/page.tsx`);
    pages[`${key}-${variant}`] =
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      readdirSync(root + "/.next/static/chunks")
        .filter((f) => f.endsWith(".css"))
        .map((f) => `<link rel="stylesheet" href="/_next/static/chunks/${f}">`)
        .join("") +
      "</head><body>" +
      renderToStaticMarkup(
        React.createElement(
          SiteShell,
          { footer: React.createElement(SiteFooter, { locale: "es" }) },
          await Page({ params: Promise.resolve({ locale: "es" }) }),
        ),
      ) +
      "</body></html>";
  }
}
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/_next/static/") && !req.url.includes("..")) {
    try {
      res.setHeader(
        "Content-Type",
        req.url.endsWith(".css") ? "text/css" : "font/woff2",
      );
      res.end(readFileSync(root + "/.next/" + req.url.slice("/_next/".length)));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  } else {
    res.setHeader("Content-Type", "text/html");
    res.statusCode = pages[req.url.slice(1)] ? 200 : 404;
    res.end(pages[req.url.slice(1)] ?? "Not found");
  }
});
await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
let browser;
try {
  browser = await playwright.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
    ],
    headless: true,
  });
  const page = await browser.newPage();
  const results = [];
  for (const name of Object.keys(pages))
    for (const width of [320, 360, 393, 414, 640, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:${server.address().port}/${name}`);
      await page.evaluate(() => document.fonts.ready);
      // Se desactiva clip: la prueba falla si el contenido realmente desborda.
      await page.evaluate(() => {
        document.documentElement.style.overflowX = "visible";
        document.body.style.overflowX = "visible";
      });
      const before = await page.evaluate(() => ({
        viewport: innerWidth,
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        headerCTA: [...document.querySelectorAll("header a")]
          .filter((a) => a.textContent.includes("Reservar"))
          .map((a) => ({
            display: getComputedStyle(a).display,
            right: a.getBoundingClientRect().right,
          })),
        overflow: [...document.querySelectorAll("body *")]
          .filter((el) => {
            let r = el.getBoundingClientRect();
            return (
              r.right > innerWidth + 1 &&
              r.width > 0 &&
              !el.closest('[role="region"], .overflow-x-auto') &&
              getComputedStyle(el).position !== "fixed"
            );
          })
          .slice(0, 8)
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            right: Math.round(el.getBoundingClientRect().right),
            text: el.textContent.slice(0, 50),
          })),
      }));
      await page.evaluate(() =>
        document
          .querySelectorAll('[role="region"], .overflow-x-auto')
          .forEach((el) => (el.scrollLeft = 1000)),
      );
      const after = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        scrollX,
        tableScroll: document.querySelector("table")?.parentElement.scrollLeft,
      }));
      results.push({ name, width, before, after });
    }
  for (const r of results) {
    assert.ok(
      r.before.doc <= r.width,
      `${r.name}/${r.width}: desbordamiento real ${r.before.doc}px`,
    );
    assert.ok(
      r.after.doc <= r.width && r.after.scrollX === 0,
      `${r.name}/${r.width}: desplazamiento global al usar tabla`,
    );
    assert.deepEqual(
      r.before.overflow,
      [],
      `${r.name}/${r.width}: elemento fuera del viewport`,
    );
    const cta = r.before.headerCTA[0];
    assert.ok(cta, `${r.name}: CTA falta`);
    assert.equal(
      cta.right > 0,
      r.width >= 640,
      `${r.name}/${r.width}: visibilidad CTA`,
    );
    if (r.name.startsWith("reportes-") && r.width < 640)
      assert.ok(
        r.after.tableScroll > 0,
        `${r.name}: tabla móvil no se desplaza localmente`,
      );
  }
  console.log(
    `PASS: ${results.length} casos (4 pantallas × 3 fixtures EJEMPLO × 8 anchos, 320–1280 px). Sin overflow global, CTA responsive y tablas desplazables. Render SSR completo con CSS de producción; no certifica hidratación ni escrituras remotas.`,
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
