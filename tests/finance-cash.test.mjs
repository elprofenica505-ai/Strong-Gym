import { test } from "node:test";
import assert from "node:assert/strict";
import {
  movementResultSchema,
  movementSchema,
  receiptSchema,
} from "../src/lib/finance/movements.ts";

const clientId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";

const service = {
  kind: "service_income",
  requestId: clientId,
  amount: 100,
  currency: "NIO",
  method: "efectivo_nio",
  account: "caja_fuerte_nio",
  concept: "Gimnasio semanal",
  fx: 36.5,
  clientId,
  items: [],
};

test("efectivo recibido: alcanza, es igual al total o queda vacío", () => {
  assert.equal(movementSchema.safeParse(service).success, true);
  assert.equal(
    movementSchema.safeParse({ ...service, cashReceived: 100 }).success,
    true,
  );
  assert.equal(
    movementSchema.safeParse({ ...service, cashReceived: 150 }).success,
    true,
  );
});

test("efectivo recibido: no se acepta si no alcanza ni con más de dos decimales", () => {
  const short = movementSchema.safeParse({ ...service, cashReceived: 99.99 });
  assert.equal(short.success, false);
  assert.equal(short.error?.issues[0]?.message, "CASH_LESS_THAN_TOTAL");
  assert.equal(
    movementSchema.safeParse({ ...service, cashReceived: 150.005 }).success,
    false,
  );
  assert.equal(
    movementSchema.safeParse({ ...service, cashReceived: -5 }).success,
    false,
  );
});

test("efectivo recibido: el total incluye los productos del cobro", () => {
  const withItems = {
    ...service,
    amount: 100,
    items: [{ product: productId, qty: 2, unitPrice: 24 }],
  };
  assert.equal(
    movementSchema.safeParse({ ...withItems, cashReceived: 148 }).success,
    true,
  );
  assert.equal(
    movementSchema.safeParse({ ...withItems, cashReceived: 147.99 }).success,
    false,
  );
});

test("efectivo recibido: un gasto no lo admite", () => {
  const expense = movementSchema.safeParse({
    kind: "expense",
    requestId: clientId,
    amount: 10,
    currency: "NIO",
    method: "efectivo_nio",
    account: "caja_fuerte_nio",
    concept: "Compra",
    fx: 36.5,
    category: "insumos",
    cashReceived: 20,
  });
  assert.equal(expense.success, false);
});

test("comprobante: el efectivo y el vuelto también aplican a un cobro", () => {
  const receipt = {
    id: clientId,
    reference: "SG-11111111",
    requestId: clientId,
    kind: "service_income",
    occurredAt: "2026-10-31T06:00:00+00:00",
    amount: 100,
    currency: "NIO",
    amountNio: 100,
    amountUsd: 2.7397,
    fx: 36.5,
    concept: "Gimnasio semanal",
    clientId,
    clientName: "Socia",
    categoryName: null,
    accountId: "caja_fuerte_nio",
    accountName: "Caja fuerte",
    methodName: "Efectivo",
    actorId: clientId,
    actorName: "Cajero",
    accountBefore: 0,
    accountAfter: 100,
    cashReceived: 150,
    changeGiven: 50,
  };
  assert.equal(receiptSchema.safeParse(receipt).success, true);
  // La resta tiene que dar exactamente el importe cobrado.
  assert.equal(
    receiptSchema.safeParse({ ...receipt, changeGiven: 40 }).success,
    false,
  );
  // Si aparece uno de los dos, tienen que aparecer ambos.
  assert.equal(
    receiptSchema.safeParse({ ...receipt, changeGiven: undefined }).success,
    false,
  );
  // Sigue valiendo sin efectivo, como cualquier cobro anterior.
  assert.equal(
    receiptSchema.safeParse({
      ...receipt,
      cashReceived: undefined,
      changeGiven: undefined,
    }).success,
    true,
  );
});

test("resultado del checkout: el vuelto se calcula sobre el total", () => {
  const result = {
    id: clientId,
    transactionIds: [clientId],
    receipts: [{ id: clientId, label: "Gimnasio semanal", amount: 100 }],
    serviceAmount: 100,
    productsTotal: 0,
    total: 100,
    currency: "NIO",
    cashReceived: 500,
    changeGiven: 400,
  };
  assert.equal(movementResultSchema.safeParse(result).success, true);
  assert.equal(
    movementResultSchema.safeParse({ ...result, changeGiven: 399 }).success,
    false,
  );
});
