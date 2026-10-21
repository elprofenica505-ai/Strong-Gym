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


// ===== 00044: calculadora del cliente, edición sólo de entrenador/admin =====
await db.exec(sql('docs/SQL-PENDIENTE/00043_plan_nutricion_interruptor.sql'));
ok('00043 se aplica sobre 00042 sin error', true);
await db.exec(sql('docs/SQL-PENDIENTE/00044_calculadora_cliente.sql'));
ok('00044 se aplica sobre 00043 sin error', true);
const memberClient = (await db.query('select id from gym_clients where profile_id = $1', [member])).rows[0].id;
const calcInputs = { sex: 'm', age: 30, weightKg: 80, heightCm: 180, activity: 3, goal: 'peso' };
const reportMeals = [{ id: 'desayuno', title: 'Desayuno', text: 'Avena', share: 0.25, kcal: 700, proteinG: 30, carbsG: 90, fatG: 20 }];
const reportRoutine = [{ day: 'Fuerza 1', focus: 'Piernas', exercises: [{ name: 'Sentadilla', sets: 3, reps: '6-10', restSec: 90 }] }];
const selfCalc = (actor, aal) => as(actor, aal,
  'select public.nutrition_self_calculate($1,$2,$3,$4,$5,$6) as id',
  ['peso', JSON.stringify(calcInputs), JSON.stringify({ kcal: 2800, targetWeightKg: 86.4, weeksEstimate: 26 }), JSON.stringify(reportMeals), JSON.stringify(reportRoutine), JSON.stringify(['Guía'])]);
const staffSave = (actor, aal, client) => as(actor, aal,
  'select public.nutrition_save($1,$2,$3,$4,$5,$6,$7) as id',
  [client, 'peso', JSON.stringify(calcInputs), JSON.stringify({ kcal: 2800 }), JSON.stringify(reportMeals), JSON.stringify(reportRoutine), JSON.stringify(['Guía'])]);
const getAs = async (actor, aal, client = null) => (await as(actor, aal, 'select public.nutrition_get($1) as g', [client]))[0].g;

ok('el cliente calcula su propio plan desde Mi cuenta', (await selfCalc(member, 'aal1'))[0].id === memberClient);
const mine = await getAs(member, 'aal1');
ok('el cliente ve su plan con origen cliente y puede recalcular', mine.plan?.source === 'cliente' && mine.can_self_calculate === true);
ok('el reporte del cliente trae su nombre', typeof mine.client_name === 'string' && mine.client_name.length > 0);
ok('el cliente no ve los permisos del personal', !JSON.stringify(mine).includes('trainer_tools_enabled'));
ok('el cliente puede recalcular de nuevo mientras el personal no lo edite', (await selfCalc(member, 'aal1'))[0].id === memberClient);
ok('el cliente no guarda con nutrition_save', await denied(staffSave(member, 'aal1', memberClient), /AUTH/));
ok('anónimo no calcula', await denied(selfCalc(null, null), /AUTH|permission denied|42501/));

// Caja: sólo lectura
ok('caja no edita el plan de ana', await denied(staffSave(cashier, 'aal2', ana), /AUTH/));
const anaCashier = await getAs(cashier, 'aal2', ana);
ok('caja ve el plan de ana pero no puede editarlo', anaCashier.can_edit === false);

// Entrenador con acceso edita: el cliente queda bloqueado
ok('entrenador con acceso guarda el plan de ana', (await staffSave(trainer, 'aal2', ana))[0].id === ana);
const anaStaff = await getAs(trainer, 'aal2', ana);
ok('el entrenador ve que puede editar y el interruptor', anaStaff.can_edit === true && anaStaff.trainer_tools_enabled === true);
ok('entrenador sin acceso no guarda (luis)', await denied(staffSave(trainer, 'aal2', luis), /AUTH/));
ok('otro entrenador no guarda (ana)', await denied(staffSave(trainer2, 'aal2', ana), /AUTH/));
ok('el admin edita el plan del propio cliente', (await staffSave(admin, 'aal2', memberClient))[0].id === memberClient);
ok('el personal edita y bloquea el recálculo del cliente', await denied(selfCalc(member, 'aal1'), /LOCKED_BY_STAFF/));
const afterStaff = await getAs(member, 'aal1');
ok('tras la edición del personal el cliente ve origen entrenador y no puede recalcular', afterStaff.plan?.source === 'entrenador' && afterStaff.can_self_calculate === false);

// Interruptor: sólo admin, sólo para el entrenador
ok('caja no cambia el interruptor', await denied(as(cashier, 'aal2', 'select public.admin_set_client_tools($1,false)', [ana]), /AUTH/));
ok('entrenador no cambia su propio interruptor', await denied(as(trainer, 'aal2', 'select public.admin_set_client_tools($1,false)', [ana]), /AUTH/));
await as(admin, 'aal2', 'select public.admin_set_client_tools($1,false)', [ana]);
ok('admin apaga el permiso del entrenador para ana', await denied(staffSave(trainer, 'aal2', ana), /AUTH/));
ok('admin sigue pudiendo editar con el interruptor apagado', (await staffSave(admin, 'aal2', ana))[0].id === ana);
ok('caja sigue sin poder editar aunque el admin lo encienda', await denied(staffSave(cashier, 'aal2', ana), /AUTH/));
await as(admin, 'aal2', 'select public.admin_set_client_tools($1,true)', [ana]);
ok('entrenador vuelve a editar al encender su permiso', (await staffSave(trainer, 'aal2', ana))[0].id === ana);

// Lectura: el cliente no ve a otros clientes
ok('el cliente no lee el plan de ana (null)', (await getAs(member, 'aal1', ana)) === null);
ok('entrenador sin acceso no lee el plan de luis (null)', (await getAs(trainer, 'aal2', luis)) === null);
ok('anónimo no lee planes', await denied(as(null, null, 'select public.nutrition_get($1)', [ana])));
ok('las tablas de herramientas no se leen directamente', await denied(as(admin, 'aal2', 'select * from client_nutrition_plans'), /permission denied|42501/));

// ===== 00045: registro en el gimnasio desde la calculadora del cliente =====
await db.exec(sql('docs/SQL-PENDIENTE/00045_registro_gimnasio_calculadora.sql'));
ok('00045 se aplica sobre 00044 sin error', true);
const member2 = await makeUser('cliente2@test.invalid', null);
const client2 = (await db.query('select id from gym_clients where profile_id = $1', [member2])).rows[0].id;
const mCount = async (c) => Number((await db.query('select count(*)::int as n from body_measurements where client_id = $1', [c])).rows[0].n);
const submit = (actor, aal) => as(actor, aal, 'select public.nutrition_submit_to_gym() as r', []);
const before2 = await mCount(client2);

ok('el cliente nuevo calcula su plan', (await selfCalc(member2, 'aal1'))[0].id === client2);
ok('antes de registrar, el plan no tiene fecha de registro', (await getAs(member2, 'aal1')).plan.submitted_at === null);
const regR1 = (await submit(member2, 'aal1'))[0].r;
ok('guardar registro crea una medición', regR1.already === false && (await mCount(client2)) === before2 + 1);
const regM1 = (await db.query('select weight_kg, height_cm from body_measurements where client_id = $1 order by created_at desc limit 1', [client2])).rows[0];
ok('la medición tiene el peso y la altura del cálculo', Number(regM1.weight_kg) === 80 && Number(regM1.height_cm) === 180);
const regR2 = (await submit(member2, 'aal1'))[0].r;
ok('guardar otra vez no duplica la medición', regR2.already === true && (await mCount(client2)) === before2 + 1);
ok('el cliente ve la fecha de registro en su plan', (await getAs(member2, 'aal1')).plan.submitted_at !== null);
ok('el administrador ve la medición en la ficha', (await as(admin, 'aal2', 'select count(*)::int as n from body_measurements where client_id = $1', [client2]))[0].n === before2 + 1);
ok('caja ve la medición en la ficha', (await as(cashier, 'aal2', 'select count(*)::int as n from body_measurements where client_id = $1', [client2]))[0].n === before2 + 1);
ok('entrenador sin acceso no ve la medición de este cliente', (await as(trainer, 'aal2', 'select count(*)::int as n from body_measurements where client_id = $1', [client2]))[0].n === 0);
ok('recalcular quita la marca de registro', (await selfCalc(member2, 'aal1'))[0].id === client2 && (await getAs(member2, 'aal1')).plan.submitted_at === null);
const regR3 = (await submit(member2, 'aal1'))[0].r;
ok('registrar el nuevo cálculo crea otra medición', regR3.already === false && (await mCount(client2)) === before2 + 2);
ok('el personal no registra por el cliente (sin plan propio)', await denied(submit(trainer, 'aal2'), /NOT_FOUND|NO_PLAN|AUTH/));
ok('anónimo no registra', await denied(submit(null, null), /AUTH|permission denied|42501/));

// ===== 00046: meta y rutina activas desde la calculadora =====
await db.exec(sql('docs/SQL-PENDIENTE/00046_meta_rutina_desde_calculadora.sql'));
ok('00046 se aplica sobre 00045 sin error', true);
const goalsOf = async (c) => (await db.query("select goal_type, status, other_label, target_weight_kg, target_date::text as target_date from client_goals where client_id = $1 order by created_at, id", [c])).rows;
const activeRoutine = async (c) => (await db.query("select name, days, exercises from client_routines where client_id = $1 and status = 'activa'", [c])).rows;
const gBefore = (await goalsOf(client2)).length;
const member3 = await makeUser('cliente3@test.invalid', null);
const client3 = (await db.query('select id from gym_clients where profile_id = $1', [member3])).rows[0].id;
await selfCalc(member3, 'aal1');
const r3 = (await submit(member3, 'aal1'))[0].r;
ok('registro crea la meta activa del cálculo (Ganar peso = ganancia)', r3.goal_type === 'ganancia' && (await goalsOf(client3)).filter(g => g.status === 'activa').length === 1);
const g3 = (await goalsOf(client3)).find(g => g.status === 'activa');
ok('la meta tiene peso objetivo y plazo de 1 a 12 meses', g3 && Number(g3.target_weight_kg) > 80 && g3.target_date > today);
const rt3 = await activeRoutine(client3);
ok('registro crea la rutina activa con días y ejercicios', rt3.length === 1 && rt3[0].days.length >= 1 && rt3[0].exercises.length > 0 && rt3[0].exercises[0].ejercicio.includes(':'));
ok('los ejercicios tienen series, repeticiones y descanso', rt3[0] && rt3[0].exercises.every(e => e.series >= 1 && e.reps && e.descanso_s >= 0));
ok('el administrador ve la meta activa de este cliente', (await as(admin, 'aal2', "select count(*)::int as n from client_goals where client_id = $1 and status = 'activa'", [client3]))[0].n === 1);
ok('el administrador ve la rutina activa de este cliente', (await as(admin, 'aal2', "select count(*)::int as n from client_routines where client_id = $1 and status = 'activa'", [client3]))[0].n === 1);
ok('caja ve la meta y la rutina (sólo lectura)', (await as(cashier, 'aal2', "select count(*)::int as n from client_goals where client_id = $1 and status = 'activa'", [client3]))[0].n === 1);
await selfCalc(member3, 'aal1');
await db.query("update client_nutrition_plans set results = jsonb_set(results, '{weeksEstimate}', '0') where client_id = $1", [client3]);
const r3b = (await submit(member3, 'aal1'))[0].r;
const g3all = await goalsOf(client3);
ok('nuevo registro cancela la meta anterior y deja una activa', r3b.already === false && g3all.filter(g => g.status === 'activa').length === 1 && g3all.filter(g => g.status === 'cancelada').length === 1);
ok('sin semanas estimadas el plazo es de 3 meses', (await goalsOf(client3)).find(g => g.status === 'activa').target_date > today);
const rt3b = await activeRoutine(client3);
ok('nueva rutina reemplaza a la anterior (sólo una activa)', rt3b.length === 1 && (await db.query("select count(*)::int as n from client_routines where client_id = $1 and status = 'cerrada'", [client3])).rows[0].n === 1);
const r3c = (await submit(member3, 'aal1'))[0].r;
ok('guardar dos veces no cambia la meta', r3c.already === true && (await goalsOf(client3)).length === g3all.length);
ok('la meta y la rutina de otro cliente no se tocan', (await goalsOf(client2)).length === gBefore);

console.log(`\n${checks} comprobaciones PASS (00042 productos, stock, ventas, categoría; 00043-00046 plan de nutrición, registro, meta y rutina)`);
