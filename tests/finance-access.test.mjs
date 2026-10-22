import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageFinance, canAccessPanel } from "../src/lib/auth/current-user.ts";

test("cobros y gastos: sólo caja y administración con MFA verificado", () => {
  assert.equal(canManageFinance({ role: "admin", mfa: "ok" }), true);
  assert.equal(canManageFinance({ role: "cashier", mfa: "ok" }), true);
});

test("el entrenador entra al panel pero no a movimientos ni deudas", () => {
  assert.equal(canAccessPanel({ role: "trainer", mfa: "ok" }), true);
  assert.equal(canManageFinance({ role: "trainer", mfa: "ok" }), false);
});

test("sin MFA verificado, nadie maneja finanzas; clientes y nulos tampoco", () => {
  for (const mfa of ["verify", "enroll", "unavailable", "not_required"]) {
    assert.equal(canManageFinance({ role: "cashier", mfa }), false, mfa);
    assert.equal(canManageFinance({ role: "admin", mfa }), false, mfa);
  }
  assert.equal(canManageFinance({ role: "member", mfa: "not_required" }), false);
  assert.equal(canManageFinance(null), false);
  assert.equal(canManageFinance(undefined), false);
});
