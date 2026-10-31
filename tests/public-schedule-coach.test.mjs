import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./helpers/react-loader.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://strong.test/es/horarios",
});
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "FormData"])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = dom.window;
const { render, screen, waitFor, cleanup } = await import("@testing-library/react");

const dict = (await createLoader({})("i18n/dictionaries/es.ts")).default;
const load = createLoader({
  "@/components/providers/dictionary-provider": `export const useDictionary = () => ({ locale: "es", dict: ${JSON.stringify(dict)} });`,
  "@/components/providers/app-provider": `export const useApp = () => ({
    user: null, bookedSessionIds: new Set(), bookingsLoading: false, bookingsError: false,
    book: async () => {}, cancelBySessionId: async () => {}, toast: () => {}, reloadBookings: () => {},
  });`,
  "next/navigation": `export const useRouter = () => ({ push() {}, replace() {}, refresh() {} });
    export const usePathname = () => "/es/horarios";`,
});
const { ScheduleBoard } = await load("components/schedule/schedule-board.tsx");

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

/** Fecha de hoy en el gimnasio y su semana ISO, igual que el resto de la app. */
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Managua",
}).format(new Date());
const weekKey = (() => {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = (date.getUTCDay() + 6) % 7; // lunes = 0
  const thursday = new Date(date.getTime() + (3 - day) * 86400000);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const startDay = (yearStart.getUTCDay() + 6) % 7;
  const week1 = new Date(yearStart.getTime() - startDay * 86400000);
  const week = Math.floor((thursday.getTime() - week1.getTime()) / (7 * 86400000)) + 1;
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
})();

const session = (over = {}) => ({
  id: "ses_zumba",
  class_id: "cls_zumba",
  room: "Salón de baile",
  starts_at: `${today}T18:00:00-06:00`,
  ends_at: `${today}T19:00:00-06:00`,
  capacity: 30,
  bookedCount: 2,
  spotsLeft: 28,
  gymClass: {
    id: "cls_zumba",
    slug: "zumba",
    name_es: "Zumba y bailoterapia",
    name_en: "Zumba",
    color: "#d81a22",
    duration_min: 60,
    is_active: true,
  },
  coach: null,
  ...over,
});

/** Responde /api/sessions con la semana indicada. */
function serve(sessions) {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ weekKey, sessions }),
  });
}

test("La grilla pública muestra quién dicta cada clase", async () => {
  serve([session({ coach: { id: "coa_mr", name: "María Rodríguez" } })]);
  render(React.createElement(ScheduleBoard, {}));
  await waitFor(() => assert.ok(screen.getAllByText(/Zumba y bailoterapia/).length > 0));
  assert.match(document.body.textContent, /con María Rodríguez/);
});

test("Sin entrenador asignado no se inventa un nombre ni queda un «con» suelto", async () => {
  serve([session()]);
  render(React.createElement(ScheduleBoard, {}));
  await waitFor(() => assert.ok(screen.getAllByText(/Zumba y bailoterapia/).length > 0));
  assert.doesNotMatch(document.body.textContent, /con\s+María/);
  assert.doesNotMatch(document.body.textContent, /con\s*$/m);
});
