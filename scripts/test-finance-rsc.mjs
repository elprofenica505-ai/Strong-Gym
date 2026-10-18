/** Prueba Next/RSC real y aislada: páginas originales, sólo datos/sesión simulados.
 * No agrega rutas de prueba al producto ni utiliza Supabase o credenciales.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, ".next"), { recursive: true });
const dir = mkdtempSync(join(root, ".next", "finance-rsc-"));
const put = (name, text) => {
  const p = join(dir, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};
try {
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
  put(
    "package.json",
    JSON.stringify({ private: true, name: "finance-rsc-local-test" }),
  );
  put(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "esnext"],
        strict: true,
        noEmit: true,
        allowJs: true,
        isolatedModules: true,
        incremental: true,
        skipLibCheck: true,
        module: "esnext",
        moduleResolution: "bundler",
        esModuleInterop: true,
        jsx: "react-jsx",
        resolveJsonModule: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": [join(root, "src/*")] },
      },
      include: [
        "**/*.ts",
        "**/*.tsx",
        ".next/types/**/*.ts",
        ".next/dev/types/**/*.ts",
      ],
      exclude: ["node_modules"],
    }),
  );
  put(
    "next.config.mjs",
    `export default {experimental:{externalDir:true},webpack(config){config.resolve.alias["@/lib/data/queries"]=${JSON.stringify(join(dir, "data.ts"))};config.resolve.alias["@/lib/supabase/server"]=${JSON.stringify(join(dir, "server.ts"))};config.resolve.alias["@/lib/supabase/env"]=${JSON.stringify(join(dir, "env.ts"))};config.resolve.alias["@"]= ${JSON.stringify(join(root, "src"))};return config;}};`,
  );
  const receipt = {
    id: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    kind: "expense",
    occurredAt: "2026-10-17T12:00:00Z",
    amount: 10,
    currency: "NIO",
    amountNio: 10,
    amountUsd: 0.2723,
    fx: 36.7244,
    concept: "Gasto EJEMPLO RSC",
    clientId: null,
    clientName: null,
    categoryName: "Categoría EJEMPLO",
    accountId: "ejemplo",
    accountName: "Caja EJEMPLO",
    methodName: "Efectivo EJEMPLO",
    actorId: "33333333-3333-4333-8333-333333333333",
    actorName: "Personal EJEMPLO",
    accountBefore: 100,
    accountAfter: 90,
    reference: "SG-EJEMPLO",
  };
  put(
    "server.ts",
    `export const getSupabaseServerClient=async()=>({rpc(){return {abortSignal:async()=>process.env.FINANCE_RSC_EMPTY==='1'?{data:null,error:{message:'RECEIPT_NOT_FOUND'}}:{data:${JSON.stringify(receipt)},error:null}}}});`,
  );
  put("env.ts", "export const isSupabaseConfigured = true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;");
  put(
    "data.ts",
    `const empty=process.env.FINANCE_RSC_EMPTY==='1';
export const getExpenseCategories=async()=>[];
export const getCurrentUser=async()=>({id:'fixture',role:'staff',mfa:'ok'});
export const getAccountsReceivable=async()=>empty?[]:[{memberId:'fixture',fullName:'EJEMPLO RSC',email:'',phone:null,totalOwedNio:20,totalOwedUsd:3,invoicesOpen:null,oldestDue:null,daysOverdue:null}];
export const getMonthlyPnl=async()=>empty?[]:[{month:'2026-10-01',incomeNio:0,expenseNio:86600,netNio:-86600}];
export const getPaymentMethodsBreakdown=async()=>empty?[]:[{paymentMethodId:null,nameEs:null,icon:'Wallet',txCount:1,totalNio:86600,incomeNio:0,expenseNio:86600}];`,
  );
  put(
    "app/layout.tsx",
    "export default function Layout({children}:{children:React.ReactNode}){return <html lang='es'><body>{children}</body></html>}",
  );
  for (const page of ["cuentas", "reportes", "gastos", "comprobantes/[id]"]) {
    put(
      `app/[locale]/panel/${page}/page.tsx`,
      `export {default} from ${JSON.stringify(join(root, `src/app/[locale]/panel/${page}/page`))};\nexport const dynamic='force-static';\nexport function generateStaticParams(){return [{locale:'es',id:'11111111-1111-4111-8111-111111111111'}];}`,
    );
  }
  for (const empty of ["0", "1"]) {
    const r = spawnSync(
      process.execPath,
      [join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"],
      {
        cwd: dir,
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_PUBLIC_SUPABASE_URL: "",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
          FINANCE_RSC_EMPTY: empty,
        },
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    console.log(
      `\n▶ Next/RSC producción: lecturas ${empty === "1" ? "vacías" : "con filas"}\n${r.stdout}${r.stderr}`,
    );
    if (r.status !== 0)
      throw new Error(
        `Next/RSC falló (${r.status}): ${empty === "1" ? "vacío" : "con filas"}`,
      );
    const cuentas = readFileSync(
      join(dir, ".next/server/app/es/panel/cuentas.html"),
      "utf8",
    );
    const reportes = readFileSync(
      join(dir, ".next/server/app/es/panel/reportes.html"),
      "utf8",
    );
    assert.doesNotMatch(
      cuentas + reportes,
      /Información financiera no disponible/,
    );
    assert.match(
      cuentas,
      empty === "1"
        ? /No hay deudas informadas en esta consulta/
        : /EJEMPLO RSC/,
    );
    assert.match(
      reportes,
      empty === "1"
        ? /Sin resultados mensuales informados en esta consulta/
        : /86,600/,
    );
    const comprobante = readFileSync(
      join(
        dir,
        ".next/server/app/es/panel/comprobantes/11111111-1111-4111-8111-111111111111.html",
      ),
      "utf8",
    );
    const gastos = readFileSync(
      join(dir, ".next/server/app/es/panel/gastos.html"),
      "utf8",
    );
    assert.match(gastos, /Registrar gasto/);
    assert.match(
      comprobante,
      empty === "1" ? /No se pudo leer este comprobante/ : /Gasto EJEMPLO RSC/,
    );
    if (empty === "0") assert.match(comprobante, /No es factura fiscal/);
    if (empty === "0") {
      assert.match(cuentas, /Deuda informada USD/);
      assert.match(cuentas, /Facturas no informadas/);
      assert.match(reportes, /Sin método informado/);
      assert.match(reportes, /Ingresos NIO/);
      assert.match(reportes, /Egresos NIO/);
      assert.match(reportes, /Volumen NIO/);
    }
  }
  console.log(
    "✅ Next/RSC: Cuentas, Reportes, Gastos y Comprobante prerenderizados con filas y vacíos, sin llamadas servidor→función cliente.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
