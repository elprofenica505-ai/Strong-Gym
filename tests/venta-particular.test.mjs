import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Venta particular: cobrarle a alguien que no tiene ficha en el gimnasio.
 *
 * Lo que se cuida acá:
 *   1. Que caja pueda cobrarle a quien entra sólo a comprar, sin inventarle un
 *      cliente y sin negarle la venta.
 *   2. Que la venta no se confunda con un cobro a un cliente del gimnasio:
 *      arranca siempre en «cliente registrado» y hay que elegir la otra opción.
 *   3. Que la base permita el ingreso sin ficha y no lo mezcle con la ficha de
 *      nadie (sin cliente, sin evento de pago).
 */
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("la pantalla de venta ofrece las dos opciones y arranca en cliente registrado", () => {
  const ui = source("src/components/products/product-manager.tsx");
  assert.match(ui, /Cliente registrado/);
  assert.match(ui, /Venta particular/);
  // Por defecto, cliente registrado: nadie cae en particular sin elegirlo.
  assert.match(ui, /useState<"registrado" \| "particular">\("registrado"\)/);
  assert.match(ui, /setSaleKind\("registrado"\);/);
  // El nombre de quien compra es opcional y va con el mismo largo que la base.
  assert.match(ui, /Nombre de quien compra \(opcional\)/);
  assert.match(ui, /maxLength=\{CUSTOMER_NAME_MAX\}/);
});

test("la venta particular se manda sin cliente, nunca con un id inventado", () => {
  const ui = source("src/components/products/product-manager.tsx");
  assert.match(ui, /particular \? null : String\(fd\.get\("client"\)\)/);
  assert.match(ui, /customer: particular \? String\(fd\.get\("customer"\) \?\? ""\)\.trim\(\) \|\| null : null/);
  // El mensaje de confirmación no engaña: dice que fue venta particular.
  assert.match(ui, /Venta particular registrada/);
});

test("el nombre libre sólo viaja cuando no hay ficha", () => {
  const route = source("src/app/api/products/route.ts");
  assert.match(route, /p_client: x\.client/);
  assert.match(route, /p_customer_name: x\.client === null \? \(x\.customer \?\? null\) : null/);
});

test("la base deja entrar un ingreso sin ficha y no toca la ficha de nadie", () => {
  const sql = source("supabase/migrations/00097_venta_particular.sql");
  // Se retira la restricción que obligaba a tener cliente en una venta.
  assert.match(sql, /drop constraint if exists stock_sale_client/);
  // El nombre suelto es una columna nueva, opcional, con tope de 80.
  assert.match(sql, /add column if not exists customer_name text/);
  assert.match(sql, /between 2 and 80/);
  // El ingreso sin cliente ya no se rechaza…
  assert.match(sql, /or \(p_kind='service_income' and p_category is not null\)/);
  assert.doesNotMatch(sql, /p_kind='service_income'\s*and \(p_client is null or p_category is not null\)/);
  // …pero no escribe un evento de pago sin ficha.
  assert.match(sql, /if p_kind='service_income' and p_client is not null then/);
  // Y sigue siendo el mismo camino de dinero, no uno nuevo.
  assert.match(sql, /insert into public\.transactions\(type,status,occurred_at,account_id/);
  assert.match(sql, /update public\.bank_accounts set balance=v_after where id=p_account/);
});

test("la venta particular queda dicha en el movimiento y en la nota", () => {
  const sql = source("supabase/migrations/00097_venta_particular.sql");
  assert.match(sql, /'Venta particular \(' \|\| v_customer \|\| '\): ' \|\| v_name/);
  assert.match(sql, /'Venta particular: ' \|\| v_name/);
  assert.match(sql, /case when p_client is null then 'Venta particular' else null end/);
});

test("no se permite vender particular a un entrenador ni sin cuenta o método", () => {
  const sql = source("supabase/migrations/00097_venta_particular.sql");
  assert.match(sql, /if not public\.crm_is_staff\(\) then raise exception 'AUTH'/);
  assert.match(sql, /raise exception 'INVALID_METHOD'/);
  assert.match(sql, /raise exception 'INVALID_ACCOUNT'/);
  assert.match(sql, /raise exception 'INVALID_CUSTOMER'/);
});
