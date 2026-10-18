-- DIAGNÓSTICO MANUAL: sólo metadatos; NO es una migración.
-- No lee registros de clientes, cuentas, saldos ni transacciones.
-- Incluye definiciones de vistas y triggers para preservar su lógica financiera.
-- Ejecutar en SQL Editor y Export > CSV: una fila evita el límite de 100 filas.
-- Las celdas de la pantalla pueden cortarse; el CSV conserva el texto completo.
with relaciones as (
  select c.oid, c.relname, c.relkind
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
    and (
      c.relname in ('payment_methods', 'member_balances', 'transactions')
      or c.relname ilike '%account%'
      or c.relname ilike '%cuenta%'
    )
), columnas as (
  select i.table_name as tabla, i.column_name as columna,
    i.ordinal_position as orden, i.data_type as tipo,
    i.udt_schema as esquema_tipo, i.udt_name as nombre_tipo,
    i.is_nullable as admite_null, i.column_default as valor_por_defecto,
    i.is_generated as generada, i.generation_expression as expresion
  from information_schema.columns i
  join relaciones r on r.relname = i.table_name
  where i.table_schema = 'public'
), restricciones as (
  select r.relname as tabla, c.conname as nombre,
    pg_catalog.pg_get_constraintdef(c.oid, true) as definicion
  from pg_catalog.pg_constraint c
  join relaciones r on r.oid = c.conrelid
), enumeraciones as (
  select n.nspname as esquema, t.typname as tipo,
    e.enumlabel as valor, e.enumsortorder as orden
  from pg_catalog.pg_enum e
  join pg_catalog.pg_type t on t.oid = e.enumtypid
  join pg_catalog.pg_namespace n on n.oid = t.typnamespace
  where exists (
    select 1 from columnas c
    where c.esquema_tipo = n.nspname and c.nombre_tipo = t.typname
  )
), disparadores as (
  select r.relname as tabla, t.tgname as nombre, t.tgenabled as estado,
    pg_catalog.pg_get_triggerdef(t.oid, true) as definicion,
    pg_catalog.pg_get_functiondef(t.tgfoid) as funcion
  from pg_catalog.pg_trigger t
  join relaciones r on r.oid = t.tgrelid
  where not t.tgisinternal
), vistas as (
  select r.relname as nombre,
    pg_catalog.pg_get_viewdef(r.oid, true) as definicion
  from relaciones r where r.relkind in ('v', 'm')
)
select jsonb_pretty(jsonb_build_object(
  'relaciones', coalesce((select jsonb_agg(jsonb_build_object('nombre', relname, 'clase', relkind) order by relname) from relaciones), '[]'::jsonb),
  'columnas', coalesce((select jsonb_agg(to_jsonb(c) order by tabla, orden) from columnas c), '[]'::jsonb),
  'restricciones', coalesce((select jsonb_agg(to_jsonb(c) order by tabla, nombre) from restricciones c), '[]'::jsonb),
  'enumeraciones', coalesce((select jsonb_agg(to_jsonb(e) order by esquema, tipo, orden) from enumeraciones e), '[]'::jsonb),
  'triggers', coalesce((select jsonb_agg(to_jsonb(t) order by tabla, nombre) from disparadores t), '[]'::jsonb),
  'vistas', coalesce((select jsonb_agg(to_jsonb(v) order by nombre) from vistas v), '[]'::jsonb)
)) as diagnostico;
