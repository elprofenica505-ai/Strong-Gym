import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCurrentUser, canAccessPanel } from "../src/lib/auth/current-user.ts";

const id = "10be1244-4fd5-459b-9995-1d195e9e8ec1";
const identity = {
  id, email: "admin@example.com", created_at: "2026-10-01T00:00:00Z",
  user_metadata: { full_name: "Admin de prueba", role: "admin" },
};

function client({ role = "admin", profileError = null, missing = false, authError = null, throwProfile = false } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: identity }, error: authError }) },
    from(table) {
      assert.equal(table, "profiles");
      return {
        select(columns) {
          assert.ok(columns.includes("role"));
          assert.ok(!columns.includes("*"));
          return this;
        },
        eq(column, value) {
          assert.equal(column, "id");
          assert.equal(value, id);
          return this;
        },
        async maybeSingle() {
          if (throwProfile) throw new Error("network unavailable");
          return { data: missing ? null : { id, role, full_name: "Perfil real", plan_id: "pln_boxeo" }, error: profileError };
        },
      };
    },
  };
}

for (const role of ["admin", "staff", "member"]) {
  test(`rol ${role}: se lee desde profiles y determina acceso al panel/menú`, async () => {
    const user = await resolveCurrentUser(client({ role }));
    assert.equal(user.role, role);
    assert.equal(user.profileStatus, "ready");
    assert.equal(user.fullName, "Perfil real");
    assert.equal(user.planId, "pln_boxeo");
    assert.equal(canAccessPanel(user), role !== "member");
  });
}

test("sesión no verificada: no se consulta profiles ni se confía en metadata", async () => {
  const mock = client({ authError: { message: "invalid token" } });
  mock.from = () => assert.fail("no consultar sin identidad verificada");
  assert.equal(await resolveCurrentUser(mock), null);
  assert.equal(canAccessPanel(null), false);
});

for (const [name, options, expected] of [
  ["error RLS", { profileError: { code: "42501" } }, "error"],
  ["perfil inexistente/no visible", { missing: true }, "missing"],
  ["red caída", { throwProfile: true }, "error"],
  ["rol desconocido", { role: "owner" }, "error"],
]) {
  test(`${name}: no se degrada a member ni se concede acceso`, async () => {
    const user = await resolveCurrentUser(client(options));
    assert.equal(user.id, id);
    assert.equal(user.role, null);
    assert.equal(user.profileStatus, expected);
    assert.equal(canAccessPanel(user), false);
  });
}

test("sin usuario autenticado no hay acceso", async () => {
  const mock = client();
  mock.auth.getUser = async () => ({ data: { user: null }, error: null });
  assert.equal(await resolveCurrentUser(mock), null);
});
