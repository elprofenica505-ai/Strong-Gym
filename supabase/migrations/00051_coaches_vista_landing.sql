-- 00051 · La vista de entrenadores que usa la landing
--
-- Contexto: en producción la tabla coaches no tiene sort_order, role_es, bio_es, color,
-- initials, slug ni specialties (ver 00050). La landing falla con 42703 porque ordena por sort_order.
--
-- Cambio (aditivo y reversible): se recrea la vista public.coaches_public con las columnas
-- que espera la landing, calculadas a partir de lo que sí existe. Solo columnas públicas:
-- no incluye monthly_salary, phone, email, notes, hire_date ni profile_id.
--
-- Reversión (copiar y pegar si hiciera falta): regresar a la vista de 00050:
--   drop view if exists public.coaches_public;
--   create view public.coaches_public as
--     select id, full_name, full_name as name, specialty, is_active from public.coaches;
--   grant select on public.coaches_public to anon, authenticated;

begin;

drop view if exists public.coaches_public;

create view public.coaches_public as
select
  c.id::text                                                        as id,
  c.id::text                                                        as slug,
  c.full_name                                                       as name,
  coalesce(c.specialty, '')                                         as role_es,
  coalesce(c.specialty, '')                                         as role_en,
  ''::text                                                          as bio_es,
  ''::text                                                          as bio_en,
  case when coalesce(c.specialty, '') = '' then '{}'::text[]
       else array[c.specialty] end                                  as specialties,
  upper(left(split_part(c.full_name, ' ', 1), 1)
     || left(split_part(c.full_name, ' ', 2), 1))                   as initials,
  '#d81a22'::text                                                   as color,
  row_number() over (order by c.full_name)::int                     as sort_order,
  c.full_name,
  c.specialty,
  c.is_active
from public.coaches c;

grant select on public.coaches_public to anon, authenticated;

commit;
