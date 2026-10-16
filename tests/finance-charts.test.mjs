import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./helpers/react-loader.mjs";
const { MiniBar } = await createLoader()("components/admin/cash-panel.tsx");
const render = (data) =>
  renderToStaticMarkup(
    React.createElement(MiniBar, { data, label: "Resultado informado" }),
  );

test("gráfico: resultado negativo usa magnitud positiva y crece debajo del eje cero", () => {
  const html = render([
    { label: "2026-09", value: -166500 },
    { label: "2026-10", value: -86600 },
  ]);
  assert.match(html, /height:56px;top:64px/);
  assert.match(html, /height:29\.1267\d+px;top:64px/);
  assert.doesNotMatch(html, /height:-|height:.*?%|NaN/);
  assert.match(html, /negativos abajo/);
  assert.match(html, /Ver importes del gráfico/);
  assert.match(html, /-.*86[,.]600/);
});
test("gráfico mixto: ambos signos comparten escala absoluta y eje cero", () => {
  const html = render([
    { label: "positivo", value: 200 },
    { label: "negativo", value: -100 },
  ]);
  assert.match(html, /height:56px;bottom:64px/);
  assert.match(html, /height:28px;top:64px/);
  assert.match(html, /bg-alert/);
  assert.match(html, /bg-brand/);
});
test("gráfico en cero no afirma ausencia de movimientos", () => {
  const html = render([
    { label: "09-19", value: 0 },
    { label: "09-24", value: 0 },
  ]);
  assert.match(html, /importes de los 2 registros mostrados son 0 NIO/);
  assert.match(html, /height:2px;bottom:63px/);
  assert.doesNotMatch(html, /Sin registros informados/);
});
test("gráfico sin registros se diferencia de importes cero", () => {
  const html = render([]);
  assert.match(html, /Sin registros informados para este gráfico/);
  assert.doesNotMatch(html, /registros mostrados son 0 NIO|<table/);
});
test("gráfico móvil: fechas sin partir y espacio desplazable para catorce columnas", () => {
  const html = render(
    Array.from({ length: 14 }, (_, i) => ({
      label: `10-${String(i + 1).padStart(2, "0")}`,
      value: i,
    })),
  );
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /min-width:476px/);
  assert.match(html, /whitespace-nowrap/);
  assert.equal((html.match(/scope="row"/g) || []).length, 14);
});
test("valor no finito no se convierte en una barra cero ni una altura inválida", () => {
  const html = render([{ label: "desconocido", value: NaN }]);
  assert.doesNotMatch(html, /height:NaN|height:2px|son 0 NIO/);
  assert.match(html, /desconocido: —/);
});
