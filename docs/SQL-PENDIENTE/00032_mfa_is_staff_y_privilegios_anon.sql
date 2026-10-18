-- 00032 APLICADO en Supabase el 2026-10-18 con autorización del usuario. Prueba local previa: 14 comprobaciones.
-- Objetivo:
--   1) is_staff() exige aal2, igual que crm_is_staff() (00031). 22 políticas usan is_staff() sin MFA.
--   2) Quitar TRUNCATE, REFERENCES y TRIGGER a anon y authenticated en tablas de public.
--      Las políticas RLS no cubren TRUNCATE; la API no lo ofrece, pero el permiso sobra.
-- No cambia SELECT/INSERT/UPDATE/DELETE ni políticas RLS: esas se revisan aparte.

begin;
set local lock_timeout = '5s';

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists(
       select 1 from public.profiles
       where id = auth.uid() and role in ('admin', 'staff')
     );
$$;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- ROLLBACK (sólo si hay problemas y con autorización):
-- create or replace function public.is_staff() ... (definición anterior sin aal2)
-- grant truncate, references, trigger on all tables in schema public to anon, authenticated;
