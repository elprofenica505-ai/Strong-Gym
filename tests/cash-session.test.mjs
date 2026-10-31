import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CASH_AMOUNT_MAX,
  cashDifference,
  cashError,
  cashNeedsReason,
  cashNotesProblem,
  cashRequestSchema,
  parseCashAmount,
  parseCashSession,
  parseCashState,
} from "../src/lib/finance/cash-session.ts";

const session = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  open: true,
  openedAt: "2026-10-31T15:00:00Z",
  openedById: "22222222-2222-4222-8222-222222222222",
  openedByName: "Ana Cajera",
  openingNio: 500,
  openingUsd: 20,
  closedAt: null,
  closedById: null,
  closedByName: null,
  countedNio: null,
  countedUsd: null,
  expectedNio: 1000,
  expectedUsd: 25,
  differenceNio: null,
  differenceUsd: null,
  notes: "Turno de la mañana",
  closeNotes: null,
  movements: {
    incomeNio: 600,
    incomeUsd: 10,
    expenseNio: 100,
    expenseUsd: 5,
    count: 7,
    accounts: [
      {
        accountId: "caja_fuerte_nio",
        currency: "NIO",
        income: 600,
        expense: 100,
      },
    ],
  },
  ...overrides,
});

test("los montos se escriben con coma o punto y hasta dos decimales", () => {
  assert.deepEqual(parseCashAmount("1500"), { ok: true, value: 1500 });
  assert.deepEqual(parseCashAmount("1500.5"), { ok: true, value: 1500.5 });
  assert.deepEqual(parseCashAmount("1500,25"), { ok: true, value: 1500.25 });
  assert.deepEqual(parseCashAmount(" 40 "), { ok: true, value: 40 });
  assert.deepEqual(parseCashAmount(""), { ok: true, value: 0 });
  assert.equal(parseCashAmount("", { required: true }).ok, false);
  for (const bad of ["-5", "1.005", "abc", "1.234", "1e3", "12 34", "."]) {
    assert.equal(parseCashAmount(bad).ok, false, bad);
  }
  assert.equal(parseCashAmount(String(CASH_AMOUNT_MAX + 1)).ok, false);
});

test("un cierre lee la caja tal como la devuelve la base", () => {
  const state = parseCashState({ ok: true, state: { open: session(), history: [] } });
  assert.ok(state);
  assert.equal(state.open?.openingNio, 500);
  assert.equal(state.open?.movements.count, 7);
  assert.equal(state.history.length, 0);
});

test("la base puede devolver los montos como texto: se redondean a centavos", () => {
  const parsed = parseCashSession({
    ok: true,
    session: session({
      openingNio: "500.00",
      expectedNio: "1000.005",
      countedNio: null,
      differenceNio: null,
    }),
  });
  assert.ok(parsed);
  assert.equal(parsed.openingNio, 500);
  assert.equal(parsed.expectedNio, 1000.01);
  assert.equal(parsed.countedNio, null);
});

test("una respuesta rota no se convierte en «no hay caja»", () => {
  assert.equal(parseCashState(null), null);
  assert.equal(parseCashState({ ok: true }), null);
  assert.equal(parseCashState({ ok: true, state: { open: { id: 1 } } }), null);
  assert.equal(parseCashSession({ ok: true, session: {} }), null);
});

test("la diferencia es contado menos esperado, en centavos", () => {
  assert.equal(cashDifference(1000, 1000), 0);
  assert.equal(cashDifference(1000, 960), -40);
  assert.equal(cashDifference(1000, 1010.5), 10.5);
  assert.equal(cashDifference(0.1 + 0.2, 0.3), 0);
});

test("un faltante en cualquier moneda pide motivo", () => {
  const expected = { nio: 1000, usd: 25 };
  assert.equal(cashNeedsReason(expected, { nio: 1000, usd: 25 }), false);
  assert.equal(cashNeedsReason(expected, { nio: 1000, usd: 24 }), true);
  assert.equal(cashNeedsReason(expected, { nio: 990.5, usd: 25 }), true);
});

test("el motivo del cierre es obligatorio sólo si no cuadra", () => {
  assert.equal(cashNotesProblem("", false), null);
  assert.match(cashNotesProblem("", true) ?? "", /no cuadra/i);
  assert.equal(cashNotesProblem("Faltaron C$40", true), null);
  assert.match(cashNotesProblem("x".repeat(501), false) ?? "", /500/);
});

test("los códigos de la base se explican en castellano", () => {
  assert.match(cashError("CASH_ALREADY_OPEN").message, /Ya hay una caja abierta/);
  assert.equal(cashError("CASH_ALREADY_OPEN").code, "CASH_ALREADY_OPEN");
  assert.match(cashError("ERROR: CASH_DIFFERENCE_REASON_REQUIRED").message, /no cuadra/i);
  assert.match(cashError("CASH_NOT_YOURS").message, /otra persona/);
  assert.equal(cashError("42P01").code, "UNKNOWN");
  assert.equal(cashError(undefined).code, "UNKNOWN");
});

test("el pedido de abrir y el de cerrar tienen forma propia", () => {
  const requestId = "33333333-3333-4333-8333-333333333333";
  const sessionId = "11111111-1111-4111-8111-111111111111";

  assert.equal(cashRequestSchema.safeParse({ action: "open", requestId }).success, true);
  assert.equal(
    cashRequestSchema.safeParse({ action: "open", requestId, openNio: 500, openUsd: 20 }).success,
    true,
  );
  // Cerrar exige la caja y las dos monedas contadas.
  assert.equal(cashRequestSchema.safeParse({ action: "close", requestId }).success, false);
  assert.equal(
    cashRequestSchema.safeParse({ action: "close", requestId, sessionId, countedNio: 1000 }).success,
    false,
  );
  assert.equal(
    cashRequestSchema.safeParse({
      action: "close",
      requestId,
      sessionId,
      countedNio: 1000,
      countedUsd: 25,
    }).success,
    true,
  );
  // Montos imposibles y notas largas no pasan.
  assert.equal(
    cashRequestSchema.safeParse({ action: "open", requestId, openNio: -1 }).success,
    false,
  );
  assert.equal(
    cashRequestSchema.safeParse({ action: "open", requestId, openNio: 1.005 }).success,
    false,
  );
  assert.equal(
    cashRequestSchema.safeParse({ action: "open", requestId, notes: "x".repeat(501) }).success,
    false,
  );
  assert.equal(cashRequestSchema.safeParse({ action: "abrir", requestId }).success, false);
  assert.equal(cashRequestSchema.safeParse({ action: "open", requestId: "no-uuid" }).success, false);
});
