// Prueba local de 00035 (asignación entrenador-cliente) sobre la cadena de migraciones
// más 00032, 00033 y 00034. Cubre positivos y negativos de cada rol.
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
ok('00035 se aplica sobre 00034 sin error', true);

// Clientes de prueba: dos activos, uno congelado. Una visita de hoy para el primero.
const ana = (await db.query(`insert into gym_clients(full_name, phone, email, medical_notes, status)
  values ('ANA EJEMPLO', '+505 8000 1111', 'ana@test.invalid', 'nota privada', 'active') returning id`)).rows[0].id;
const luis = (await db.query(`insert into gym_clients(full_name, phone, email, status)
  values ('LUIS EJEMPLO', '+505 8000 2222', 'luis@test.invalid', 'active') returning id`)).rows[0].id;
const pausado = (await db.query(`insert into gym_clients(full_name, status) values ('PAUSADO EJEMPLO', 'frozen') returning id`)).rows[0].id;
await db.query(`insert into client_visits(client_id, source, local_day) values ($1, 'manual', (now() at time zone 'America/Managua')::date)`, [ana]);

const as = async (actor, aal, q, args = []) => {
  await db.exec('reset role; delete from auth.current_user');
  if (actor) await db.query('insert into auth.current_user values ($1, $2)', [actor, aal]);
  await db.exec(`set role ${actor ? 'authenticated' : 'anon'}`);
  try { return (await db.query(q, args)).rows; } finally { await db.exec('reset role'); }
};
const denied = (p, re = /AUTH|42501|permission denied|row-level/) => p.then(
  () => false, e => re.test(`${e.code ?? ''} ${e.message}`));
const rosterOf = actor => as(actor, 'aal2', 'select * from trainer_roster()');

// 1) Punto de partida: sin asignaciones, el entrenador no ve a nadie
ok('entrenador sin asignaciones: lista vacía', (await rosterOf(trainer)).length === 0);

// 2) El entrenador pide a Ana para sí mismo: queda pendiente y NO aparece en su lista
const reqSelf = await as(trainer, 'aal2', 'select public.request_trainer_access($1, $2, $3) as id', [trainer, ana, 'Entrena con ella']);
const pendingId = reqSelf[0].id;
ok('entrenador pide un cliente: queda pendiente', (await db.query('select status from trainer_client_access where id=$1', [pendingId])).rows[0].status === 'pending');
ok('pendiente NO da acceso a la lista', (await rosterOf(trainer)).length === 0);
ok('el pedido queda como pedido del entrenador', (await db.query('select requested_via from trainer_client_access where id=$1', [pendingId])).rows[0].requested_via === 'trainer');
ok('pedir el mismo cliente otra vez no duplica (devuelve el mismo id)',
  (await as(trainer, 'aal2', 'select public.request_trainer_access($1, $2, null) as id', [trainer, ana]))[0].id === pendingId);
ok('un solo pedido abierto en la tabla', (await db.query('select count(*)::int c from trainer_client_access')).rows[0].c === 1);

// 3) Caja registra un pedido en nombre del entrenador: también pendiente, también requiere admin
const cajaReq = await as(cashier, 'aal2', 'select public.request_trainer_access($1, $2, null) as id', [trainer, luis]);
const luisId = cajaReq[0].id;
ok('caja puede registrar un pedido en nombre de un entrenador', !!luisId);
ok('pedido de caja queda marcado como cashier', (await db.query('select requested_via from trainer_client_access where id=$1', [luisId])).rows[0].requested_via === 'cashier');
ok('el pedido de caja tampoco da acceso sin aprobación', (await rosterOf(trainer)).length === 0);

// 4) Caja NO aprueba; el entrenador NO aprueba; administrador sin MFA NO aprueba
ok('caja NO aprueba', await denied(as(cashier, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [pendingId, 'approved'])));
ok('entrenador NO aprueba su propio pedido', await denied(as(trainer, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [pendingId, 'approved'])));
ok('administrador sin MFA NO aprueba', await denied(as(admin, 'aal1', 'select public.admin_decide_trainer_access($1, $2)', [pendingId, 'approved'])));
ok('nadie aprueba con decisión inválida', await denied(as(admin, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [pendingId, 'todo']), /INVALID_DECISION/));

// 5) Administrador con MFA aprueba a Ana: aparece con asistencia; Luis sigue pendiente
await as(admin, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [pendingId, 'approved']);
let roster = await rosterOf(trainer);
ok('tras aprobar, el entrenador ve sólo a Ana', roster.length === 1 && roster[0].client_id === ana);
ok('la lista muestra asistencia de hoy de Ana', roster[0].visited_today === true && roster[0].visits_30d === 1);
ok('la lista NO tiene teléfono, correo ni notas',
  !Object.keys(roster[0]).some(k => /phone|email|medical|notes|address/.test(k)));
ok('Luis (pendiente) sigue fuera de la lista', !roster.some(r => r.client_id === luis));

// 6) Estados: no se aprueba dos veces; rechazar sólo lo pendiente; revocar sólo lo aprobado
ok('no se aprueba dos veces', await denied(as(admin, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [pendingId, 'approved']), /INVALID_STATE/));
ok('no se rechaza un pedido aprobado', await denied(as(admin, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [pendingId, 'rejected']), /INVALID_STATE/));
await as(admin, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [luisId, 'rejected']);
ok('Luis rechazado sigue fuera de la lista', !(await rosterOf(trainer)).some(r => r.client_id === luis));
ok('pedir a un cliente rechazado puede volver a pedirse', !!(await as(trainer, 'aal2', 'select public.request_trainer_access($1, $2, null) as id', [trainer, luis]))[0].id);

// 7) Caja y entrenador no pueden pedir por otro entrenador ni para un cliente inactivo
ok('entrenador NO pide en nombre de otro entrenador', await denied(as(trainer, 'aal2', 'select public.request_trainer_access($1, $2, null)', [trainer2, luis])));
ok('no se pide para un cliente congelado', await denied(as(trainer, 'aal2', 'select public.request_trainer_access($1, $2, null)', [trainer, pausado]), /INACTIVE_CLIENT/));
ok('no se pide para una cuenta que no es entrenador', await denied(as(cashier, 'aal2', 'select public.request_trainer_access($1, $2, null)', [member, luis]), /INVALID_TRAINER/));
ok('cliente no pide acceso', await denied(as(member, 'aal2', 'select public.request_trainer_access($1, $2, null)', [trainer, luis])));
ok('visitante no pide acceso', await denied(as(null, null, 'select public.request_trainer_access($1, $2, null)', [trainer, luis]), /42501|permission denied/));
ok('motivo demasiado largo se rechaza', await denied(as(trainer, 'aal2', 'select public.request_trainer_access($1, $2, $3)', [trainer, luis, 'x'.repeat(301)]), /INVALID_REASON/));

// 8) Búsqueda: sólo nombres activos, sin contacto, mínimo 3 letras
const found = await as(trainer, 'aal2', "select * from trainer_search_clients('ana')");
ok('búsqueda encuentra al cliente activo', found.length === 1 && found[0].full_name === 'ANA EJEMPLO');
ok('búsqueda muestra mi estado (aprobado)', found[0].my_status === 'approved');
ok('búsqueda sin contacto', !Object.keys(found[0]).some(k => /phone|email|medical|notes/.test(k)));
ok('búsqueda no devuelve clientes congelados', (await as(trainer, 'aal2', "select * from trainer_search_clients('pausado')")).length === 0);
ok('búsqueda de menos de 3 letras se rechaza', await denied(as(trainer, 'aal2', "select * from trainer_search_clients('an')"), /QUERY_TOO_SHORT/));
ok('búsqueda trata % como texto, no como comodín', (await as(trainer, 'aal2', "select * from trainer_search_clients('%%%')")).length === 0);
ok('caja NO busca desde la función del entrenador', await denied(as(cashier, 'aal2', "select * from trainer_search_clients('ana')")));

// 9) Lectura de la tabla: cada uno ve lo que le corresponde
ok('entrenador ve sólo sus filas', (await as(trainer, 'aal2', 'select count(*)::int c from trainer_client_access where trainer_id <> $1', [trainer]))[0].c === 0);
ok('otro entrenador no ve las filas de este', (await as(trainer2, 'aal2', 'select count(*)::int c from trainer_client_access'))[0].c === 0);
ok('caja ve todas las solicitudes', (await as(cashier, 'aal2', 'select count(*)::int c from trainer_client_access'))[0].c >= 2);
ok('administrador ve todas las solicitudes', (await as(admin, 'aal2', 'select count(*)::int c from trainer_client_access'))[0].c >= 2);
ok('entrenador NO escribe la tabla directo', await denied(as(trainer, 'aal2', `insert into trainer_client_access(trainer_id, client_id, requested_via) values ($1, $2, 'trainer')`, [trainer, luis])));
ok('entrenador NO se aprueba cambiando la fila', await denied(as(trainer, 'aal2', `update trainer_client_access set status='approved'`)));
ok('nadie borra solicitudes directo', await denied(as(admin, 'aal2', 'delete from trainer_client_access')));

// 10) Revocación y cambio de rol
await as(admin, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [pendingId, 'revoked']);
ok('revocar quita el acceso', (await rosterOf(trainer)).length === 0);
ok('no se revoca dos veces', await denied(as(admin, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [pendingId, 'revoked']), /INVALID_STATE/));
await as(admin, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [luisId, 'approved']).catch(() => null);
ok('rechazado no se aprueba después (sólo pendientes)', await denied(as(admin, 'aal2', 'select public.admin_decide_trainer_access($1, $2)', [luisId, 'approved']), /INVALID_STATE/));

await as(admin, 'aal2', 'select public.admin_set_role($1, $2)', [trainer, 'cashier']);
ok('un entrenador convertido en caja pierde la lista', await denied(rosterOf(trainer)));
ok('el administrador puede ver el listado de solicitudes', (await as(admin, 'aal2', 'select count(*)::int c from trainer_client_access'))[0].c >= 1);

console.log(`\nPASS ${checks} comprobaciones de asignación entrenador-cliente`);
