import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardia contra un error que ya pasó una vez y es invisible hasta que el
 * dueño abre la pantalla: una política RLS que llama a una función que
 * `authenticated` no puede ejecutar.
 *
 * PostgreSQL comprueba el permiso de ejecución al empezar la consulta, antes
 * de evaluar el `or` de la condición. Entonces, si la función no está
 * otorgada, **cualquier** lectura de esa tabla falla con 42501, incluso para
 * administración. Pasó con `finance_permission_enabled`: la 00056 la dejó
 * ejecutable y la 00080 la volvió a crear copiando el `revoke` sin el `grant`.
 * La app mostró «Información financiera no disponible · FIN_REPORT_DEBT_42501»
 * en Reportes y nadie podía leer deudas ni saldos.
 *
 * Esta prueba lee las migraciones en orden, arma el estado final de permisos
 * de cada función propia y falla si una función usada dentro de una política
 * queda sin `grant execute ... to authenticated`.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

export function audit(script) {
  const defined = new Set();
  for (const match of script.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi))
    defined.add(match[1].toLowerCase());

  const usedByPolicies = new Set();
  for (const policy of script.matchAll(/create\s+policy[\s\S]*?;/gi)) {
    for (const call of policy[0].matchAll(/([a-z_][a-z0-9_]*)\s*\(/gi)) {
      const name = call[1].toLowerCase();
      if (defined.has(name)) usedByPolicies.add(name);
    }
  }

  const missing = [];
  for (const name of usedByPolicies) {
    const statement = new RegExp(
      `(revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\s*\\([^;]*;|grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\([^;]*;)`,
      "gi",
    );
    let last = null;
    let granted = false;
    for (const match of script.matchAll(statement)) {
      last = match[0];
      granted = /^grant/i.test(match[0]) && /\bto\b[\s\S]*\bauthenticated\b/i.test(match[0]);
    }
    // Sin ninguna orden de permisos gana el `execute` que PostgreSQL da a
    // PUBLIC al crear la función: la política puede leer.
    if (last && !granted) missing.push(name);
  }

  return { defined, usedByPolicies, missing };
}

function allMigrations() {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS, file), "utf8"))
    .join("\n");
}

test("ninguna política llama a una función que authenticated no puede ejecutar", () => {
  const { defined, usedByPolicies, missing } = audit(allMigrations());
  assert.ok(defined.has("finance_permission_enabled"), "las migraciones tienen que definir la función de permisos");
  assert.ok(
    usedByPolicies.has("finance_permission_enabled"),
    "la prueba tiene que ver que las políticas usan la función de permisos",
  );
  assert.deepEqual(
    missing,
    [],
    `estas funciones se usan en políticas y quedaron sin execute para authenticated: ${missing.join(", ")}`,
  );
});

test("la guardia detecta el error que rompió Reportes (00080 sin el grant de la 00056)", () => {
  const roto = `
    create or replace function public.finance_permission_enabled(p_key text)
    returns boolean language sql as $$ select true $$;
    revoke all on function public.finance_permission_enabled(text) from public, anon, authenticated;
    grant execute on function public.cashier_permissions() to authenticated;
    create policy prueba on public.client_debt_entries for select to authenticated
      using (public.is_admin() or public.finance_permission_enabled('cashier_can_view_receivables'));
  `;
  const auditoria = audit(roto);
  assert.deepEqual(auditoria.missing, ["finance_permission_enabled"]);

  const arreglado = `${roto}
    grant execute on function public.finance_permission_enabled(text) to authenticated;`;
  assert.deepEqual(audit(arreglado).missing, []);
});
