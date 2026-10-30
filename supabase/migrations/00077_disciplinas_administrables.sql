-- 00077 · Disciplinas administrables (OP-05, cuarta etapa)
--
-- Problema: `public.classes` ya existía y Operación podía prender y apagar una
-- disciplina, pero no había forma de crearla ni de corregir su nombre, sus
-- descripciones, su duración, su cupo, su intensidad, su color o su orden sin
-- editar una migración. Zumba existía en la base pero apagada, sin manera de
-- cargarla desde el panel.
--
-- Decisión de esta etapa:
--   * `admin_save_class()` crea y edita una disciplina. No borra nada: la baja
--     es el interruptor que ya existe (`admin_set_class_active`, migración
--     00064), con una sola implementación del cambio de estado.
--   * Toda alta o edición queda en `class_audit`, con quién, cuándo, qué acción
--     y los NOMBRES de los campos que cambiaron. Nunca los valores.
--   * El identificador estable (`id`) se arma con el slug al crear y no cambia
--     después: sesiones, reservas y planes ya apuntan a él.
--   * `admin_classes_catalog()` devuelve el catálogo con lo que cada disciplina
--     tiene encima (horarios fijos activos, clases futuras y planes), para que
--     quien edita sepa qué está tocando antes de tocarlo.
--
-- Reversión segura: eliminar `admin_save_class`, `admin_classes_catalog` y
-- `class_audit`, y volver a la versión de `admin_set_class_active` de 00064.
-- Las disciplinas creadas siguen existiendo: no se borra ningún dato.

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.classes') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'CLASS_ADMIN_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1. Bitácora de disciplinas: mismos criterios que `staff_audit` (00049).
create table if not exists public.class_audit (
  id             bigint generated always as identity primary key,
  class_id       text not null references public.classes (id) on delete cascade,
  action         text not null check (action in ('alta', 'edicion', 'baja', 'reactivacion')),
  changed_fields text[] not null default '{}',
  changed_by     uuid references public.profiles (id) on delete set null,
  changed_at     timestamptz not null default now()
);

create index if not exists class_audit_class_idx
  on public.class_audit (class_id, changed_at desc);

alter table public.class_audit enable row level security;
revoke all on public.class_audit from public, anon, authenticated;
grant select on public.class_audit to authenticated;
drop policy if exists class_audit_admin_read on public.class_audit;
create policy class_audit_admin_read on public.class_audit
  for select to authenticated using (public.is_admin());

-- 2. Catálogo con lo que cada disciplina tiene encima.
create or replace function public.admin_classes_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  return jsonb_build_object(
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'name_es', c.name_es,
        'name_en', c.name_en,
        'description_es', c.description_es,
        'description_en', c.description_en,
        'intensity', c.intensity,
        'duration_min', c.duration_min,
        'capacity', c.capacity,
        'color', c.color,
        'sort_order', c.sort_order,
        'is_active', c.is_active,
        'slots_active', (
          select count(*)::int from public.class_schedule_slots s
           where s.class_id = c.id and s.is_active
        ),
        'sessions_upcoming', (
          select count(*)::int from public.sessions s
           where s.class_id = c.id and s.status = 'scheduled' and s.starts_at > now()
        ),
        'plans', (
          select count(*)::int from public.plans p
           where p.class_id = c.id and p.is_active
        )
      ) order by c.sort_order, c.name_es)
      from public.classes c
    ), '[]'::jsonb),
    'intensities', jsonb_build_array('low', 'medium', 'high'),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'class_id', a.class_id,
        'class_name', (select name_es from public.classes where id = a.class_id),
        'action', a.action,
        'changed_fields', a.changed_fields,
        'changed_by_name', (
          select coalesce(pr.full_name, '')
          from public.profiles pr where pr.id = a.changed_by
        ),
        'changed_at', a.changed_at
      ) order by a.changed_at desc, a.id desc)
      from (
        select * from public.class_audit order by changed_at desc, id desc limit 20
      ) a
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_classes_catalog()
  from public, anon, authenticated;
grant execute on function public.admin_classes_catalog()
  to authenticated;

-- 3. Crear o editar una disciplina.
create or replace function public.admin_save_class(
  p_id text,
  p_slug text,
  p_name_es text,
  p_name_en text,
  p_description_es text,
  p_description_en text,
  p_intensity text,
  p_duration integer,
  p_capacity integer,
  p_color text,
  p_sort_order integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text := nullif(trim(coalesce(p_id, '')), '');
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_name_es text := trim(coalesce(p_name_es, ''));
  v_name_en text := trim(coalesce(p_name_en, ''));
  v_desc_es text := trim(coalesce(p_description_es, ''));
  v_desc_en text := trim(coalesce(p_description_en, ''));
  v_color text := lower(trim(coalesce(p_color, '#d81a22')));
  v_old public.classes;
  v_new public.classes;
  v_action text;
  v_fields text[] := '{}';
  v_new_id text;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;

  if length(v_name_es) not between 2 and 80 or length(v_name_en) not between 2 and 80 then
    raise exception 'INVALID_NAME';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 2 and 48 then
    raise exception 'INVALID_SLUG';
  end if;
  if length(v_desc_es) > 400 or length(v_desc_en) > 400 then
    raise exception 'INVALID_DESCRIPTION';
  end if;
  if p_intensity is null or p_intensity not in ('low', 'medium', 'high') then
    raise exception 'INVALID_INTENSITY';
  end if;
  if p_duration is null or p_duration not between 10 and 180 then
    raise exception 'INVALID_DURATION';
  end if;
  if p_capacity is null or p_capacity not between 1 and 200 then
    raise exception 'INVALID_CAPACITY';
  end if;
  if v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'INVALID_COLOR';
  end if;
  if p_sort_order is not null and p_sort_order not between 0 and 9999 then
    raise exception 'INVALID_ORDER';
  end if;

  -- Dos administradores a la vez no pueden crear la misma disciplina.
  perform pg_advisory_xact_lock(hashtext('strong_gym_admin_classes'));

  if v_id is null then
    v_new_id := 'cls_' || replace(v_slug, '-', '_');
    if exists (select 1 from public.classes where id = v_new_id or slug = v_slug) then
      raise exception 'CLASS_EXISTS';
    end if;

    insert into public.classes
      (id, slug, name_es, name_en, description_es, description_en, intensity,
       duration_min, capacity, color, sort_order, is_active)
    values
      (v_new_id, v_slug, v_name_es, v_name_en, coalesce(v_desc_es, ''), coalesce(v_desc_en, ''),
       p_intensity::public.intensity_level, p_duration, p_capacity, v_color,
       coalesce(p_sort_order, 100), true)
    returning * into v_new;

    insert into public.class_audit (class_id, action, changed_fields, changed_by)
    values (v_new.id, 'alta', array['slug', 'name_es', 'name_en'], auth.uid());

    v_id := v_new.id;
    v_action := 'alta';
  else
    select * into v_old from public.classes where id = v_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;

    if exists (select 1 from public.classes where slug = v_slug and id <> v_id) then
      raise exception 'CLASS_EXISTS';
    end if;

    -- El estado (activo/apagado) no se toca acá: tiene su propio interruptor.
    update public.classes
       set slug = v_slug,
           name_es = v_name_es,
           name_en = v_name_en,
           description_es = v_desc_es,
           description_en = v_desc_en,
           intensity = p_intensity::public.intensity_level,
           duration_min = p_duration,
           capacity = p_capacity,
           color = v_color,
           sort_order = coalesce(p_sort_order, sort_order)
     where id = v_id
    returning * into v_new;

    if v_old.slug <> v_new.slug then v_fields := array_append(v_fields, 'slug'); end if;
    if v_old.name_es <> v_new.name_es then v_fields := array_append(v_fields, 'name_es'); end if;
    if v_old.name_en <> v_new.name_en then v_fields := array_append(v_fields, 'name_en'); end if;
    if v_old.description_es is distinct from v_new.description_es then
      v_fields := array_append(v_fields, 'description_es');
    end if;
    if v_old.description_en is distinct from v_new.description_en then
      v_fields := array_append(v_fields, 'description_en');
    end if;
    if v_old.intensity <> v_new.intensity then v_fields := array_append(v_fields, 'intensity'); end if;
    if v_old.duration_min <> v_new.duration_min then v_fields := array_append(v_fields, 'duration_min'); end if;
    if v_old.capacity <> v_new.capacity then v_fields := array_append(v_fields, 'capacity'); end if;
    if v_old.color <> v_new.color then v_fields := array_append(v_fields, 'color'); end if;
    if v_old.sort_order <> v_new.sort_order then v_fields := array_append(v_fields, 'sort_order'); end if;

    if cardinality(v_fields) = 0 then
      v_action := 'sin_cambios';
    else
      insert into public.class_audit (class_id, action, changed_fields, changed_by)
      values (v_id, 'edicion', v_fields, auth.uid());
      v_action := 'edicion';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'changed_fields', v_fields,
    'class', (select jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name_es', c.name_es, 'name_en', c.name_en,
      'description_es', c.description_es, 'description_en', c.description_en,
      'intensity', c.intensity, 'duration_min', c.duration_min,
      'capacity', c.capacity, 'color', c.color, 'sort_order', c.sort_order,
      'is_active', c.is_active
    ) from public.classes c where c.id = v_id)
  );
end $$;

revoke all on function public.admin_save_class(text, text, text, text, text, text, text, integer, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.admin_save_class(text, text, text, text, text, text, text, integer, integer, text, integer)
  to authenticated;

-- 4. El interruptor de 00064, ahora también con bitácora. Misma firma, misma
--    respuesta: la aplicación no cambia, pero queda registro de quién apagó o
--    reactivó una disciplina y cuándo.
create or replace function public.admin_set_class_active(
  p_class_id text,
  p_is_active boolean,
  p_expected_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_class public.classes;
  v_previous_is_active boolean;
begin
  if not public.is_admin() then
    raise exception 'AUTH';
  end if;

  if p_class_id is null
     or p_is_active is null
     or char_length(p_class_id) < 1
     or char_length(p_class_id) > 160
     or p_class_id ~ '\s' then
    raise exception 'INVALID_ACTIVE_STATE';
  end if;

  select * into v_class
    from public.classes
   where id = p_class_id
   for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_previous_is_active := v_class.is_active;

  if v_previous_is_active = p_is_active then
    return jsonb_build_object(
      'id', v_class.id,
      'is_active', v_class.is_active,
      'previous_is_active', v_previous_is_active,
      'changed', false
    );
  end if;

  if p_expected_is_active is not null
     and v_previous_is_active is distinct from p_expected_is_active then
    raise exception 'STALE_ACTIVE_STATE';
  end if;

  update public.classes
     set is_active = p_is_active
   where id = v_class.id
  returning * into v_class;

  insert into public.class_audit (class_id, action, changed_by)
  values (v_class.id, case when p_is_active then 'reactivacion' else 'baja' end, auth.uid());

  return jsonb_build_object(
    'id', v_class.id,
    'is_active', v_class.is_active,
    'previous_is_active', v_previous_is_active,
    'changed', true
  );
end;
$$;

revoke all on function public.admin_set_class_active(text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_class_active(text, boolean, boolean)
  to authenticated;

notify pgrst, 'reload schema';
commit;
