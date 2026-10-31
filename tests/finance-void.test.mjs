import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VOID_MESSAGES,
  VOID_REASON_MAX,
  VOID_REASON_MIN,
  parseVoidReceipt,
  voidMessage,
  voidRequestSchema,
} from "../src/lib/finance/voids.ts";
import {
  CASHIER_PERMISSION_FIELDS,
  CASHIER_PERMISSIONS_ALL,
  CASHIER_PERMISSION_KEYS,
  normalizeCashierPermissions,
} from "../src/lib/finance/cashier-permissions.ts";

const valid = {
  transactionId: "66701e7b-b7cb-49ed-8ac0-9d2fd81beab1",
  reason: "Cobro cargado en la cuenta equivocada",
  requestId: "11111111-1111-4111-8111-111111111111",
};

test("anular: el pedido exige movimiento, motivo y referencia de idempotencia", () => {
  assert.equal(voidRequestSchema.safeParse(valid).success, true);
  assert.equal(voidRequestSchema.safeParse({ ...valid, transactionId: "x" }).success, false);
  assert.equal(voidRequestSchema.safeParse({ ...valid, requestId: "x" }).success, false);
  assert.equal(voidRequestSchema.safeParse({ ...valid, reason: "cort" }).success, false);
  assert.equal(
    voidRequestSchema.safeParse({ ...valid, reason: "a".repeat(VOID_REASON_MAX + 1) }).success,
    false,
  );
  // El motivo se recorta: no se guardan espacios de más.
  const parsed = voidRequestSchema.parse({ ...valid, reason: `  ${valid.reason}  ` });
  assert.equal(parsed.reason, valid.reason);
  assert.equal(VOID_REASON_MIN, 5);
});

test("anular: cada código de la base tiene un texto propio y en voseo", () => {
  for (const code of [
    "AUTH",
    "NOT_FOUND",
    "ALREADY_VOIDED",
    "IS_REVERSAL",
    "NOT_VOIDABLE",
    "PERMISSION_OFF",
    "NOT_YOURS",
    "NOT_TODAY",
    "INVALID_REASON",
    "REQUEST_CONFLICT",
    "FINANCE_REVIEW_REQUIRED",
  ]) {
    assert.equal(typeof VOID_MESSAGES[code], "string", code);
    assert.ok(VOID_MESSAGES[code].length > 20, code);
  }
  assert.equal(voidMessage("NOT_TODAY"), VOID_MESSAGES.NOT_TODAY);
  assert.equal(voidMessage(undefined), VOID_MESSAGES.UNKNOWN);
});

test("anular: el comprobante se valida antes de mostrarse", () => {
  const receipt = {
    id: "3e4c774c-558a-4328-8756-fd70c6c8ad7c",
    originalId: valid.transactionId,
    reversalId: "3e4c774c-558a-4328-8756-fd70c6c8ad7c",
    amount: 560,
    currency: "NIO",
    concept: "Anulación: Gimnasio mensual",
    originalConcept: "Gimnasio mensual",
    reason: valid.reason,
    accountName: "Caja fuerte NIO",
    accountBefore: 1000,
    accountAfter: 440,
    actorName: "Carlos Sequeira",
    occurredAt: "2026-10-31T06:02:55.392523+00:00",
  };
  const parsed = parseVoidReceipt(receipt);
  assert.equal(parsed?.reversalId, receipt.reversalId);
  assert.equal(parsed?.accountAfter, 440);
  assert.equal(parseVoidReceipt({ ...receipt, amount: "560" }), null);
  assert.equal(parseVoidReceipt(null), null);
});

test("anular una venta con productos: el comprobante cuenta el stock devuelto", () => {
  const base = {
    id: "3e4c774c-558a-4328-8756-fd70c6c8ad7c",
    originalId: valid.transactionId,
    reversalId: "3e4c774c-558a-4328-8756-fd70c6c8ad7c",
    amount: 72,
    currency: "NIO",
    concept: "Anulación: Venta: Agua fuente pura x3",
    originalConcept: "Venta: Agua fuente pura x3",
    reason: valid.reason,
    accountName: "Caja fuerte NIO",
    accountBefore: 1000,
    accountAfter: 1072,
    actorName: "Carlos Sequeira",
    occurredAt: "2026-10-31T06:02:55.392523+00:00",
  };
  const agua = { productId: "f7622a6e-189d-4736-8adb-f24127819856", name: "Agua fuente pura", qty: 3 };
  assert.deepEqual(parseVoidReceipt({ ...base, stockRestored: [agua] })?.stockRestored, [agua]);
  // Un cobro sin productos no inventa la fila.
  assert.equal(parseVoidReceipt({ ...base, stockRestored: [] })?.stockRestored, undefined);
  assert.equal(parseVoidReceipt(base)?.stockRestored, undefined);
  // Un comprobante con cantidades rotas no se muestra a medias.
  assert.equal(parseVoidReceipt({ ...base, stockRestored: [{ ...agua, qty: "3" }] }), null);
});

test("interruptor de anulación: nace apagado y el administrador lo ve encendido", () => {
  assert.ok(CASHIER_PERMISSION_FIELDS.includes("void"));
  assert.equal(CASHIER_PERMISSION_KEYS.void, "cashier_can_void");
  assert.equal(normalizeCashierPermissions({}).void, false);
  assert.equal(normalizeCashierPermissions({ void: "sí" }).void, false);
  assert.equal(normalizeCashierPermissions({ void: true }).void, true);
  assert.equal(CASHIER_PERMISSIONS_ALL.void, true);
  // Los seis permisos anteriores no cambian de nombre.
  assert.equal(normalizeCashierPermissions({ expenses: true }).expenses, true);
});
