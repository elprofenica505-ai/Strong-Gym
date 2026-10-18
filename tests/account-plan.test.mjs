import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";
const load = createLoader({
  "server-only": "export {};",
  "@/lib/supabase/env": "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
  "@/lib/supabase/server": "export const getSupabaseServerClient=async()=>globalThis.__planDb;",
});
const { getMyAssignedPlan } = await load("lib/data/queries.ts");
const { readData } = await load("lib/data/read-result.ts");
function setup(result) {
  globalThis.__planDb = { rpc(name, args) {
    assert.equal(name, "crm_my_assigned_plan");
    assert.equal(args, undefined, "No toma identidad desde el navegador");
    return { abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return Promise.resolve(result); } };
  } };
}
for (const data of [
  { linked: false, plan: null }, { linked: true, plan: null },
  { linked: true, plan: { id: "text-plan", name_es: "Mensual", name_en: "Monthly", is_active: true } },
]) test(`plan propio: respuesta válida ${JSON.stringify(data)}`, async () => {
  setup({ data, error: null });
  assert.deepEqual(await getMyAssignedPlan(), data);
});
for (const data of [null, {}, { linked: false, plan: {} }, { linked: true, plan: { id: "x" } }, { linked: true, plan: null, notes: "SECRET" }])
  test(`plan propio: respuesta incompleta no se convierte en sin plan ${JSON.stringify(data)}`, async () => {
    setup({ data, error: null });
    assert.deepEqual(await readData(getMyAssignedPlan), { ok: false, code: "DATA_ACCOUNT_PLAN_INVALID" });
  });
for (const code of ["PGRST202", "42501", "42P01"])
  test(`plan propio: ${code} no usa datos legado/demo ni filtra SQL`, async () => {
    setup({ data: null, error: { code, message: "SECRET" } });
    assert.deepEqual(await readData(getMyAssignedPlan), { ok: false, code: `DATA_ACCOUNT_PLAN_${code}` });
  });
test("plan propio: sin conexión no confirma vacío", async () => {
  globalThis.__planDb = null;
  const r = await readData(getMyAssignedPlan);
  assert.equal(r.ok, false);
});

test("Mi cuenta SSR pasa la lectura canónica y su identidad al panel; fallo de plan no bloquea reservas", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const page = await createLoader({
    "@/lib/data/queries": `
      export const getCurrentUser=async()=>({id:'own',planId:'legacy'});
      export const getMyBookings=async()=>[];
      export const getPlans=async()=>[];
      export const getMyAssignedPlan=async()=>{if(globalThis.__assignedError)throw Error('PRIVATE');return {linked:true,plan:null}};`,
    "@/components/account/account-dashboard": "export const AccountDashboard=props=>{globalThis.__passedPlan=props.accountPlan;return null};",
    "@/components/crm/client-pass": "export const ClientPass=()=>null;",
  })("app/[locale]/mi-cuenta/page.tsx");
  for (const error of [false, true]) {
    globalThis.__assignedError = error;
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
      await page.default({ params: Promise.resolve({locale:'es'}) })));
    assert.equal(globalThis.__passedPlan.userId, "own");
    assert.equal(globalThis.__passedPlan.ok, !error);
    assert.ok(!html.includes("PRIVATE"));
    if (!error) assert.deepEqual(globalThis.__passedPlan.data, {linked:true,plan:null});
  }
});
