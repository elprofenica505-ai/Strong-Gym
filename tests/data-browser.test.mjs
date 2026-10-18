import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { createLoader } from "./helpers/react-loader.mjs";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test/es/horarios",
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Node",
  "FormData",
  "sessionStorage",
  "localStorage",
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = dom.window;
const { render, screen, fireEvent, waitFor, cleanup, act } = await import(
  "@testing-library/react"
);
const dict = (await createLoader()("i18n/dictionaries/es.ts")).default;
const load = createLoader({
  "@/components/providers/dictionary-provider": `export const useDictionary=()=>({locale:"es",dict:${JSON.stringify(dict)}});`,
  "next/navigation": "export const useRouter=()=>globalThis.__readRouter;",
  "@/lib/supabase/client": "export const getSupabaseBrowserClient=()=>null;",
});
const { AppProvider, useApp } = await load(
  "components/providers/app-provider.tsx",
);
const { ScheduleBoard } = await load("components/schedule/schedule-board.tsx");
const { AccountDashboard } = await load(
  "components/account/account-dashboard.tsx",
);
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.replaceState(null, "", "/es/horarios");
});
const user = {
  id: "first",
  fullName: "Cliente de prueba",
  createdAt: "2026-10-16T12:00:00Z",
  phone: null,
  email: "example@example.com",
  role: "member",
  isDemo: false,
};
const booking = (id = "booking") => ({
  id,
  session_id: id,
  status: "confirmed",
  created_at: "2026-10-17T12:00:00Z",
});
let app;
function Probe() {
  app = useApp();
  return React.createElement(
    "p",
    { "data-testid": "state" },
    app.bookingsError ? "error" : app.bookingsLoading ? "loading" : "ready",
  );
}
function tree(initialUser = user, child = null) {
  globalThis.__readRouter = { refresh() {}, push() {} };
  return React.createElement(
    AppProvider,
    { initialUser, isDemo: false },
    React.createElement(Probe),
    child,
  );
}
const json = (data, status = 200) => Response.json(data, { status });
const week = (key = "2026-W42") => ({
  weekKey: key,
  sessions: [],
  bookedSessionIds: [],
});

test("reservas del navegador: error explícito, bloquea acción y reintenta sólo GET", async () => {
  let ok = false;
  const methods = [];
  globalThis.fetch = async (_url, options = {}) => {
    methods.push(options.method ?? "GET");
    return ok
      ? json({ bookings: [] })
      : json({ error: "DATA_UNAVAILABLE" }, 503);
  };
  render(tree());
  await waitFor(() => assert.equal(app.bookingsError, true));
  let result;
  await act(async () => {
    result = await app.book("session");
  });
  assert.equal(result.ok, false);
  assert.deepEqual(methods, ["GET"]);
  ok = true;
  await act(async () => {
    await app.reloadBookings();
  });
  assert.equal(app.bookingsError, false);
  assert.equal(app.bookingsLoading, false);
  assert.deepEqual(methods, ["GET", "GET"]);
});
for (const data of [{}, { bookings: null }, { bookings: [{}] }]) {
  test(`reservas del navegador: JSON inválido ${JSON.stringify(data)}`, async () => {
    globalThis.fetch = async () => json(data);
    render(tree());
    await waitFor(() => assert.equal(app.bookingsError, true));
  });
}
test("reservas del navegador: respuesta perdida no se interpreta como vacío", async () => {
  globalThis.fetch = async () => {
    throw Error("network");
  };
  render(tree());
  await waitFor(() => assert.equal(app.bookingsError, true));
});
test("reserva confirmada seguida de fallo de lectura no se reenvía automáticamente", async () => {
  let gets = 0;
  const methods = [];
  globalThis.fetch = async (_url, options = {}) => {
    const method = options.method ?? "GET";
    methods.push(method);
    return method === "POST"
      ? json({ ok: true, booking: { id: "saved", session_id: "session", status: "confirmed" } })
      : ++gets === 1
        ? json({ bookings: [] })
        : json({ error: "DATA_UNAVAILABLE" }, 503);
  };
  render(tree());
  await waitFor(() => assert.equal(app.bookingsLoading, false));
  let result;
  await act(async () => {
    result = await app.book("session");
  });
  assert.deepEqual(result, { ok: false, error: "UNCONFIRMED" });
  assert.equal(app.bookingsError, true);
  assert.deepEqual(methods, ["GET", "POST", "GET"]);
});
test("respuesta tardía del usuario anterior no reemplaza reservas de otra sesión", async () => {
  let resolveOld;
  let calls = 0;
  globalThis.fetch = async () =>
    ++calls === 1
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : json({ bookings: [booking("new")] });
  const view = render(tree());
  await waitFor(() => assert.ok(resolveOld));
  view.rerender(tree({ ...user, id: "second" }));
  await waitFor(() => assert.equal(app.bookings[0]?.id, "new"));
  await act(async () => {
    resolveOld(json({ bookings: [booking("old")] }));
  });
  assert.equal(app.user.id, "second");
  assert.equal(app.bookings[0].id, "new");
});
test("Horarios: fallo visible distinto de no hay clases; reintento vacío válido", async () => {
  let ok = false;
  globalThis.fetch = async () =>
    ok ? json(week()) : json({ error: "DATA_UNAVAILABLE" }, 503);
  render(tree(null, React.createElement(ScheduleBoard)));
  await screen.findByRole("alert");
  assert.equal(screen.queryByText(dict.schedule.noSessions), null);
  ok = true;
  fireEvent.click(screen.getByRole("button", { name: "Reintentar consulta" }));
  await screen.findByText(dict.schedule.noSessions);
  assert.equal(screen.queryByRole("alert"), null);
});
test("Horarios: JSON sin sesiones no muestra vacío válido", async () => {
  globalThis.fetch = async () => json({});
  render(tree(null, React.createElement(ScheduleBoard)));
  await screen.findByRole("alert");
  assert.equal(screen.queryByText(dict.schedule.noSessions), null);
});
test("Horarios: falla la semana siguiente y reintenta esa misma semana, no la anterior", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return urls.length === 2
      ? json({}, 503)
      : json(week(url.includes("W43") ? "2026-W43" : "2026-W42"));
  };
  render(
    tree(
      null,
      React.createElement(ScheduleBoard, { initialWeekKey: "2026-W42" }),
    ),
  );
  await screen.findByText(dict.schedule.noSessions);
  fireEvent.click(screen.getByRole("button", { name: dict.schedule.nextWeek }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar consulta" }));
  await screen.findByText(dict.schedule.noSessions);
  assert.equal(urls[1], urls[2]);
  assert.ok(urls[1].includes("2026-W43"));
});
test("Horarios: respuesta de semana anterior no pisa la navegación más reciente", async () => {
  let resolveOld;
  let calls = 0;
  globalThis.fetch = async () =>
    ++calls === 1
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : json(week("2026-W43"));
  render(
    tree(
      null,
      React.createElement(ScheduleBoard, { initialWeekKey: "2026-W42" }),
    ),
  );
  await waitFor(() => assert.ok(resolveOld));
  fireEvent.click(screen.getByRole("button", { name: dict.schedule.nextWeek }));
  await screen.findByText(dict.schedule.noSessions);
  await act(async () => {
    resolveOld(json(week("2026-W42")));
  });
  assert.equal(
    new URL(window.location.href).searchParams.get("week"),
    "2026-W43",
  );
});
test("Mi cuenta: no anuncia estadísticas vacías si falla lectura de reservas del navegador", async () => {
  globalThis.fetch = async () => json({}, 503);
  render(
    tree(
      user,
      React.createElement(AccountDashboard, { initialBookings: [], plans: [] }),
    ),
  );
  await screen.findByRole("alert");
  assert.equal(screen.queryByText(dict.account.stats.total), null);
});

test("mutación tardía de la sesión anterior no inicia una lectura que deje bloqueada la sesión nueva", async () => {
  let resolvePost;
  let gets = 0;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === "POST")
      return new Promise((resolve) => {
        resolvePost = resolve;
      });
    gets++;
    return json({ bookings: gets === 1 ? [] : [booking("second-user")] });
  };
  const view = render(tree());
  await waitFor(() => assert.equal(app.bookingsLoading, false));
  let pending;
  act(() => {
    pending = app.book("session");
  });
  await waitFor(() => assert.ok(resolvePost));
  view.rerender(tree({ ...user, id: "second" }));
  await waitFor(() => assert.equal(app.bookings[0]?.id, "second-user"));
  await act(async () => {
    resolvePost(json({ ok: true }));
    await pending;
  });
  assert.equal(gets, 2);
  assert.equal(app.bookingsLoading, false);
  assert.equal(app.bookingsError, false);
  assert.equal(app.bookings[0].id, "second-user");
});

test("Horarios: sesión malformada muestra error controlado, no rompe el render", async () => {
  globalThis.fetch = async () =>
    json({ ...week(), sessions: [{ id: "broken" }] });
  render(tree(null, React.createElement(ScheduleBoard)));
  await screen.findByRole("alert");
  assert.equal(screen.queryByText(dict.schedule.noSessions), null);
});

test("Horarios: una sesión completa válida sigue mostrando datos y cupos", async () => {
  globalThis.fetch = async () =>
    json({
      ...week(),
      sessions: [
        {
          id: "session",
          starts_at: "2026-10-15T12:00:00Z",
          ends_at: "2026-10-15T13:00:00Z",
          capacity: 10,
          bookedCount: 2,
          spotsLeft: 8,
          room: "Sala de prueba",
          status: "scheduled",
          coach: null,
          gymClass: {
            slug: "prueba",
            name_es: "Clase de prueba",
            name_en: "Test class",
            color: "#d81a22",
            duration_min: 60,
          },
        },
      ],
    });
  render(
    tree(
      null,
      React.createElement(ScheduleBoard, { initialWeekKey: "2026-W42" }),
    ),
  );
  await screen.findByRole("heading", { name: "Clase de prueba" });
  assert.equal(screen.queryByRole("alert"), null);
  assert.ok(screen.getByText("2/10"));
});

for (const [label, result, expected] of [
  ["asignado CRM prevalece al perfil legado", { ok: true, data: { linked: true, plan: { id: "crm", name_es: "Gimnasio mensual", name_en: "Monthly gym", is_active: true } } }, "Gimnasio mensual"],
  ["sin plan CRM no usa perfil legado", { ok: true, data: { linked: true, plan: null } }, dict.account.noPlan],
  ["sin ficha no simula ausencia de plan", { ok: true, data: { linked: false, plan: null } }, "Sin ficha vinculada"],
  ["fallo no significa sin plan", { ok: false, code: "DATA_ACCOUNT_PLAN_PGRST202" }, "Plan no confirmado"],
  ["plan inactivo conserva nombre", { ok: true, data: { linked: true, plan: { id: "crm", name_es: "Plan anterior", name_en: "Old plan", is_active: false } } }, "Plan anterior"],
]) test(`Mi cuenta: ${label}`, async () => {
  globalThis.fetch = async () => json({ bookings: [] });
  render(tree({ ...user, planId: "legacy" }, React.createElement(AccountDashboard, {
    initialBookings: [],
    plans: [{ id: "legacy", name_es: "PLAN LEGADO INCORRECTO", name_en: "WRONG LEGACY PLAN" }],
    accountPlan: { userId: user.id, ...result },
  })));
  await screen.findByText(expected);
  assert.equal(screen.queryByText("PLAN LEGADO INCORRECTO"), null);
  if (expected === "Plan no confirmado") {
    assert.equal(screen.queryByText(dict.account.noPlan), null);
    assert.ok(screen.getByRole("button", { name: "Reintentar consulta" }));
  }
});
test("Mi cuenta: datos del plan de otra sesión no se muestran", async () => {
  globalThis.fetch = async () => json({ bookings: [] });
  render(tree(user, React.createElement(AccountDashboard, {
    initialBookings: [], plans: [],
    accountPlan: { userId: "another", ok: true, data: { linked: true, plan: { id: "x", name_es: "PLAN AJENO", name_en: "OTHER PLAN", is_active: true } } },
  })));
  await screen.findByText("Plan no confirmado");
  assert.equal(screen.queryByText("PLAN AJENO"), null);
});

for (const after of [[], [{ ...booking("other"), session_id: "session" }], [{ ...booking("saved"), session_id: "session", status: "cancelled" }]])
  test(`POST reserva seguido de GET divergente no anuncia éxito: ${JSON.stringify(after)}`, async () => {
    let gets = 0;
    let posts = 0;
    globalThis.fetch = async (_url, init = {}) => {
      if (init.method === "POST") { posts++; return json({ok:true,booking:{id:"saved",session_id:"session",status:"confirmed"}}); }
      return json({bookings: ++gets === 1 ? [] : after});
    };
    render(tree());
    await waitFor(() => assert.equal(app.bookingsLoading, false));
    let result;
    await act(async () => { result = await app.book("session"); });
    assert.deepEqual(result, {ok:false,error:"UNCONFIRMED"});
    assert.equal(app.bookingsError, true);
    assert.equal(posts, 1);
  });
for (const payload of [null, {}, {ok:true}, {ok:true,booking:{id:"saved",session_id:"other",status:"confirmed"}}])
  test(`POST vacío o incoherente no confirma reserva: ${JSON.stringify(payload)}`, async () => {
    globalThis.fetch = async (_url, init = {}) => init.method === "POST" ? json(payload) : json({bookings:[]});
    render(tree());
    await waitFor(() => assert.equal(app.bookingsLoading, false));
    let result;
    await act(async () => { result = await app.book("session"); });
    assert.deepEqual(result, {ok:false,error:"UNCONFIRMED"});
    assert.equal(app.bookingsError, true);
  });
test("POST y GET coincidentes confirman reserva y activan el estado reservado", async () => {
  let gets = 0;
  globalThis.fetch = async (_url, init = {}) => init.method === "POST"
    ? json({ok:true,booking:{id:"saved",session_id:"session",status:"confirmed"}})
    : json({bookings: ++gets === 1 ? [] : [{...booking("saved"),session_id:"session"}]});
  render(tree());
  await waitFor(() => assert.equal(app.bookingsLoading, false));
  let result;
  await act(async () => { result = await app.book("session"); });
  assert.deepEqual(result, {ok:true});
  assert.ok(app.bookedSessionIds.has("session"));
});

for (const cancelled of [true, false]) test(`cancelación se confirma por lectura, no sólo por HTTP: ${cancelled}`, async () => {
  let gets = 0;
  globalThis.fetch = async (_url, init = {}) => init.method === "DELETE" ? json({ok:true})
    : json({bookings:[{...booking("saved"),session_id:"session",status: ++gets > 1 && cancelled ? "cancelled" : "confirmed"}]});
  render(tree());
  await waitFor(() => assert.equal(app.bookingsLoading,false));
  let result;
  await act(async()=>{result=await app.cancelBooking("saved","session")});
  assert.deepEqual(result,cancelled?{ok:true}:{ok:false,error:"UNCONFIRMED"});
  assert.equal(app.bookingsError,!cancelled);
});

test("Horarios vuelve a leer ocupación real después de reservar, sin sumar un cupo inventado", async () => {
  const { getWeekRange } = await load("lib/schedule.ts");
  const starts = new Date("2099-01-06T12:00:00Z");
  const key = getWeekRange(starts).key;
  let posts = 0;
  let sessionReads = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === "POST") { posts++; return json({ok:true,booking:{id:"saved",session_id:"session",status:"confirmed"}}); }
    if (String(url).startsWith("/api/sessions")) {
      sessionReads++;
      return json({weekKey:key,sessions:[{
        id:"session",starts_at:starts.toISOString(),ends_at:"2099-01-06T13:00:00Z",
        capacity:20,bookedCount:posts ? 7 : 0,spotsLeft:posts ? 13 : 20,
        room:"Área EJEMPLO",status:"scheduled",coach:null,
        gymClass:{slug:"test",name_es:"Boxeo prueba",name_en:"Test boxing",color:"#d81a22",duration_min:60},
      }]});
    }
    return json({bookings:posts ? [{...booking("saved"),session_id:"session"}] : []});
  };
  render(tree(user,React.createElement(ScheduleBoard,{initialWeekKey:key})));
  await screen.findByText("0/20");
  await waitFor(()=>assert.equal(app.bookingsLoading,false));
  fireEvent.click(screen.getByRole("button",{name:dict.schedule.book}));
  await screen.findByText("7/20");
  assert.equal(posts,1);
  assert.equal(sessionReads,2);
  assert.equal(screen.queryByText("1/20"),null);
  assert.ok(screen.getByRole("button",{name:dict.schedule.cancel}));
});

test("rechazo UNCONFIRMED del servidor bloquea nuevos envíos hasta revisar lecturas", async () => {
  let sends=0;
  globalThis.fetch=async(_url,init={})=>{
    if(init.method==='POST'){sends++;assert.ok(init.signal instanceof AbortSignal);return json({error:'UNCONFIRMED'},503)}
    return json({bookings:[]});
  };
  render(tree());
  await waitFor(()=>assert.equal(app.bookingsLoading,false));
  let result;
  await act(async()=>{result=await app.book('session')});
  assert.deepEqual(result,{ok:false,error:'UNCONFIRMED'});
  assert.equal(app.bookingsError,true);
  await act(async()=>{await app.book('session')});
  assert.equal(sends,1);
});
