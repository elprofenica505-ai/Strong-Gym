-- 00050 · Proteger datos del personal en la tabla coaches
--
-- Problema: la política "Authenticated can read coaches" dejaba leer TODAS las columnas
-- (monthly_salary, phone, email, notes, hire_date, profile_id) a cualquier usuario con sesión.
--
-- Cambio (aditivo y reversible):
--  1. Vista public.coaches_public con solo las columnas públicas: id, full_name, name (alias
--     de full_name para el detalle de sesión), specialty, is_active.
--  2. Se quita la política de lectura general. Queda solo la política de administrador
--     (is_admin()), que ya existía para escribir y leer.
--  3. La landing y el detalle de sesión leen la vista, no la tabla.
--
-- Reversión (copiar y pegar si hiciera falta):
--   create policy "Authenticated can read coaches" on public.coaches
--     for select to authenticated using (true);
--   drop view if exists public.coaches_public;

begin;

create or replace view public.coaches_public as
select
  id,
  full_name,
  full_name as name,
  specialty,
  is_active
from public.coaches;

grant select on public.coaches_public to anon, authenticated;

drop policy if exists "Authenticated can read coaches" on public.coaches;

commit;
