import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdminRole, isFinanceRole, isStaffRole } from "../src/lib/auth/current-user.ts";

test("roles: administrador y caja manejan finanzas; sólo administrador maneja lo administrativo", () => {
  assert.equal(isFinanceRole("admin"), true);
  assert.equal(isFinanceRole("cashier"), true);
  assert.equal(isFinanceRole("trainer"), false);
  assert.equal(isFinanceRole("member"), false);
  assert.equal(isFinanceRole("staff"), false, "el rol staff fue retirado en la fase B");

  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("cashier"), false);
  assert.equal(isAdminRole("trainer"), false);
  assert.equal(isAdminRole(null), false);
});

test("roles: personal con MFA incluye entrenador; el cliente y los valores desconocidos no", () => {
  for (const role of ["admin", "cashier", "trainer"]) assert.equal(isStaffRole(role), true, role);
  for (const role of ["member", "staff", "coach", "", null, undefined]) assert.equal(isStaffRole(role), false, String(role));
});
