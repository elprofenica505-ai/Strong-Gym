import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLoader } from "./helpers/react-loader.mjs";
const load = createLoader({
  "@/lib/data/queries":
    "export const getCurrentUser=async()=>globalThis.__resetUser;",
});
const { POST } = await load("app/api/admin/reset/route.ts");
for (const role of [null, "member", "coach", "staff"])
  test(`reset retirado: ${role ?? "anónimo"} no obtiene acceso administrativo`, async () => {
    globalThis.__resetUser = role ? { id: "test", role, mfa: "ok" } : null;
    const r = await POST();
    assert.equal(r.status, 403);
  });
test("reset retirado: admin recibe 410 sin ejecutar SQL ni afirmar éxito", async () => {
  globalThis.__resetUser = { id: "test", role: "admin", mfa: "ok" };
  const r = await POST();
  assert.equal(r.status, 410);
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
  const body = await r.json();
  assert.equal(body.error, "RESET_RETIRED");
  assert.ok(!body.ok && !body.deleted);
  const source = readFileSync("src/app/api/admin/reset/route.ts", "utf8");
  assert.ok(!source.includes("getSupabaseServerClient"));
  assert.ok(!source.includes(".delete("));
});
test("ayuda y entrega no recomiendan borrado por coincidencias ni reinstalar para recuperar", () => {
  const help = readFileSync("src/app/[locale]/panel/ayuda/page.tsx", "utf8");
  assert.ok(!help.includes("delete from"));
  assert.ok(!help.includes("no se puede romper nada"));
  assert.ok(!help.includes("ACTUALIZAR.sql"));
  const tool = readFileSync(
    "src/components/admin/import-tools.tsx",
    "utf8",
  ).split("export function ResetTool()")[1];
  assert.ok(!tool.includes("/api/admin/reset"));
  assert.ok(!tool.includes("fetch("));
  assert.ok(tool.includes("aprobación del dueño"));
});
