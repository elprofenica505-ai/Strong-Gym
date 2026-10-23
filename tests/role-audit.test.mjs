import { test } from "node:test";
import assert from "node:assert/strict";
import { roleAuditItems } from "../src/lib/admin/role-audit.ts";

const names = new Map([["t1", "ANA EJEMPLO"], ["a1", "ADMIN EJEMPLO"]]);

test("traduce roles y resuelve nombres de la persona y de quien hizo el cambio", () => {
  const [item] = roleAuditItems(
    [{ id: 7, targetId: "t1", oldRole: "member", newRole: "trainer", changedBy: "a1", changedAt: "2026-10-22T02:00:00Z" }],
    names,
  );
  assert.deepEqual(item, { id: 7, person: "ANA EJEMPLO", from: "Cliente", to: "Entrenador", by: "ADMIN EJEMPLO", at: "2026-10-22T02:00:00Z" });
});

test("un id desconocido no oculta el cambio y el cambio sin autor dice Sistema", () => {
  const [item] = roleAuditItems(
    [{ id: 8, targetId: "x", oldRole: "trainer", newRole: "cashier", changedBy: null, changedAt: "2026-10-22T02:00:00Z" }],
    names,
  );
  assert.equal(item.person, "Sin nombre");
  assert.equal(item.by, "Sistema");
  assert.equal(item.from, "Entrenador");
  assert.equal(item.to, "Cajero");
});

test("un rol que no conocemos se muestra tal cual", () => {
  const [item] = roleAuditItems(
    [{ id: 9, targetId: "t1", oldRole: "otro", newRole: "member", changedBy: "a1", changedAt: "x" }],
    names,
  );
  assert.equal(item.from, "otro");
});
