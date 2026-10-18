// Prueba local de la Fase B (00034) sobre una copia de la base con la cadena de migraciones
// y el estado ya aplicado: 00030, crm_is_staff de 00031, 00032 y 00033.
// Casos positivos y negativos para administrador, caja, entrenador, cliente y visitante.
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

for (const f of ['00001_schema.sql', '00002_seed.sql', '../tests/fixtures/finance-bank-accounts.sql', '00012_profiles_self_read.sql', '00020_clients_crm.sql',
  '00022_crm_finance_compat.sql', '00023_finance_read_bank_accounts.sql', '00024_finance_movements.sql', '00025_account_assigned_plan.sql',
  '00026_booking_read_policy.sql', '00027_client_finance_read.sql', '00028_debts_payments.sql', '00029_cash_change.sql',
  '00030_access_hardening.sql']) {
  await db.exec(sql(f.startsWith('../') ? f.slice(3) : `supabase/migrations/${f}`));
}
// Estado de producción antes de Fase B: crm_is_staff (00031, admin+staff), 00032 y 00033.
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
const admin2 = await makeUser('admin2@test.invalid', 'admin');
const cashier = await makeUser('caja@test.invalid', 'cashier');
const trainer = await makeUser('entrenador@test.invalid', 'trainer');
const legacyStaff = await makeUser('staff-viejo@test.invalid', 'staff');
const member = await makeUser('cliente@test.invalid', null);
const visitor = null;

// Datos de prueba: un cliente con contacto y una visita de hoy y otra de hace 40 días.
const clientId = (await db.query(`insert into gym_clients(full_name, phone, email, medical_notes, status)
  values ('CLIENTE EJEMPLO', '+505 8000 0000', 'cliente-ejemplo@test.invalid', 'nota privada', 'active') returning id`)).rows[0].id;
await db.query(`insert into client_visits(client_id, source, local_day) values ($1, 'manual', (now() at time zone 'America/Managua')::date)`, [clientId]);
await db.query(`insert into client_visits(client_id, source, local_day) values ($1, 'manual', (now() at time zone 'America/Managua')::date - 40)`, [clientId]);

const as = async (actor, aal, q, args = []) => {
  await db.exec('reset role; delete from auth.current_user');
  if (actor) await db.query('insert into auth.current_user values ($1, $2)', [actor, aal]);
  await db.exec(`set role ${actor ? 'authenticated' : 'anon'}`);
  try { return (await db.query(q, args)).rows; } finally { await db.exec('reset role'); }
};
const denied = (p, re = /AUTH|42501|permission denied|row-level/) => p.then(
  () => false, e => re.test(`${e.code ?? ''} ${e.message}`));
const fn = async (actor, aal, name) => (await as(actor, aal, `select public.${name}() as x`))[0].x;

// Antes de 00034: el rol 'staff' existe, así que se prueba su migración.
await db.exec(sql('docs/SQL-PENDIENTE/00034_roles_fase_b.sql'));
ok('00034 se aplica sin error', true);

// 1) Migración del rol staff
const legacyRole = (await db.query('select role::text r from profiles where id=$1', [legacyStaff])).rows[0].r;
ok('cuenta staff existente pasa a entrenador', legacyRole === 'trainer');
ok('ya no quedan cuentas con rol staff', (await db.query("select count(*)::int c from profiles where role::text='staff'")).rows[0].c === 0);

// 2) Guardias de datos
ok('admin con MFA es personal', await fn(admin, 'aal2', 'is_staff') === true);
ok('caja con MFA es personal', await fn(cashier, 'aal2', 'is_staff') === true);
ok('caja sin MFA NO es personal', await fn(cashier, 'aal1', 'is_staff') === false);
ok('entrenador NO es personal', await fn(trainer, 'aal2', 'is_staff') === false);
ok('cliente NO es personal', await fn(member, 'aal2', 'is_staff') === false);
ok('visitante NO puede ejecutar is_staff (permiso denegado)', await denied(fn(visitor, null, 'is_staff'), /42501|permission denied/));
ok('crm_is_staff: caja sí, entrenador no', await fn(cashier, 'aal2', 'crm_is_staff') === true && await fn(trainer, 'aal2', 'crm_is_staff') === false);

// 3) Datos de clientes: caja y admin ven contacto; entrenador y cliente no
const gcCount = async a => (await as(a.id, 'aal2', 'select count(*)::int c from gym_clients'))[0].c;
ok('caja ve el contacto del cliente', (await as(cashier, 'aal2', "select phone from gym_clients where full_name='CLIENTE EJEMPLO'"))[0].phone === '+505 8000 0000');
ok('admin ve el cliente de ejemplo', (await as(admin, 'aal2', "select count(*)::int c from gym_clients where full_name='CLIENTE EJEMPLO'"))[0].c === 1);
ok('entrenador NO lee la tabla de clientes', (await as(trainer, 'aal2', 'select count(*)::int c from gym_clients'))[0].c === 0);
ok('cliente NO lee la tabla de clientes', (await as(member, 'aal2', 'select count(*)::int c from gym_clients'))[0].c === 0);
ok('entrenador NO lee perfiles de otras personas', (await as(trainer, 'aal2', 'select count(*)::int c from profiles where id <> $1', [trainer]))[0].c === 0);
ok('entrenador NO ve notas médicas (0 filas)', (await as(trainer, 'aal2', 'select medical_notes from gym_clients')).length === 0);
ok('entrenador NO llama crm_detail', await denied(as(trainer, 'aal2', 'select public.crm_detail($1)', [clientId])));
ok('entrenador NO llama crm_directory', await denied(as(trainer, 'aal2', "select public.crm_directory('', '', 0)")));
ok('caja SÍ llama crm_directory', (await as(cashier, 'aal2', "select public.crm_directory('', '', 0) x")).length === 1);

// 4) Lista del entrenador: sólo nombre y asistencia
const roster = await as(trainer, 'aal2', 'select * from trainer_roster()');
const mine = roster.find(r => r.full_name === 'CLIENTE EJEMPLO');
ok('entrenador ve la lista de clientes activos (incluye el de ejemplo)', roster.length >= 1 && !!mine);
ok('la lista muestra asistencia de hoy y de 30 días', mine.visited_today === true && mine.visits_30d === 1);
ok('la lista NO tiene teléfono, correo ni notas',
  !Object.keys(roster[0]).some(k => /phone|email|medical|notes|address/.test(k)));
ok('caja NO usa trainer_roster', await denied(as(cashier, 'aal2', 'select * from trainer_roster()')));
ok('cliente NO usa trainer_roster', await denied(as(member, 'aal2', 'select * from trainer_roster()')));
ok('admin NO usa trainer_roster (sólo entrenador)', await denied(as(admin, 'aal2', 'select * from trainer_roster()')));
ok('visitante NO ve trainer_roster', await denied(as(null, null, 'select * from trainer_roster()'), /42501|permission denied/));
ok('entrenador sin MFA NO ve la lista', await denied(as(trainer, 'aal1', 'select * from trainer_roster()')));

// 5) Finanzas: caja sí, entrenador no
ok('caja lee finanzas (finance_read)', (await as(cashier, 'aal2', "select public.finance_read('summary',5) x")).length === 1);
ok('entrenador NO lee finanzas', await denied(as(trainer, 'aal2', "select public.finance_read('summary',5)")));
ok('cliente NO lee transacciones', (await as(member, 'aal2', 'select count(*)::int c from transactions'))[0].c === 0);
ok('entrenador NO lee transacciones', (await as(trainer, 'aal2', 'select count(*)::int c from transactions'))[0].c === 0);

// 6) Sólo administrador: reporte de deudas, importación, planes, clases, entrenadores, horarios
ok('admin ejecuta el reporte de deudas', (await as(admin, 'aal2', "select public.finance_debt_report('summary') x")).length === 1);
ok('caja NO ejecuta el reporte de deudas', await denied(as(cashier, 'aal2', "select public.finance_debt_report('summary')")));
ok('entrenador NO ejecuta el reporte de deudas', await denied(as(trainer, 'aal2', "select public.finance_debt_report('summary')")));
ok('caja NO importa clientes', await denied(as(cashier, 'aal2', `select public.crm_import_client('{"fullName":"NUEVO EJEMPLO"}'::jsonb)`)));
ok('admin SÍ importa clientes (con MFA)', (await as(admin, 'aal2', `select public.crm_import_client('{"fullName":"NUEVO EJEMPLO"}'::jsonb) x`)).length === 1);

// En estas tablas authenticated sólo tiene SELECT (sin GRANT de escritura). La política sólo es defensa adicional.
ok('caja NO escribe planes', await denied(as(cashier, 'aal2', "update public.plans set is_popular = is_popular returning id")));
ok('entrenador NO escribe planes', await denied(as(trainer, 'aal2', "update public.plans set is_popular = is_popular returning id")));
const pol = (await db.query(`select tablename, policyname, qual, with_check from pg_policies where schemaname='public'
  and tablename in ('plans','classes','coaches','sessions') and cmd in ('ALL','*','INSERT','UPDATE','DELETE')`)).rows;
ok('políticas de escritura de planes/clases/entrenadores/horarios son sólo admin',
  pol.length === 4 && pol.every(r => /is_admin/.test(r.qual ?? '') && /is_admin/.test(r.with_check ?? '')));
ok('caja NO crea clases', await denied(as(cashier, 'aal2', `insert into classes(id, name_es, name_en) values ('x-caja', 'x', 'x')`)));
ok('caja NO crea horarios', await denied(as(cashier, 'aal2', `insert into sessions(class_id, starts_at, ends_at, capacity) values ('x', now(), now() + interval '1 hour', 5)`)));

// 7) Asignación de roles
ok('caja NO asigna roles', await denied(as(cashier, 'aal2', 'select public.admin_set_role($1, $2)', [member, 'trainer'])));
ok('entrenador NO asigna roles', await denied(as(trainer, 'aal2', 'select public.admin_set_role($1, $2)', [member, 'trainer'])));
ok('admin sin MFA NO asigna roles', await denied(as(admin, 'aal1', 'select public.admin_set_role($1, $2)', [member, 'trainer'])));
ok('nadie asigna rol staff (no válido)', await denied(as(admin, 'aal2', 'select public.admin_set_role($1, $2)', [member, 'staff']), /INVALID_ROLE/));
ok('admin NO se cambia su propio rol', await denied(as(admin, 'aal2', 'select public.admin_set_role($1, $2)', [admin, 'member']), /SELF_ROLE_CHANGE/));
ok('admin NO asigna rol a cuenta inexistente', await denied(as(admin, 'aal2', 'select public.admin_set_role($1, $2)', ['00000000-0000-0000-0000-000000000000', 'trainer']), /NOT_FOUND/));

await as(admin, 'aal2', 'select public.admin_set_role($1, $2)', [member, 'cashier']);
ok('admin asigna caja a un cliente', (await db.query('select role::text r from profiles where id=$1', [member])).rows[0].r === 'cashier');
await as(admin, 'aal2', 'select public.admin_set_role($1, $2)', [member, 'trainer']);
ok('admin cambia el mismo rol a entrenador', (await db.query('select role::text r from profiles where id=$1', [member])).rows[0].r === 'trainer');
await as(admin, 'aal2', 'select public.admin_set_role($1, $2)', [member, 'member']);
ok('admin devuelve la cuenta a cliente', (await db.query('select role::text r from profiles where id=$1', [member])).rows[0].r === 'member');

await as(admin, 'aal2', 'select public.admin_set_role($1, $2)', [admin2, 'member']);
ok('admin quita admin a otro administrador (hay dos)', (await db.query('select role::text r from profiles where id=$1', [admin2])).rows[0].r === 'member');
ok('la bitácora registra los cambios de rol', (await db.query('select count(*)::int c from role_changes')).rows[0].c >= 3);
ok('admin lee la bitácora', (await as(admin, 'aal2', 'select count(*)::int c from role_changes'))[0].c >= 3);
ok('caja NO lee la bitácora', (await as(cashier, 'aal2', 'select count(*)::int c from role_changes'))[0].c === 0);

// 8) Nadie se autoasciende por la API de perfiles
ok('caja NO se cambia a admin por API', await denied(as(cashier, 'aal2', "update profiles set role = 'admin' where id = $1", [cashier])));
ok('entrenador NO se cambia a admin por API', await denied(as(trainer, 'aal2', "update profiles set role = 'admin' where id = $1", [trainer])));
ok('cliente NO se cambia a caja por API', await denied(as(member, 'aal2', "update profiles set role = 'cashier' where id = $1", [member])));

// 9) Visitante sin sesión
ok('visitante NO ejecuta admin_set_role', await denied(as(null, null, 'select public.admin_set_role($1, $2)', [member, 'trainer'])));

console.log(`\nPASS ${checks} comprobaciones de Fase B`);
