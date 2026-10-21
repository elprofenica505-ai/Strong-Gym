import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";

const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { AttendanceTable } = await createLoader({})("components/attendance/attendance-table.tsx");

const data = {
  clientId: "c1", today: "2026-10-21", totalVisits: 5, lastVisit: "2026-10-21", visits30Days: 4,
  days: ["2026-10-21", "2026-10-20"],
  weeks: [{ weekStart: "2026-10-19", visits: 3 }],
  months: [{ month: "2026-10", visits: 4 }],
};
const html = (props) => renderToStaticMarkup(React.createElement(AttendanceTable, props));

test("muestra totales, semanas con ceros y meses en español", () => {
  const h = html({ data });
  assert.ok(h.includes("Visitas en total"));
  assert.ok(h.includes(">5<") || h.includes(">5</p>"));
  assert.ok(h.includes("del 19/10 al 25/10"));
  assert.ok(h.includes("del 12/10 al 18/10")); // semana sin visitas aparece con 0
  assert.ok(h.includes("octubre 2026"));
  assert.ok(h.includes("21/10/2026"));
});

test("sin datos muestra mensaje, no ceros inventados", () => {
  const h = html({ data: null });
  assert.ok(h.includes("No hay asistencia para mostrar"));
  assert.ok(!h.includes("Visitas en total"));
});

test("en el título personalizado para el cliente", () => {
  assert.ok(html({ data, title: "Mi asistencia" }).includes("Mi asistencia"));
});
