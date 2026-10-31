import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VOID_MESSAGES,
  VOID_REASON_MAX,
  VOID_REASON_MIN,
  findStoredVoidReceipt,
  parseVoidReceipt,
  voidDiagnostic,
  voidMessage,
  voidOutcome,
  voidResultPath,
  parseVoidPlan,
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

const planBase = {
  transactionId: valid.transactionId,
  concept: "Gimnasio mensual",
  type: "income",
  amount: 560,
  currency: "NIO",
  occurredAt: "2026-10-28T23:52:00-06:00",
  accountId: "caja_fuerte_nio",
  isReversal: false,
  alreadyVoided: false,
  voidedAt: null,
  allowed: true,
  code: "ALLOWED",
};

test("resultado de la anulación: manda lo que quedó guardado, no lo que trajo la respuesta", () => {
  // El 31 de octubre la base anuló cuatro veces y la pantalla mostró un error
  // las cuatro veces. La verdad la tiene la base: si hay comprobante, se anuló.
  const done = voidOutcome(planBase, storedReceipt);
  assert.equal(done.kind, "done");
  assert.equal(done.kind === "done" && done.receipt.reversalId, storedReceipt.reversalId);

  // Si el plan sigue diciendo «se puede anular», no se guardó: se ofrece.
  const pending = voidOutcome(planBase, null);
  assert.equal(pending.kind, "not_done");
  assert.equal(pending.kind === "not_done" && pending.canRetry, true);
  assert.match(pending.kind === "not_done" ? pending.message : "", /sigue tal como estaba/);

  // Si la base ya dijo que no, se usa su motivo y no se ofrece reintentar.
  const off = voidOutcome({ ...planBase, allowed: false, code: "NOT_TODAY", alreadyVoided: false }, null);
  assert.equal(off.kind, "not_done");
  assert.equal(off.kind === "not_done" && off.canRetry, false);
  assert.equal(off.kind === "not_done" ? off.code : "", "NOT_TODAY");
  assert.match(off.kind === "not_done" ? off.message : "", /del día de hoy/);

  // Sin poder leer nada, no se afirma ni una cosa ni la otra.
  const unknown = voidOutcome(null, null);
  assert.equal(unknown.kind, "unknown");
  assert.doesNotMatch(unknown.kind === "unknown" ? unknown.message : "", /no se modificó nada/i);
});

test("resultado de la anulación: la página no deja de existir por un idioma raro", () => {
  assert.equal(voidResultPath("es", valid.transactionId), `/es/panel/caja/anulacion/${valid.transactionId}`);
  assert.equal(voidResultPath("en", valid.transactionId), `/en/panel/caja/anulacion/${valid.transactionId}`);
  assert.ok(voidResultPath("../x", valid.transactionId).startsWith("/es/"));
});

test("la consulta previa se valida antes de usarla", () => {
  assert.equal(parseVoidPlan(planBase)?.code, "ALLOWED");
  assert.equal(parseVoidPlan({ ...planBase, allowed: "sí" }), null);
  assert.equal(parseVoidPlan(null), null);
});

test("un resultado sin confirmar nunca dice que no se modificó nada", () => {
  // La anulación puede haberse guardado y la respuesta perderse en el camino.
  // El texto viejo afirmaba «no se modificó nada» y mentía.
  assert.ok(VOID_MESSAGES.UNCONFIRMED.length > 40);
  assert.doesNotMatch(VOID_MESSAGES.UNCONFIRMED, /no se modificó nada/i);
  assert.doesNotMatch(VOID_MESSAGES.UNKNOWN, /no se modificó nada/i);
  assert.match(VOID_MESSAGES.UNCONFIRMED, /no se anula dos veces/);
  assert.equal(voidMessage("UNCONFIRMED"), VOID_MESSAGES.UNCONFIRMED);
  assert.equal(voidMessage("CODIGO_QUE_NO_EXISTE"), VOID_MESSAGES.UNKNOWN);
});

test("un comprobante guardado se puede volver a validar sin perder el resultado", () => {
  // Regresión real: al releer la anulación desde la bitácora, el comprobante ya
  // venía validado y sin `id`; exigirlo hacía que la pantalla dijera «no se
  // hizo» aunque la reversa estaba guardada.
  const once = parseVoidReceipt(storedReceipt);
  assert.ok(once);
  const twice = parseVoidReceipt(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(twice?.stockRestored, storedReceipt.stockRestored);
  // Un stock vacío no inventa la fila al volver a leer.
  assert.equal(parseVoidReceipt({ ...once, stockRestored: [] })?.stockRestored, undefined);
});

test("cuando no se puede confirmar, el código dice la etapa sin filtrar detalles", () => {
  assert.equal(voidDiagnostic("RPC", "PGRST301"), "ANULACION_RPC_PGRST301");
  assert.equal(voidDiagnostic("COMPROBANTE"), "ANULACION_COMPROBANTE_SIN_CODIGO");
  // Nada de mensajes de la base ni rutas internas: solo mayúsculas seguras.
  assert.equal(voidDiagnostic("rpc fatal: /x", "boom!"), "ANULACION_ETAPA_SIN_CODIGO");
  assert.match(voidDiagnostic("RPC", "42501"), /^ANULACION_RPC_42501$/);
});

const storedReceipt = {
  id: "3e4c774c-558a-4328-8756-fd70c6c8ad7c",
  originalId: valid.transactionId,
  reversalId: "3e4c774c-558a-4328-8756-fd70c6c8ad7c",
  amount: 48,
  currency: "NIO",
  concept: "Anulación: Venta: Agua fuente pura x2",
  originalConcept: "Venta: Agua fuente pura x2",
  reason: "El cliente olvidó su dinero",
  accountName: "Caja Fuerte Córdobas",
  accountBefore: -95776,
  accountAfter: -95824,
  actorName: "Carlos Sequeira",
  occurredAt: "2026-10-31T15:21:05.717037+00:00",
  stockRestored: [{ productId: "f7622a6e-189d-4736-8adb-f24127819856", name: "Agua fuente pura", qty: 2 }],
};
const fakeClient = (result) => ({
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => result }),
    }),
  }),
});

test("si la respuesta se pierde, la anulación guardada se recupera de la bitácora", async () => {
  const found = await findStoredVoidReceipt(fakeClient({ data: { receipt: storedReceipt }, error: null }), valid.transactionId);
  assert.equal(found?.reversalId, storedReceipt.reversalId);
  assert.equal(found?.stockRestored?.[0]?.qty, 2);

  // Sin fila, con error de lectura o con un comprobante incompleto no se
  // inventa nada: se devuelve null y la pantalla pide confirmar en Caja.
  assert.equal(await findStoredVoidReceipt(fakeClient({ data: null, error: null }), valid.transactionId), null);
  assert.equal(await findStoredVoidReceipt(fakeClient({ data: null, error: { code: "42501" } }), valid.transactionId), null);
  assert.equal(await findStoredVoidReceipt(fakeClient({ data: { receipt: { amount: 48 } }, error: null }), valid.transactionId), null);
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
