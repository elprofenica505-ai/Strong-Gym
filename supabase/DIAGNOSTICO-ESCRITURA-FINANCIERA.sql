-- Sólo metadatos: NO cobra, borra, recalcula ni cambia permisos.
-- Lee las funciones como texto, NO las ejecuta. No incluye filas de clientes ni movimientos.
-- Exportá la única fila como CSV. Revisá que funciones personalizadas no contengan
-- secretos incrustados antes de compartir; nunca compartás claves ni contraseñas.
with relaciones as (
  select c.* from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m')
    and (c.relname in ('transactions','bank_accounts','accounts','member_balances',
      'payment_methods','expense_categories','invoices','invoice_items','cash_registers')
      or c.relname ~* '(exchange|finance|cash|account|balance|monthly|daily|receivable|payment|caja|rate|setting)')
), disparadores as (
  select t.* from pg_catalog.pg_trigger t join relaciones r on r.oid=t.tgrelid
  where not t.tgisinternal
), funciones as (
  select p.* from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p') and (
    p.oid in (select tgfoid from disparadores)
    or (n.nspname='public' and (
      p.prosrc ~* '\m(transactions|bank_accounts|member_balances|payment_methods|cash_registers|invoices)\M'
      or p.proname ~* '(payment|transaction|cash|finance|balance|cobro|pago|caja|invoice)')))
)
select jsonb_pretty(jsonb_build_object(
  'funciones',coalesce((select jsonb_agg(jsonb_build_object('nombre',p.proname,'firma',p.oid::regprocedure::text,'security_definer',p.prosecdef,'configuracion',p.proconfig,'permisos',p.proacl,'definicion',pg_catalog.pg_get_functiondef(p.oid))) from funciones p),'[]'::jsonb),
  'relaciones',coalesce((select jsonb_agg(jsonb_build_object('nombre',relname,'clase',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity)) from relaciones),'[]'::jsonb),
  'columnas',coalesce((select jsonb_agg(to_jsonb(c) order by c.table_name,c.ordinal_position) from information_schema.columns c join relaciones r on r.relname=c.table_name where c.table_schema='public'),'[]'::jsonb),
  'restricciones',coalesce((select jsonb_agg(jsonb_build_object('tabla',r.relname,'nombre',c.conname,'definicion',pg_catalog.pg_get_constraintdef(c.oid,true))) from pg_catalog.pg_constraint c join relaciones r on r.oid=c.conrelid),'[]'::jsonb),
  'disparadores',coalesce((select jsonb_agg(jsonb_build_object('tabla',t.tgrelid::regclass::text,'nombre',t.tgname,'habilitado',t.tgenabled,'funcion',t.tgfoid::regprocedure::text,'definicion',pg_catalog.pg_get_triggerdef(t.oid,true))) from disparadores t),'[]'::jsonb),
  'vistas',coalesce((select jsonb_agg(jsonb_build_object('nombre',r.relname,'opciones',r.reloptions,'definicion',pg_catalog.pg_get_viewdef(r.oid,true))) from relaciones r where r.relkind in ('v','m')),'[]'::jsonb),
  'politicas',coalesce((select jsonb_agg(to_jsonb(p)) from pg_catalog.pg_policies p join relaciones r on r.relname=p.tablename where p.schemaname='public'),'[]'::jsonb),
  'permisos',coalesce((select jsonb_agg(to_jsonb(g)) from information_schema.table_privileges g join relaciones r on r.relname=g.table_name where g.table_schema='public' and g.grantee in ('anon','authenticated','PUBLIC')),'[]'::jsonb)
)) as diagnostico;
