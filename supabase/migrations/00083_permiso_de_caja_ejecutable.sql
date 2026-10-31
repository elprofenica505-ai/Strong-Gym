-- 00083 · La función que leen las políticas de caja vuelve a ser ejecutable
--
-- Qué pasó: la 00056 creó `finance_permission_enabled(text)` y, a propósito,
-- la dejó ejecutable por `authenticated`, porque **cuatro políticas RLS la
-- llaman directamente** dentro de su condición:
--
--   * `cashier_account_balances_restrictive` (bank_accounts)
--   * `cashier_receivables_member_balances` (member_balances)
--   * `cashier_receivables_client_balances` (client_debt_balances)
--   * `cashier_receivables_client_entries` (client_debt_entries)
--
-- La 00080 (anulación controlada) volvió a crear la misma función para sumar
-- el interruptor `cashier_can_void` y copió el `revoke all ...` sin el
-- `grant execute` que la 00056 sí tenía. Desde ese momento, cualquier lectura
-- de esas cuatro tablas por una sesión con rol `authenticated` fallaba con
-- `42501 permission denied for function finance_permission_enabled`, incluso
-- para administración: el permiso se comprueba al empezar la consulta, antes
-- de decidir si el `or` de la condición hacía falta. Lo que se veía en la app:
-- Reportes con «Información financiera no disponible · FIN_REPORT_DEBT_42501».
--
-- Qué hace esta migración:
--   1. Devuelve el `grant execute` a `authenticated`, que es lo que la 00056
--      ya había decidido. No se abre a `anon`: sin sesión no hay permiso que
--      consultar.
--   2. Deja una auditoría que falla si vuelve a pasar: si alguna política del
--      esquema `public` llama a una función que `authenticated` no puede
--      ejecutar, la migración se corta con el nombre de la función. Así el
--      error aparece al aplicar el SQL y no en la cara del dueño.
--
-- Nada de esto cambia datos, políticas ni permisos guardados: la función solo
-- devuelve verdadero o falso y no lee ninguna tabla del gimnasio que no sea
-- `staff_permissions`.
--
-- Reversible: volver a ejecutar el `revoke` de la 00080 deja el sistema como
-- estaba (roto para leer deudas). No se borra nada.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regprocedure('public.finance_permission_enabled(text)') is null then
    raise exception 'CASHIER_PERMISSION_PREREQUISITE_MISSING';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'CASHIER_PERMISSION_ROLE_MISSING';
  end if;
end $$;

grant execute on function public.finance_permission_enabled(text) to authenticated;

-- Auditoría: toda función usada dentro de una política tiene que poder ser
-- ejecutada por `authenticated`. Si no, la política hace fallar la lectura
-- entera con 42501 en vez de permitir o negar filas.
do $$
declare
  v_missing text;
begin
  select string_agg(distinct p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_missing
    from pg_policies pol
    cross join lateral regexp_matches(
      coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''),
      '([a-z_][a-z0-9_]*)[[:space:]]*\(', 'g'
    ) as m(nombre)
    join pg_proc p on p.proname = m.nombre[1]
    join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
   where pol.schemaname = 'public'
     and not has_function_privilege('authenticated', p.oid, 'execute');

  if v_missing is not null then
    raise exception 'POLICY_FUNCTION_NOT_EXECUTABLE: %', v_missing;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
