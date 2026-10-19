-- 00037 CIERRE DEL DÍA PARA CAJA: interruptor del administrador.
-- ESTADO: APLICADO en Supabase (proyecto hcnuepdxmbsmlzdmvwhx) el 2026-10-19 con autorización del dueño. Interruptor apagado.
-- Qué hace:
--   1) Agrega el interruptor `cashier_can_view_daily_close` (apagado por defecto) en staff_permissions.
--   2) Crea cashier_daily_close_enabled(): devuelve true sólo si el interruptor está activo,
--      la sesión es aal2 y quien llama tiene rol cashier. El administrador no usa esta función
--      (lee el interruptor directamente con su RLS de 00033).
-- No cambia ninguna regla existente de transactions, debts ni del resto de los permisos.
-- Requiere 00033 (staff_permissions) ya aplicada.

begin;
set local lock_timeout = '5s';

insert into public.staff_permissions (key, enabled)
values ('cashier_can_view_daily_close', false)
on conflict (key) do nothing;

create or replace function public.cashier_daily_close_enabled()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists(select 1 from public.profiles where id = auth.uid() and role::text = 'cashier')
     and coalesce((select enabled from public.staff_permissions where key = 'cashier_can_view_daily_close'), false);
$$;

revoke all on function public.cashier_daily_close_enabled() from public, anon;
grant execute on function public.cashier_daily_close_enabled() to authenticated;

commit;
