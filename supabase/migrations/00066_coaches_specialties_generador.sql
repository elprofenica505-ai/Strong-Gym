-- 00066 · Compatibilidad de coaches para generar sesiones (corrección OP-04)
--
-- La primera pulsación real del botón de OP-04 falló en producción con
-- 42703: `generate_week_sessions()` busca `coaches.specialties`, pero la
-- tabla productiva divergió del esquema inicial y solo tiene el texto
-- visible `specialty`. Las migraciones 00050/00051 adaptaron las lecturas
-- con `coaches_public`, pero el generador histórico siguió dependiendo de
-- la columna estructurada original.
--
-- Corrección aditiva:
--   * Se restaura `specialties text[]` con el mismo tipo y valor inicial
--     del esquema 00001.
--   * No se infieren slugs desde textos como «Boxeo y acondicionamiento»:
--     las filas existentes quedan con '{}', igual que las sesiones ya
--     creadas conservaron `coach_id` nulo.
--   * No se modifican entrenadores, disciplinas, sesiones ni reservas.
--   * Esta migración no genera sesiones; solo deja operativo el botón.
--
-- Reversión: quitar la columna volvería a romper el generador, así que solo
-- debe hacerse después de reemplazar esa dependencia:
--   alter table public.coaches drop column if exists specialties;

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.coaches') is null
     or to_regprocedure('public.generate_week_sessions(date)') is null then
    raise exception 'COACHES_SPECIALTIES_PREREQUISITE_MISSING';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'coaches'
       and column_name = 'specialties'
       and not (data_type = 'ARRAY' and udt_name = '_text')
  ) then
    raise exception 'COACHES_SPECIALTIES_TYPE_MISMATCH';
  end if;
end $$;

alter table public.coaches
  add column if not exists specialties text[] not null default '{}'::text[];

comment on column public.coaches.specialties is
  'Slugs estructurados de disciplinas para el generador de sesiones. '
  'No confundir con specialty, que es el texto visible del entrenador.';

notify pgrst, 'reload schema';
commit;
