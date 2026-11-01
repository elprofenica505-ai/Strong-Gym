import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLoader } from "./helpers/react-loader.mjs";

/**
 * FIN-03: cuentas, métodos, categorías y transferencias.
 *
 * Lo que se cuida acá es lo que decide plata: la conversión que se muestra
 * antes de confirmar, los topes de cada formulario, que una cuenta sin permiso
 * muestre «saldo oculto» y no un cero, y que la ruta no acepte cambios sin
 * origen propio ni sin administrador con segundo factor.
 *
 * Las reglas de la base (saldos, contra-asientos, arqueo) se prueban contra
 * PostgreSQL de verdad en `scripts/test-cuentas-sql.mjs`.
 */
const loader = createLoader();
const {
  parseMoneyInput,
  transferPreview,
  validateAccountForm,
  validateMethodForm,
  validateCategoryForm,
  validateTransferForm,
  parseAccountsState,
  activeAccounts,
  totalsByCurrency,
  accountsErrorMessage,
  accountTypeLabel,
  auditActionLabel,
  ACCOUNT_AMOUNT_MAX,
  DEFAULT_FX,
} = await loader("lib/finance/accounts.ts");

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("lee importes escritos en el celular, sin inventar centavos", () => {
  assert.equal(parseMoneyInput("1000"), 1000);
  assert.equal(parseMoneyInput("1000,50"), 1000.5);
  assert.equal(parseMoneyInput(" 12.34 "), 12.34);
  assert.equal(parseMoneyInput("1.005"), null);
  assert.equal(parseMoneyInput(""), null);
  assert.equal(parseMoneyInput("-5"), null);
  assert.equal(parseMoneyInput("1e3"), null);
  assert.equal(parseMoneyInput("abc"), null);
});

test("la vista previa de la transferencia usa la misma regla que la base", () => {
  assert.deepEqual(
    transferPreview({ amount: 1000, fromCurrency: "NIO", toCurrency: "NIO", fx: DEFAULT_FX }),
    { amountIn: 1000, message: null },
  );
  assert.equal(
    transferPreview({ amount: 3660, fromCurrency: "NIO", toCurrency: "USD", fx: 36.6 }).amountIn,
    100,
  );
  assert.equal(
    transferPreview({ amount: 100, fromCurrency: "USD", toCurrency: "NIO", fx: 36.6 }).amountIn,
    3660,
  );
  assert.equal(
    transferPreview({ amount: 2000, fromCurrency: "USD", toCurrency: "USD", fx: DEFAULT_FX }).amountIn,
    2000,
  );
  // Sin tasa no se inventa un cambio.
  const noRate = transferPreview({ amount: 100, fromCurrency: "NIO", toCurrency: "USD", fx: Number.NaN });
  assert.equal(noRate.amountIn, null);
  assert.match(noRate.message, /tasa/i);
  assert.equal(transferPreview({ amount: 0, fromCurrency: "NIO", toCurrency: "NIO", fx: 36.6 }).amountIn, null);
  assert.equal(transferPreview({ amount: 1.005, fromCurrency: "NIO", toCurrency: "NIO", fx: 36.6 }).amountIn, null);
});

test("una cuenta se valida antes de guardar", () => {
  const ok = validateAccountForm({
    name: "  Caja fuerte córdobas ",
    accountType: "caja_fuerte",
    currency: "NIO",
    bankName: "  ",
    accountNumber: "",
    displayOrder: 10,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.name, "Caja fuerte córdobas");
  assert.equal(ok.value.bankName, null);
  assert.equal(ok.value.isActive, true);

  assert.equal(validateAccountForm({ name: "X", accountType: "banco", currency: "NIO" }).ok, false);
  assert.equal(validateAccountForm({ name: "Cuenta", accountType: "cripto", currency: "NIO" }).ok, false);
  assert.equal(validateAccountForm({ name: "Cuenta", accountType: "banco", currency: "EUR" }).ok, false);
  assert.equal(
    validateAccountForm({ name: "Cuenta", accountType: "banco", currency: "NIO", displayOrder: -1 }).ok,
    false,
  );
  assert.equal(
    validateAccountForm({ name: "Cuenta", accountType: "banco", currency: "NIO", bankName: "x".repeat(61) }).ok,
    false,
  );
});

test("métodos y categorías tienen sus propios topes", () => {
  const method = validateMethodForm({ name: "Tarjeta", currency: "BOTH", feePct: 2.5 });
  assert.equal(method.ok, true);
  assert.equal(method.value.feePct, 2.5);
  assert.equal(validateMethodForm({ name: "Tarjeta", currency: "EUR" }).ok, false);
  assert.equal(validateMethodForm({ name: "Tarjeta", currency: "NIO", feePct: 101 }).ok, false);
  assert.equal(validateMethodForm({ name: "Tarjeta", currency: "NIO", feePct: 2.555 }).ok, false);

  const category = validateCategoryForm({ name: "Mantenimiento", color: "#00AA99", budgetMonthly: 1500 });
  assert.equal(category.ok, true);
  assert.equal(category.value.color, "#00aa99");
  assert.equal(category.value.budgetMonthly, 1500);
  assert.equal(validateCategoryForm({ name: "Luz", color: "rojo" }).ok, false);
  assert.equal(validateCategoryForm({ name: "Luz", color: "#fff" }).ok, false);
  assert.equal(
    validateCategoryForm({ name: "Luz", color: "#ffffff", budgetMonthly: ACCOUNT_AMOUNT_MAX + 1 }).ok,
    false,
  );
});

test("la transferencia rechaza lo que la base también rechazaría", () => {
  const ok = validateTransferForm({
    from: "banco_bac_nio",
    to: "caja_fuerte_nio",
    amount: 1000,
    fx: 36.6,
    concept: " Depósito de la semana ",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.concept, "Depósito de la semana");

  assert.equal(
    validateTransferForm({ from: "a", to: "a", amount: 10, fx: 36.6, concept: "Motivo" }).ok,
    false,
  );
  assert.equal(
    validateTransferForm({ from: "a", to: "b", amount: 0, fx: 36.6, concept: "Motivo" }).ok,
    false,
  );
  assert.equal(
    validateTransferForm({ from: "a", to: "b", amount: 10, fx: 0, concept: "Motivo" }).ok,
    false,
  );
  assert.equal(
    validateTransferForm({ from: "a", to: "b", amount: 10, fx: 36.6, concept: "x" }).ok,
    false,
  );
});

test("el estado se lee aunque los importes lleguen como texto", () => {
  const state = parseAccountsState({
    accounts: [
      {
        id: "caja_fuerte_nio",
        name: "Caja fuerte córdobas",
        accountType: "caja_fuerte",
        currency: "NIO",
        bankName: null,
        accountNumber: null,
        isActive: true,
        displayOrder: 1,
        balance: "-96944.00",
        movements: 15,
        cashOpen: false,
      },
      {
        id: "banco_bac_nio",
        name: "BAC córdobas",
        accountType: "banco",
        currency: "NIO",
        bankName: "BAC",
        accountNumber: "123",
        isActive: true,
        displayOrder: 2,
        balance: "45000.50",
        movements: 3,
        cashOpen: false,
      },
      {
        id: "apagada",
        name: "Vieja",
        accountType: "banco",
        currency: "USD",
        isActive: false,
        displayOrder: 9,
        balance: null,
        movements: 0,
        cashOpen: false,
      },
    ],
    methods: [{ id: "efectivo", name: "Efectivo", currency: "NIO", feePct: "2.5", isActive: true, displayOrder: 1, movements: 4 }],
    categories: [
      { id: "luz", name: "Luz", color: "#ffcc00", budgetMonthly: "1500.00", isActive: true, displayOrder: 1, movements: 2 },
    ],
    transfers: [
      {
        id: "t1",
        occurredAt: "2026-11-01T12:00:00Z",
        status: "completed",
        fromId: "banco_bac_nio",
        fromName: "BAC córdobas",
        toId: "caja_fuerte_nio",
        toName: "Caja fuerte córdobas",
        amountOut: "1000.00",
        currencyOut: "NIO",
        amountIn: "1000.00",
        currencyIn: "NIO",
        fx: "36.6",
        amountNio: "1000.00",
        concept: "Transferencia · Depósito",
        createdByName: "Carlos",
        voided: false,
        voidReason: null,
      },
    ],
    audit: [],
    canManage: true,
    balancesVisible: true,
    rules: { transferRule: "No es ingreso ni gasto." },
  });

  assert.ok(state);
  assert.equal(state.accounts.length, 3);
  assert.equal(state.accounts[0].balance, -96944);
  assert.equal(state.accounts[1].balance, 45000.5);
  assert.equal(state.methods[0].feePct, 2.5);
  assert.equal(state.categories[0].budgetMonthly, 1500);
  assert.equal(state.transfers[0].amountOut, 1000);
  assert.equal(state.transfers[0].voided, false);

  // Suma sólo las activas y respeta el saldo oculto.
  assert.equal(activeAccounts(state).length, 2);
  assert.deepEqual(totalsByCurrency(state), { nio: -51943.5, usd: 0 });

  const hidden = { ...state, balancesVisible: false, accounts: state.accounts.map((a) => ({ ...a, balance: null })) };
  assert.deepEqual(totalsByCurrency(hidden), { nio: 0, usd: 0 });
});

test("una respuesta rara no se convierte en una lista vacía", () => {
  assert.equal(parseAccountsState(null), null);
  assert.equal(parseAccountsState({ accounts: [] }), null);
  assert.equal(parseAccountsState({ hola: 1 }), null);
  // Sin cuentas pero con la forma correcta sí es un estado válido: el gimnasio
  // puede no tener ninguna cuenta cargada todavía.
  const empty = parseAccountsState({ accounts: [], methods: [] });
  assert.ok(empty);
  assert.equal(empty.accounts.length, 0);
  assert.equal(empty.canManage, false);
  assert.equal(empty.balancesVisible, false);
});

test("los textos de error se explican sin culpar al usuario", () => {
  assert.match(accountsErrorMessage("AUTH"), /administrador/i);
  assert.match(accountsErrorMessage("ACCOUNT_IN_OPEN_CASH"), /turno abierto/i);
  assert.match(accountsErrorMessage("ACCOUNT_CURRENCY_LOCKED"), /moneda/i);
  assert.match(accountsErrorMessage("REQUEST_CONFLICT"), /recarg/i);
  assert.match(accountsErrorMessage("CUALQUIERA"), /No se cambió nada/);
  assert.match(accountsErrorMessage(null), /No se cambió nada/);
  assert.equal(accountTypeLabel("caja_fuerte"), "Caja fuerte");
  assert.equal(accountTypeLabel("raro"), "raro");
  assert.equal(auditActionLabel("transfer_create"), "Transferencia");
});

test("la ruta exige origen propio, administrador con segundo factor y no borra nada", () => {
  const route = source("src/app/api/admin/finance/accounts/route.ts");
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /isAdminRole\(user\.role\)/);
  assert.match(route, /user\.mfa !== "ok"/);
  assert.match(route, /finance_transfer_create/);
  assert.match(route, /finance_transfer_void/);
  // Nada de DELETE: las cuentas se apagan.
  assert.doesNotMatch(route, /export async function DELETE/);
  // La idempotencia viaja desde el navegador y la base la comprueba.
  assert.match(route, /requestId: z\.uuid\(\)/);
});

test("la migración deja la plata en una sola fila y el arqueo la cuenta", () => {
  const migracion = source("supabase/migrations/00096_transferencias_y_arqueo.sql");
  assert.match(migracion, /'transfer', 'completed'/);
  assert.match(migracion, /destination_account_id/);
  assert.match(migracion, /transferInNio/);
  assert.match(migracion, /transferOutNio/);
  // El contra-asiento deja la original como estaba: no se borra ni se "cancela"
  // para que el arqueo no cuente dos veces la devolución.
  assert.doesNotMatch(migracion, /set status = 'cancelled'/);
  // Los dos saldos se tocan con bloqueo, en orden, para no cruzarse.
  assert.match(migracion, /order by id for update/);
});
