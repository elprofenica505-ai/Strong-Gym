-- Sólo metadatos. NO instala, cobra, recalcula, borra ni cambia permisos.
-- Las funciones se leen como texto: NO se ejecutan.
-- Exportar la única fila como CSV. Revisar antes de compartir por si hay
-- secretos incrustados en funciones personalizadas; no compartir claves.
with funciones as (
  select p.proname as nombre,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as argumentos,
    p.prosecdef as security_definer, p.proconfig as configuracion,
    pg_catalog.pg_get_functiondef(p.oid) as definicion
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind in ('f','p')
    and p.proname not like 'crm\_%' escape '\'
    and (
      p.prosrc ~* '\m(transactions|bank_accounts|member_balances|payment_methods|cash_registers|invoices)\M'
      or p.proname ~* '(payment|transaction|cash|finance|balance|cobro|pago|caja|invoice)'
    )
), relaciones as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m')
    and (
      c.relname in ('transactions','bank_accounts','accounts','member_balances',
        'payment_methods','expense_categories','invoices','invoice_items','cash_registers')
      or c.relname ~* '(exchange|finance|cash|account|balance|monthly|daily|receivable|payment|caja|rate|setting)'
    )
), vistas as (
  select r.relname as nombre, r.reloptions as opciones,
    pg_catalog.pg_get_viewdef(r.oid,true) as definicion
  from relaciones r where r.relkind in ('v','m')
), columnas as (
  select c.table_name as tabla,c.column_name as columna,c.ordinal_position as orden,
    c.data_type as tipo,c.udt_name as nombre_tipo,
    c.numeric_precision as precision,c.numeric_scale as decimales,c.is_nullable as admite_null
  from information_schema.columns c join relaciones r on r.relname=c.table_name
  where c.table_schema='public'
), politicas as (
  select r.relname as tabla,p.polname as nombre,p.polcmd as comando,
    p.polpermissive as permisiva,
    array(select rolname from pg_catalog.pg_roles where oid=any(p.polroles)) as roles,
    0=any(p.polroles) as aplica_a_public,
    pg_catalog.pg_get_expr(p.polqual,p.polrelid) as expresion_using,
    pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) as expresion_check
  from pg_catalog.pg_policy p join relaciones r on r.oid=p.polrelid
), permisos as (
  select g.table_name as tabla,g.grantee as rol,g.privilege_type as permiso
  from information_schema.table_privileges g
  join relaciones r on r.relname=g.table_name
  where g.table_schema='public' and g.grantee in ('anon','authenticated','PUBLIC')
)
select jsonb_pretty(jsonb_build_object(
  'funciones',coalesce((select jsonb_agg(to_jsonb(f) order by nombre,argumentos) from funciones f),'[]'::jsonb),
  'relaciones',coalesce((select jsonb_agg(jsonb_build_object('nombre',relname,'clase',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity) order by relname) from relaciones),'[]'::jsonb),
  'vistas',coalesce((select jsonb_agg(to_jsonb(v) order by nombre) from vistas v),'[]'::jsonb),
  'columnas',coalesce((select jsonb_agg(to_jsonb(c) order by tabla,orden) from columnas c),'[]'::jsonb),
  'politicas',coalesce((select jsonb_agg(to_jsonb(p) order by tabla,nombre) from politicas p),'[]'::jsonb),
  'permisos',coalesce((select jsonb_agg(to_jsonb(p) order by tabla,rol,permiso) from permisos p),'[]'::jsonb)
)) as diagnostico;
