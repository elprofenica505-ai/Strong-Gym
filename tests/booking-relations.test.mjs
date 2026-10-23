import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";
const load = createLoader({
  "server-only": "export {};",
  "@/lib/supabase/env": "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
  "@/lib/supabase/server":
    "export const getSupabaseServerClient=async()=>globalThis.__relationDb;",
});
const q = await load("lib/data/queries.ts");
const { rowsByIds } = await load("lib/data/relations.ts");
const { DataReadError } = await load("lib/data/read-result.ts");
const fixture = {
  bookings: [
    {
      id: "b1",
      user_id: "u1",
      session_id: "s1",
      status: "confirmed",
      created_at: "2026-10-17T12:00:00Z",
      cancelled_at: null,
    },
  ],
  sessions: [
    {
      id: "s1",
      class_id: "c1",
      coach_id: "t1",
      capacity: 10,
      starts_at: "2026-10-19T12:00:00Z",
      ends_at: "2026-10-19T13:00:00Z",
      status: "scheduled",
      room: "Sala EJEMPLO",
    },
  ],
  classes: [
    { id: "c1", name_es: "Clase EJEMPLO", capacity: 10, is_active: false },
  ],
  coaches_public: [{ id: "t1", name: "Entrenador EJEMPLO", is_active: false }],
  profiles: [
    { id: "u1", full_name: "Cliente EJEMPLO", email: "prueba@example.com" },
  ],
  session_occupancy: [{ session_id: "s1", booked_count: 3 }],
};
function setup({ fail, omit, change } = {}) {
  const calls = [];
  globalThis.__relationDb = {
    from(table) {
      const call = { table, columns: "", ids: null, eq: [] };
      calls.push(call);
      const chain = {
        select(columns) {
          call.columns = columns;
          return chain;
        },
        in(field, values) {
          call.ids = { field, values };
          return chain;
        },
        eq(field, value) {
          call.eq.push([field, value]);
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        gte() {
          return chain;
        },
        lte() {
          return chain;
        },
        abortSignal() {
          return chain;
        },
        then(yes, no) {
          return Promise.resolve()
            .then(() => {
              // Reproduce el PGRST200 reportado: cualquier join embebido falla.
              if (call.columns.includes(":") || call.columns.includes("("))
                return { data: null, error: { code: "PGRST200" } };
              if (table === fail)
                return {
                  data: null,
                  error: { code: "42501", message: "SECRET" },
                };
              let data = structuredClone(fixture[table] ?? []);
              if (table === omit) data = [];
              if (change) data = change(table, data);
              if (call.ids)
                data = data.filter((row) =>
                  call.ids.values.includes(row[call.ids.field]),
                );
              for (const [key, val] of call.eq)
                data = data.filter((row) => row[key] === val);
              return { data, error: null };
            })
            .then(yes, no);
        },
      };
      return chain;
    },
  };
  return calls;
}
test("Mi cuenta: PGRST200 en joins no afecta la composición explícita de reservas", async () => {
  const calls = setup();
  const rows = await q.getMyBookings("u1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session.gymClass.name_es, "Clase EJEMPLO");
  assert.equal(rows[0].session.coach.name, "Entrenador EJEMPLO");
  assert.ok(calls.every((c) => !c.columns.includes(":")));
  assert.deepEqual(calls[0].eq, [["user_id", "u1"]]);
});
test("Panel: cliente, sesión, disciplina y entrenador resueltos sin joins", async () => {
  setup();
  const [row] = await q.getAllBookings();
  assert.equal(row.memberName, "Cliente EJEMPLO");
  assert.equal(row.session.coach.name, "Entrenador EJEMPLO");
});
test("Horarios: misma composición con ocupación confirmada", async () => {
  setup();
  const [row] = (await q.getSessionsForWeek()).sessions;
  assert.equal(row.spotsLeft, 7);
  assert.equal(row.bookedCount, 3);
});
test("reservas vacías no necesitan relaciones ni catálogos ficticios", async () => {
  const calls = setup({ omit: "bookings" });
  assert.deepEqual(await q.getMyBookings("u1"), []);
  assert.deepEqual(
    calls.map((c) => c.table),
    ["bookings"],
  );
});
for (const table of ["sessions", "classes", "coaches_public", "profiles"])
  test(`fallo de permisos en ${table}: se conserva el error, no se elude RLS`, async () => {
    setup({ fail: table });
    await assert.rejects(
      q.getAllBookings(),
      (e) =>
        e instanceof DataReadError &&
        e.code.endsWith("42501") &&
        !e.message.includes("SECRET"),
    );
  });
for (const table of ["sessions", "classes", "coaches_public", "profiles"])
  test(`relación ausente/invisible ${table}: no se pierde la reserva en silencio`, async () => {
    setup({ omit: table });
    await assert.rejects(
      q.getAllBookings(),
      (e) => e instanceof DataReadError && e.code.endsWith("RELATION"),
    );
  });
test("entrenador opcional NULL: no se inventa entrenador ni se consulta sin IDs", async () => {
  const calls = setup({
    change: (table, rows) =>
      table === "sessions" ? rows.map((r) => ({ ...r, coach_id: null })) : rows,
  });
  const [row] = await q.getMyBookings("u1");
  assert.equal(row.session.coach, null);
  assert.ok(!calls.some((c) => c.table === "coaches_public"));
});
test("lecturas por ID deduplican y dividen lotes grandes sin cambiar el orden de reservas", async () => {
  const ids = Array.from({ length: 205 }, (_, i) => `s${i}`);
  const calls = setup({
    change: (table, rows) =>
      table === "sessions" ? ids.map((id) => ({ id })) : rows,
  });
  const found = await rowsByIds(
    globalThis.__relationDb,
    "sessions",
    "id",
    [...ids, "s0"],
    "TEST",
  );
  assert.equal(found.size, 205);
  assert.deepEqual(
    calls.map((c) => c.ids.values.length),
    [100, 100, 5],
  );
});
