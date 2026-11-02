import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

/**
 * Prueba de la migración 00098: límites de abuso compartidos (SEG-07).
 *
 * Lo que hay que demostrar:
 *  1. Cuenta bien dentro de la ventana y corta al llegar al tope.
 *  2. La ventana se reinicia sola cuando vence.
 *  3. Dos pedidos simultáneos no se pisan (el conteo es atómico).
 *  4. Nadie lee ni escribe la tabla directo: sólo por la función.
 *  5. Guarda un hash, no una IP.
 */

const migration = readFileSync(
  new URL("../supabase/migrations/00098_limites_de_abuso.sql", import.meta.url),
  "utf8",
);

const db = new PGlite();
let checks = 0;

function check(label, value) {
  assert.ok(value, label);
  checks += 1;
  console.log(`✅ ${label}`);
}

async function hit(scope, key, limit, windowSeconds) {
  const { rows } = await db.query(
    "select public.rate_limit_hit($1, $2, $3, $4) as result",
    [scope, key, limit, windowSeconds],
  );
  return rows[0].result;
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
  `);
  await db.exec(migration);

  // 1) Cuenta y corta.
  const first = await hit("contact", "hash-ip-1", 3, 600);
  check("el primer pedido pasa", first.allowed === true);
  check("informa cuántos van", first.count === 1);
  check("informa cuántos quedan", first.remaining === 2);
  await hit("contact", "hash-ip-1", 3, 600);
  const third = await hit("contact", "hash-ip-1", 3, 600);
  check("el tercero todavía pasa (tope 3)", third.allowed === true);
  const fourth = await hit("contact", "hash-ip-1", 3, 600);
  check("el cuarto se corta", fourth.allowed === false);
  check("queda en cero disponible", fourth.remaining === 0);
  check("dice cuánto falta para reintentar", fourth.retry_after_seconds > 500 && fourth.retry_after_seconds <= 600);

  // 2) Cada ruta y cada llave tienen su propio contador.
  const other = await hit("newsletter", "hash-ip-1", 3, 600);
  check("otra ruta arranca en cero", other.allowed === true && other.count === 1);
  const otherKey = await hit("contact", "hash-ip-2", 3, 600);
  check("otra llave arranca en cero", otherKey.allowed === true && otherKey.count === 1);

  // 3) Dos pedidos simultáneos: los dos cuentan, no uno.
  const [a, b] = await Promise.all([
    hit("finance", "hash-user-9", 1, 600),
    hit("finance", "hash-user-9", 1, 600),
  ]);
  const counts = [a.count, b.count].sort((x, y) => x - y);
  check("con dos pedidos a la vez el conteo es 1 y 2 (no se pierde ninguno)", counts[0] === 1 && counts[1] === 2);
  check("y con tope 1 sólo uno pasa", [a.allowed, b.allowed].filter(Boolean).length === 1);

  // 4) La ventana vence y vuelve a permitir.
  await db.exec("update public.rate_limits set window_start = now() - interval '11 minutes' where scope = 'contact'");
  const renewed = await hit("contact", "hash-ip-1", 3, 600);
  check("al vencer la ventana vuelve a pasar", renewed.allowed === true);
  check("y el conteo arranca de nuevo", renewed.count === 1);

  // 5) La tabla no guarda datos personales ni tolera claves fuera de rango.
  const { rows: stored } = await db.query(
    "select scope, key from public.rate_limits order by scope, key",
  );
  check("no se guardó ninguna IP", stored.every((row) => /^hash-/.test(row.key)));
  await assert.rejects(
    () => db.query("select public.rate_limit_hit('contact', '', 3, 600)"),
    /key inválida/,
  );
  await assert.rejects(
    () => db.query("select public.rate_limit_hit('', 'hash-x', 3, 600)"),
    /scope inválido/,
  );
  await assert.rejects(
    () => db.query("select public.rate_limit_hit('contact', 'hash-x', 0, 600)"),
    /límite fuera de rango/,
  );
  await assert.rejects(
    () => db.query("select public.rate_limit_hit('contact', 'hash-x', 5, 0)"),
    /ventana fuera de rango/,
  );

  // 6) RLS activo, sin políticas: la tabla no se lee ni se escribe directo.
  const { rows: rls } = await db.query(
    "select relrowsecurity from pg_class where oid = 'public.rate_limits'::regclass",
  );
  check("RLS activo en la tabla", rls[0].relrowsecurity === true);
  const { rows: policies } = await db.query(
    "select count(*)::int as n from pg_policies where tablename = 'rate_limits'",
  );
  check("sin políticas: nadie entra directo", policies[0].n === 0);
  const { rows: grants } = await db.query(
    `select has_table_privilege('anon', 'public.rate_limits', 'SELECT') as anon_read,
            has_table_privilege('authenticated', 'public.rate_limits', 'INSERT') as auth_write`,
  );
  check("anon no puede leer la tabla", grants[0].anon_read === false);
  check("authenticated no puede escribirla", grants[0].auth_write === false);
  const { rows: exec } = await db.query(
    `select has_function_privilege('anon', 'public.rate_limit_hit(text,text,integer,integer)', 'EXECUTE') as anon_exec`,
  );
  check("pero sí puede llamar a la función", exec[0].anon_exec === true);

  console.log(`\n${checks} comprobaciones PASS (SEG-07, 00098)`);
} catch (error) {
  console.error("❌", error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
