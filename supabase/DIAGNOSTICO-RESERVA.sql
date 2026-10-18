-- SÓLO LECTURA. No crea, reserva, cancela, actualiza ni borra nada.
-- Caso de prueba: Carlicheta, Boxeo 20-oct-2026 06:00 Managua.
select 'cuenta_prueba' as apartado,
  coalesce(jsonb_agg(jsonb_build_object('id',p.id,'role',p.role)), '[]'::jsonb) as resultado
from public.profiles p where lower(p.email)='carlichetasequeira@gmail.com'
union all
select 'clase_y_reservas', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
from (
  select s.id as session_id,s.starts_at,s.ends_at,s.status,s.capacity,
    (select count(*) from public.bookings b where b.session_id=s.id and b.status in ('confirmed','attended')) as ocupadas,
    (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'user_id',b.user_id,'status',b.status,'created_at',b.created_at)), '[]'::jsonb)
      from public.bookings b join public.profiles p on p.id=b.user_id
      where b.session_id=s.id and lower(p.email)='carlichetasequeira@gmail.com') as reservas_de_la_cuenta_prueba
  from public.sessions s
  where s.starts_at='2026-10-20 06:00:00-06'::timestamptz
) x
union all
select 'politicas_bookings', coalesce(jsonb_agg(jsonb_build_object(
  'nombre',policyname,'roles',roles,'comando',cmd,'permisiva',permissive,'using',qual,'check',with_check)), '[]'::jsonb)
from pg_policies where schemaname='public' and tablename='bookings'
union all
select 'seguridad_bookings', jsonb_build_object('rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
  'authenticated_select',has_table_privilege('authenticated','public.bookings','SELECT'))
from pg_class c where c.oid='public.bookings'::regclass
union all
select 'funciones_reserva', coalesce(jsonb_agg(jsonb_build_object('firma',p.oid::regprocedure::text,
  'security_definer',p.prosecdef,'definicion',pg_get_functiondef(p.oid))), '[]'::jsonb)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('book_session','cancel_booking');
