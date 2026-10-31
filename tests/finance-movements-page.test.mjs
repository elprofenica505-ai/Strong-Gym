import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";

const load = createLoader();
const {
  MOVEMENTS_PAGE_SIZE,
  MOVEMENTS_SEARCH_MAX,
  movementsPageCount,
  movementsPageQuery,
  parseMovementFilters,
  parseMovementsPagePayload,
  parseMovementsResponse,
} = await load("lib/finance/movements-page.ts");

/**
 * Búsqueda y paginación del historial de Caja (FIN-05).
 *
 * La pantalla pedía los últimos 30 movimientos y filtraba en el navegador: un
 * cobro viejo existía y no había forma de encontrarlo. Ahora el servidor
 * resuelve filtro, orden y página, y estas reglas se comparten entre la ruta y
 * la pantalla. Lo que se prueba acá es que lo compartido no invente datos:
 * un filtro raro no rompe, pero una lectura fallida nunca se convierte en
 * «no hay movimientos».
 */

test("sin parámetros se pide la primera página sin filtros", () => {
  const parsed = parseMovementFilters(new URLSearchParams(""));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, {
    page: 0,
    filters: {
      search: "",
      direction: "all",
      status: "all",
      currency: "all",
      method: "all",
    },
  });
});

test("un valor raro cae en el valor por defecto en vez de romper la pantalla", () => {
  const parsed = parseMovementFilters(
    new URLSearchParams({
      q: "  agua  ",
      direction: "regalos",
      status: "perdido",
      currency: "EUR",
      method: "  ",
      page: "abc",
    }),
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.page, 0);
  assert.equal(parsed.value.filters.search, "agua");
  assert.equal(parsed.value.filters.direction, "all");
  assert.equal(parsed.value.filters.status, "all");
  assert.equal(parsed.value.filters.currency, "all");
  assert.equal(parsed.value.filters.method, "all");
});

test("página negativa vuelve a la primera y una búsqueda larguísima se rechaza con motivo", () => {
  assert.equal(
    parseMovementFilters(new URLSearchParams({ page: "-3" })).value.page,
    0,
  );
  const tooLong = parseMovementFilters(
    new URLSearchParams({ q: "a".repeat(MOVEMENTS_SEARCH_MAX + 1) }),
  );
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /80 caracteres/);
});

test("lo que se pide al servidor no manda valores por defecto y conserva la página", () => {
  const query = movementsPageQuery(
    {
      search: "  Gimnasio  ",
      direction: "income",
      status: "completed",
      currency: "NIO",
      method: "none",
    },
    2,
  );
  assert.equal(query.get("q"), "Gimnasio");
  assert.equal(query.get("direction"), "income");
  assert.equal(query.get("status"), "completed");
  assert.equal(query.get("currency"), "NIO");
  assert.equal(query.get("method"), "none");
  assert.equal(query.get("page"), "2");

  const empty = movementsPageQuery(
    { search: "   ", direction: "all", status: "all", currency: "all", method: "all" },
    0,
  );
  assert.equal(empty.toString(), "");
});

test("la respuesta de la base exige total y descarta filas rotas en vez de dibujarlas a medias", () => {
  const parsed = parseMovementsPagePayload({
    total: 42,
    rows: [
      {
        id: "tx-1",
        concept: "Pase del día",
        occurred_at: "2026-10-31T15:00:00Z",
        direction: "income",
        status: "completed",
        amount: 40,
        currency: "NIO",
        voided_reason: null,
      },
      { id: "tx-2", concept: "Sin fecha" },
      { concept: "Sin id", occurred_at: "2026-10-31T15:00:00Z" },
      "basura",
      null,
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.total, 42);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].id, "tx-1");
});

test("una lectura sin total no se convierte en cero: se informa que no se pudo", () => {
  assert.equal(parseMovementsPagePayload(null), null);
  assert.equal(parseMovementsPagePayload({ rows: [] }), null);
  assert.equal(parseMovementsPagePayload({ total: 3, rows: "nada" }), null);
  assert.equal(parseMovementsPagePayload({ total: -1, rows: [] }), null);
  assert.equal(parseMovementsPagePayload({ total: "muchos", rows: [] }), null);
});

test("la respuesta de la API se valida antes de dibujarla", () => {
  const page = parseMovementsResponse({
    ok: true,
    total: 1,
    page: 0,
    pageSize: MOVEMENTS_PAGE_SIZE,
    rows: [
      {
        id: "tx-1",
        occurredAt: "2026-10-31T15:00:00Z",
        direction: "expense",
        status: "completed",
        amount: 120,
        currency: "NIO",
        concept: "Compra de agua",
        voidedReason: null,
      },
    ],
  });
  assert.ok(page);
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].concept, "Compra de agua");
  assert.equal(page.rows[0].voidedReason, null);
  assert.equal(page.pageSize, MOVEMENTS_PAGE_SIZE);

  // Un error de la API no se disfraza de lista vacía.
  assert.equal(
    parseMovementsResponse({ ok: false, code: "MOVEMENTS", message: "no" }),
    null,
  );
  assert.equal(parseMovementsResponse({ ok: true, rows: [] }), null);
  // Una fila sin datos mínimos se descarta, no se dibuja a medias.
  const broken = parseMovementsResponse({
    ok: true,
    total: 1,
    page: 0,
    pageSize: MOVEMENTS_PAGE_SIZE,
    rows: [{ id: "tx-2", occurredAt: "2026-10-31T15:00:00Z" }],
  });
  assert.ok(broken);
  assert.equal(broken.rows.length, 0);
});

test("el paginador nunca muestra «página 1 de 0»", () => {
  assert.equal(movementsPageCount(0), 1);
  assert.equal(movementsPageCount(1), 1);
  assert.equal(movementsPageCount(MOVEMENTS_PAGE_SIZE), 1);
  assert.equal(movementsPageCount(MOVEMENTS_PAGE_SIZE + 1), 2);
  assert.equal(movementsPageCount(Number.NaN), 1);
});
