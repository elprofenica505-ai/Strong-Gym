// Prueba local de 00042 (productos, stock, ventas y categoría) sobre la cadena de migraciones. (medidas, metas y rutinas) sobre la cadena de migraciones
// hasta 00036. Cubre positivos y negativos por rol, reglas de datos y solo-agregar.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const sql = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const db = new PGlite();
let checks = 0;
const ok = (name, cond) => { assert.ok(cond, name); checks++; console.log(`✅ ${name}`); };

await db.exec(`create schema auth; create role anon nologin; create role authenticated nologin;
  create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create table auth.current_user(id uuid, aal text);
  create function auth.uid() returns uuid language sql stable as $$select id from auth.current_user limit 1$$;
  create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal', aal) from auth.current_user limit 1$$;
  grant usage on schema auth to anon, authenticated; grant select on auth.current_user to anon, authenticated;`);

for (const f of ['supabase/migrations/00001_schema.sql', 'supabase/migrations/00002_seed.sql', 'tests/fixtures/finance-bank-accounts.sql',
  'supabase/migrations/00012_profiles_self_read.sql', 'supabase/migrations/00020_clients_crm.sql', 'supabase/migrations/00022_crm_finance_compat.sql',
  'supabase/migrations/00023_finance_read_bank_accounts.sql', 'supabase/migrations/00024_finance_movements.sql',
  'supabase/migrations/00025_account_assigned_plan.sql', 'supabase/migrations/00026_booking_read_policy.sql',
  'supabase/migrations/00027_client_finance_read.sql', 'supabase/migrations/00028_debts_payments.sql',
  'supabase/migrations/00029_cash_change.sql', 'supabase/migrations/00030_access_hardening.sql']) {
  await db.exec(sql(f));
}
await db.exec(`create or replace function public.crm_is_staff() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false) and exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));$$;
  revoke all on function public.crm_is_staff() from public, anon; grant execute on function public.crm_is_staff() to authenticated;`);
await db.exec(sql('docs/SQL-PENDIENTE/00032_mfa_is_staff_y_privilegios_anon.sql'));
await db.exec(sql('docs/SQL-PENDIENTE/00033_roles_fase_a.sql'));

const makeUser = async (email, role) => {
  const id = (await db.query('insert into auth.users(email, raw_user_meta_data) values ($1, $2) returning id',
    [email, JSON.stringify({ full_name: 'EJEMPLO ' + email })])).rows[0].id;
  await db.exec('delete from auth.current_user');
  if (role) await db.query('update profiles set role = $2::user_role where id = $1', [id, role]);
  return id;
};
const admin = await makeUser('admin@test.invalid', 'admin');
const cashier = await makeUser('caja@test.invalid', 'cashier');
const trainer = await makeUser('entrenador@test.invalid', 'trainer');
const trainer2 = await makeUser('entrenador2@test.invalid', 'trainer');
const member = await makeUser('cliente@test.invalid', null);

await db.exec(sql('docs/SQL-PENDIENTE/00034_roles_fase_b.sql'));
await db.exec(sql('docs/SQL-PENDIENTE/00035_asignacion_entrenador.sql'));
await db.exec(sql('docs/SQL-PENDIENTE/00036_personal_no_es_cliente.sql'));
await db.exec(sql('docs/SQL-PENDIENTE/00039_medidas_metas_rutinas.sql'));
await db.exec(sql('docs/SQL-PENDIENTE/00040_mi_progreso_cliente.sql'));
await db.exec(sql('docs/SQL-PENDIENTE/00041_asistencia_cliente.sql'));
await db.exec(sql('docs/SQL-PENDIENTE/00042_productos_stock_categorias.sql'));
ok('00042 se aplica sobre 00041 sin error', true);
ok('00041 se aplica sobre 00040 sin error', true);
ok('00040 se aplica sobre 00039 sin error', true);
ok('00039 se aplica sobre 00036 sin error', true);

// Clientes: ana (el entrenador tiene acceso aprobado), luis (sin acceso para nadie).
const ana = (await db.query(`insert into gym_clients(full_name, status) values ('ANA EJEMPLO', 'active') returning id`)).rows[0].id;
const luis = (await db.query(`insert into gym_clients(full_name, status) values ('LUIS EJEMPLO', 'active') returning id`)).rows[0].id;
await db.query(`insert into trainer_client_access(trainer_id, client_id, status, requested_via) values ($1, $2, 'approved', 'trainer')`, [trainer, ana]);

const as = async (actor, aal, q, args = []) => {
  await db.exec('reset role; delete from auth.current_user');
  if (actor) await db.query('insert into auth.current_user values ($1, $2)', [actor, aal]);
  await db.exec(`set role ${actor ? 'authenticated' : 'anon'}`);
  try { return (await db.query(q, args)).rows; } finally { await db.exec('reset role'); }
};
const denied = (p, re = /AUTH|42501|permission denied|row-level|violates|check|no se/i) => p.then(
  () => false, e => re.test(`${e.code ?? ''} ${e.message}`));
const today = (await db.query("select (now() at time zone 'America/Managua')::date::text as d")).rows[0].d;
const vals = { cintura_cm: 80, biceps_relajado_cm: 30.5 };



// Cuentas y métodos de prueba (ficticios) para finanzas
await db.exec(`insert into bank_accounts(id,name,account_type,currency,balance) values('prueba-nio','Caja ficticia','caja_fuerte','NIO',1000)`);
await db.exec(`insert into payment_methods(id,name,currency) values('prueba-nio','Efectivo ficticio','NIO')`);
const bal = async () => Number((await db.query("select balance from bank_accounts where id='prueba-nio'")).rows[0].balance);
const stockOf = async (p) => Number((await db.query('select public.product_stock_of($1) as s', [p])).rows[0].s);

await db.exec("insert into plans(id,slug,name_es,name_en,period) values('prueba-semanal','prueba-semanal','Semanal ficticio','Weekly test','week') on conflict do nothing");
await db.exec("insert into plans(id,slug,name_es,name_en,period) values('prueba-mensual','prueba-mensual','Mensual ficticio','Monthly test','month') on conflict do nothing");
// Visitas recientes de ana (3 en 30 días) para la categoría
for (const n of [0, 1, 2]) {
  const d = (await db.query("select ((now() at time zone 'America/Managua')::date - $1::int)::text as d", [n])).rows[0].d;
  await db.query('insert into client_visits(client_id, visited_at, local_day, source) values ($1, now(), $2::date, $3)', [ana, d, 'manual']);
}

// Producto: compra 20, venta 35 => ganancia 15
const prodId = (await as(admin, 'aal2', "select public.product_save(null,'Creatina 300 g','Suplementos','Creatina',$1,'activo',20,35,2,null) as id", [JSON.stringify({ tamaño: '300 g' })]))[0].id;
const prod = (await as(admin, 'aal2', 'select p.* from products p where id=$1', [prodId]))[0];
ok('ganancia automática = venta - compra (35 - 20 = 15)', Number(prod.profit) === 15);
ok('imagen fuera de formato JPEG se rechaza', await denied(as(admin, 'aal2', "select public.product_save(null,'Foto','Ropa',null,'{}','activo',1,2,0,'data:image/png;base64,AAAA')", []), /check|violates/));
ok('precio negativo se rechaza', await denied(as(admin, 'aal2', "select public.product_save(null,'Malo','Ropa',null,'{}','activo',1,-2,0,null)", []), /INVALID/));
ok('anónimo no crea productos', await denied(as(null, null, "select public.product_save(null,'Anon','Ropa',null,'{}','activo',1,2,0,null)", [])));
ok('entrenador no crea productos', await denied(as(trainer, 'aal2', "select public.product_save(null,'Entr','Ropa',null,'{}','activo',1,2,0,null)", [])));
ok('caja sí crea productos', (await as(cashier, 'aal2', "select public.product_save(null,'Camiseta','Ropa','Camisas','{\"color\":\"negra\",\"talla\":\"M\"}','activo',100,180,1,null) as id", []))[0].id !== null);

// Compra de inventario: 10 unidades a 20 = 200 de gasto, suma stock
const buy = (req, q, cost) => as(admin, 'aal2', "select public.product_purchase($1,$2,$3,$4,'prueba-nio','prueba-nio') as r", [req, prodId, q, cost]);
const b0 = await bal();
const r1 = (await buy('11111111-1111-4111-8111-111111111111', 10, 20))[0].r;
ok('compra registra un gasto en finanzas (200)', (await bal()) === b0 - 200 && !!r1.transaction_id);
ok('compra suma stock (10)', (await stockOf(prodId)) === 10);
const r1b = (await buy('11111111-1111-4111-8111-111111111111', 10, 20))[0].r;
ok('misma compra (mismo request) no duplica dinero ni stock', (await bal()) === b0 - 200 && (await stockOf(prodId)) === 10 && r1b.already === true);
ok('compra con cantidad cero se rechaza', await denied(buy('22222222-2222-4222-8222-222222222222', 0, 20), /INVALID/));

// Venta: exige cliente; baja stock y suma en finanzas
const sell = (req, q, client) => as(cashier, 'aal2', "select public.product_sell($1,$2,$3,$4,'prueba-nio','prueba-nio') as r", [req, prodId, q, client]);
const s0 = await bal();
ok('venta sin cliente se rechaza', await denied(sell('33333333-3333-4333-8333-333333333333', 1, null), /CLIENT_REQUIRED/));
const v1 = (await sell('44444444-4444-4444-8444-444444444444', 2, ana))[0].r;
ok('venta a cliente suma ingreso (2 x 35 = 70)', (await bal()) === s0 + 70 && Number(v1.total) === 70);
ok('venta baja stock (10 - 2 = 8)', (await stockOf(prodId)) === 8);
const v1b = (await sell('44444444-4444-4444-8444-444444444444', 2, ana))[0].r;
ok('venta repetida (mismo request) no duplica', v1b.already === true && (await stockOf(prodId)) === 8 && (await bal()) === s0 + 70);
ok('no vende más de lo que hay (SIN_STOCK)', await denied(sell('55555555-5555-4555-8555-555555555555', 50, ana), /SIN_STOCK/));
ok('stock no queda negativo tras venta fallida', (await stockOf(prodId)) === 8);

// Ajuste de inventario
const adj = (await as(admin, 'aal2', 'select public.product_stock_adjust($1,-1,$2) as s', [prodId, 'conteo']))[0].s;
ok('ajuste de conteo baja stock sin mover dinero', Number(adj) === 7 && (await bal()) === s0 + 70);
ok('ajuste que dejaría stock negativo se rechaza', await denied(as(admin, 'aal2', 'select public.product_stock_adjust($1,-100,$2)', [prodId, 'x']), /SIN_STOCK/));

// Lista de productos
const list = (await as(cashier, 'aal2', 'select public.product_list() as l'))[0].l;
const item = list.find(p => p.id === prodId);
ok('lista muestra existencia (7) y alerta de stock bajo = no', item.stock === 7 && item.low_stock === false);
ok('entrenador no ve la lista de productos', await denied(as(trainer, 'aal2', 'select public.product_list()'), /AUTH/));

// Categoría de cliente
const cat = async (client, actor = admin) => (await as(actor, 'aal2', 'select public.client_category($1) as c', [client]))[0].c;
ok('cliente sin membresía y sin visitas recientes = comun', (await cat(luis)).category === 'comun');
ok('ana: 3 visitas en 30 días y sin membresía = amigo', (await cat(ana)).category === 'amigo');
await db.query("update gym_clients set plan_id = 'prueba-mensual', status='active' where id=$1", [ana]);
ok('membresía mensual + compra en 90 días = strong_gym', (await cat(ana)).category === 'strong_gym');
await db.query("update gym_clients set plan_id = 'prueba-semanal' where id=$1", [luis]);
ok('membresía semanal = familia', (await cat(luis)).category === 'familia');
await db.query("update gym_clients set plan_id = 'prueba-mensual' where id=$1", [luis]);
ok('membresía mensual sin compras = familia', (await cat(luis)).category === 'familia');
ok('el cliente ve su propia categoría', (await as(member, 'aal1', 'select public.client_category(null) as c'))[0].c !== null);
ok('el cliente no ve la categoría de otro cliente (null)', (await as(member, 'aal2', 'select public.client_category($1) as c', [ana]))[0].c === null);
ok('la columna antigua gym_clients.category no cambia', (await db.query('select category from gym_clients where id=$1', [ana])).rows[0].category === 'client');


// ===== 00043: plan de nutrición e interruptor =====
await db.exec(sql('docs/SQL-PENDIENTE/00043_plan_nutricion_interruptor.sql'));
ok('00043 se aplica sobre 00042 sin error', true);
const planIn = { sexo: 'f', edad: 28, peso: 68, altura: 163, act: 1, goal: 'definir' };
const planRes = { imc: 25.6, target: 1500 };
const planMeals = [{ slot: 'Desayuno', title: 'Huevos con frijoles' }];
const planRoutine = [{ dia: 'Lunes', ejercicios: [{ ejercicio: 'Sentadilla goblet', series: 3, reps: '10', descanso_s: 75 }] }];
const saveAs = (actor, aal, client, goal = 'definir') => as(actor, aal,
  'select public.nutrition_save($1,$2,$3,$4,$5,$6) as id', [client, goal, JSON.stringify(planIn), JSON.stringify(planRes), JSON.stringify(planMeals), JSON.stringify(planRoutine)]);

ok('admin guarda plan de ana', (await saveAs(admin, 'aal2', ana))[0].id === ana);
ok('entrenador con acceso guarda con interruptor encendido (por defecto)', (await saveAs(trainer, 'aal2', ana))[0].id === ana);
ok('caja guarda con interruptor encendido (por defecto)', (await saveAs(cashier, 'aal2', ana))[0].id === ana);
ok('objetivo inválido se rechaza', await denied(saveAs(admin, 'aal2', ana, 'magia'), /INVALID_GOAL/));
ok('entrenador sin acceso no guarda (luis)', await denied(saveAs(trainer, 'aal2', luis), /AUTH/));
ok('otro entrenador no guarda (ana)', await denied(saveAs(trainer2, 'aal2', ana), /AUTH/));
ok('cliente no guarda su propio plan', await denied(saveAs(member, 'aal1', (await db.query('select id from gym_clients where profile_id=$1',[member])).rows[0].id), /AUTH/));
ok('anónimo no guarda', await denied(saveAs(null, null, ana), /AUTH|permission denied|42501/));

// Interruptor: sólo admin
ok('caja no cambia el interruptor', await denied(as(cashier, 'aal2', 'select public.admin_set_client_tools($1,false,true)', [ana]), /AUTH/));
ok('entrenador no cambia el interruptor', await denied(as(trainer, 'aal2', 'select public.admin_set_client_tools($1,false,true)', [ana]), /AUTH/));
await as(admin, 'aal2', 'select public.admin_set_client_tools($1,false,true)', [ana]);
ok('admin apaga herramientas del entrenador para ana', await denied(saveAs(trainer, 'aal2', ana), /AUTH/));
ok('admin sigue pudiendo guardar con el interruptor apagado', (await saveAs(admin, 'aal2', ana))[0].id === ana);
ok('caja sigue pudiendo guardar (su interruptor está encendido)', (await saveAs(cashier, 'aal2', ana))[0].id === ana);
await as(admin, 'aal2', 'select public.admin_set_client_tools($1,true,false)', [ana]);
ok('admin apaga herramientas de caja', await denied(saveAs(cashier, 'aal2', ana), /AUTH/));
ok('entrenador vuelve a guardar al encender su interruptor', (await (async () => { await as(admin, 'aal2', 'select public.admin_set_client_tools($1,true,true)', [ana]); return saveAs(trainer, 'aal2', ana); })())[0].id === ana);

// Lectura
const get = async (actor, aal, client = null) => (await as(actor, aal, 'select public.nutrition_get($1) as g', [client]))[0].g;
const g1 = await get(trainer, 'aal2', ana);
ok('entrenador lee el plan de ana con permiso de edición', g1.plan && g1.plan.goal === 'definir' && g1.can_edit === true);
ok('caja lee el plan de ana', (await get(cashier, 'aal2', ana)).plan !== null);
ok('entrenador sin acceso no lee el plan de luis (null)', (await get(trainer, 'aal2', luis)) === null);
ok('el cliente lee su propio plan y no puede editar', (await get(member, 'aal1')) === null || (await get(member, 'aal1')).can_edit === false);
ok('el cliente no lee el plan de ana (null)', (await get(member, 'aal1', ana)) === null);
ok('la lectura del cliente no muestra interruptores del personal', !JSON.stringify(await get(member, 'aal1')).includes('cashier_tools_enabled'));
ok('anónimo no lee planes', await denied(as(null, null, 'select public.nutrition_get($1)', [ana])));
ok('las tablas de herramientas no son legibles directamente por el personal', await denied(as(admin, 'aal2', 'select * from client_nutrition_plans'), /permission denied|42501/));

console.log(`\n${checks} comprobaciones PASS (00042 productos, stock, ventas, categoría)`);
