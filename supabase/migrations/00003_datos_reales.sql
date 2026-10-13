-- ============================================================
--  Strong Fitness Gym — 00003 · Datos reales del gimnasio
-- ============================================================
--  QUÉ HACE ESTE ARCHIVO
--  ---------------------
--  La primera carga de la base traía disciplinas, entrenadores y
--  precios de ejemplo. Esta migración los reemplaza por los datos
--  reales del gimnasio y deja la grilla de clases correcta:
--
--    · Disciplinas: pesas y máquinas, boxeo, zumba (antes eran 9).
--    · Entrenadores de ejemplo: se eliminan (eran inventados).
--    · Planes: Boxeo $20/mes + dos planes "a consultar".
--    · Grilla: boxeo martes, miércoles y jueves a las 06:00,
--      17:30 y 20:00. El domingo el gimnasio cierra.
--
--  SE PUEDE CORRER VARIAS VECES
--  ----------------------------
--  Todo está escrito para ser idempotente: si la corrés dos veces
--  el resultado es el mismo.
--
--  NO BORRA DATOS DE SOCIOS
--  ------------------------
--  Las cuentas, los perfiles y las reservas no se tocan.
--  · Las clases ya pasadas quedan intactas (son historial).
--  · Si una clase futura tenía gente anotada, NO se borra: se marca
--    como cancelada para que el socio la siga viendo en su cuenta.
--  · Sólo se borran las clases futuras a las que nadie se anotó.
--
--  CÓMO CORRERLA
--  -------------
--  Supabase → SQL Editor → New query → pegar todo → Run.
-- ============================================================

begin;


-- ------------------------------------------------------------
--  1. El precio puede quedar sin publicar
-- ------------------------------------------------------------
--  Hay planes cuyo precio todavía no se anuncia en la web. En vez
--  de inventar un número, guardamos NULL y la web muestra
--  "Consultar por WhatsApp".

alter table public.plans alter column price drop not null;
alter table public.plans alter column price drop default;


-- ------------------------------------------------------------
--  2. Color de marca
-- ------------------------------------------------------------
--  El verde lima del diseño anterior se reemplaza por el rojo real.

alter table public.classes alter column color set default '#d81a22';
alter table public.coaches alter column color set default '#d81a22';

update public.classes set color = '#d81a22' where color = '#cbf73f';
update public.coaches set color = '#d81a22' where color = '#cbf73f';


-- ------------------------------------------------------------
--  3. Grilla semanal nueva
-- ------------------------------------------------------------
--  Volvemos a crear la función que arma las clases de una semana,
--  ahora con la grilla real. El bloque marcado lo genera
--  scripts/build-sql.mjs a partir de src/lib/data/demo-sessions.ts,
--  así la web y la base nunca se desincronizan.

create or replace function public.generate_week_sessions(p_monday date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_slot record;
  v_class  public.classes;
  v_coach  text;
  v_start  timestamptz;
  v_created integer;
begin
  -- Sólo admin o staff
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  ) and auth.uid() is not null then
    raise exception 'AUTH: sólo el staff puede generar horarios';
  end if;

  for v_slot in
    select * from (values
-- >>> PLANTILLA SEMANAL (generada por scripts/build-sql.mjs — no editar a mano) >>>
      -- Misma grilla que src/lib/data/demo-sessions.ts (la web).
      -- día (0 = lunes), hora local del gimnasio, disciplina
      -- Lunes: sin clases dirigidas (sala abierta)
      -- Martes
      (1, '06:00'::time, 'boxeo'),
      (1, '17:30'::time, 'boxeo'),
      (1, '20:00'::time, 'boxeo'),
      -- Miércoles
      (2, '06:00'::time, 'boxeo'),
      (2, '17:30'::time, 'boxeo'),
      (2, '20:00'::time, 'boxeo'),
      -- Jueves
      (3, '06:00'::time, 'boxeo'),
      (3, '17:30'::time, 'boxeo'),
      (3, '20:00'::time, 'boxeo')
      -- Viernes: sin clases dirigidas (sala abierta)
      -- Sábado: sin clases dirigidas (sala abierta)
      -- Domingo: CERRADO
-- <<< PLANTILLA SEMANAL <<<
    ) as t(day_offset, start_time, slug)
  loop
    select * into v_class from public.classes where slug = v_slot.slug and is_active;
    if not found then continue; end if;

    -- `fecha + hora` da un timestamp "sin zona"; AT TIME ZONE lo interpreta
    -- como hora local del gimnasio y devuelve el instante UTC correcto.
    -- (Managua es UTC-6 todo el año, no tiene horario de verano.)
    v_start := ((p_monday + v_slot.day_offset) + v_slot.start_time)
               at time zone 'America/Managua';

    -- Evitamos duplicar si ya existe esa clase a esa hora
    select count(*) into v_created
    from public.sessions
    where class_id = v_class.id and starts_at = v_start;

    if v_created > 0 then continue; end if;

    -- Elegimos un profe al azar entre los que dictan la disciplina
    select id into v_coach
    from public.coaches
    where is_active and v_class.slug = any (specialties)
    order by random()
    limit 1;

    insert into public.sessions (class_id, coach_id, starts_at, ends_at, capacity, room)
    values (
      v_class.id,
      v_coach,
      v_start,
      v_start + (v_class.duration_min || ' minutes')::interval,
      v_class.capacity,
      case v_class.slug
-- >>> SALAS >>>
        when 'boxeo' then 'Área de boxeo'
        when 'musculacion' then 'Sala de máquinas'
        when 'zumba' then 'Salón de clases'
-- <<< SALAS <<<
        else 'Salón principal'
      end
    );

    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.generate_week_sessions(date) from public;
grant execute on function public.generate_week_sessions(date) to authenticated;


-- ------------------------------------------------------------
--  4. Limpiar las clases futuras de la grilla vieja
-- ------------------------------------------------------------
--  Primero protegemos lo que tiene gente anotada: esas clases no se
--  borran, se marcan como canceladas.

update public.sessions s
   set status = 'cancelled'
 where s.starts_at >= now()
   and s.status <> 'cancelled'
   and exists (
     select 1 from public.bookings b
      where b.session_id = s.id
        and b.status in ('confirmed', 'attended')
   );

--  Y ahora sí borramos las clases futuras a las que nadie se anotó.
--  Las de la grilla nueva se vuelven a crear en el paso 8.

delete from public.sessions s
 where s.starts_at >= now()
   and not exists (select 1 from public.bookings b where b.session_id = s.id);


-- ------------------------------------------------------------
--  5. Entrenadores de ejemplo
-- ------------------------------------------------------------
--  Los seis entrenadores de la carga inicial eran inventados.
--  Al borrarlos, las clases que los tenían asignados quedan
--  simplemente sin profe (la FK es ON DELETE SET NULL).
--
--  Cuando el gimnasio pase los nombres reales, se cargan con el
--  bloque de ejemplo que está en 00002_seed.sql.

delete from public.coaches
 where id in ('cch_diego', 'cch_sofia', 'cch_nicolas',
              'cch_valentina', 'cch_marcos', 'cch_julieta');


-- ------------------------------------------------------------
--  6. Disciplinas reales
-- ------------------------------------------------------------

insert into public.classes
  (id, slug, name_es, name_en, description_es, description_en, intensity, duration_min, capacity, color, sort_order)
values
  ('cls_musculacion', 'musculacion', 'Pesas y máquinas', 'Weights & Machines',
   'Sala completa con máquinas modernas y pesas libres: pecho, espalda, pierna, tríceps, pantorrilla y abdominales. Entrás en el horario que quieras, sin reservar.',
   'A full floor of modern machines and free weights: chest, back, legs, triceps, calves and abs. Walk in whenever you like, no booking needed.',
   'medium', 60, 40, '#0c0c0e', 1),

  ('cls_boxeo', 'boxeo', 'Boxeo', 'Boxing',
   'Clases de boxeo para todas las edades, con entrenador en cada sesión. Técnica, saco y acondicionamiento. Martes, miércoles y jueves, con tres horarios al día.',
   'Boxing classes for all ages, with a coach in every session. Technique, heavy bag and conditioning. Tuesday, Wednesday and Thursday, three time slots a day.',
   'high', 60, 20, '#d81a22', 2),

  ('cls_zumba', 'zumba', 'Zumba y bailoterapia', 'Zumba & Dance Cardio',
   'Cardio bailando ritmos latinos. Quemás calorías sin aburrirte y en grupo. Consultá el horario vigente por WhatsApp.',
   'Dance cardio to Latin rhythms. Burn calories without getting bored, in a group. Ask for the current schedule on WhatsApp.',
   'medium', 60, 30, '#8f0f15', 3)
on conflict (id) do update set
  slug = excluded.slug,
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  description_es = excluded.description_es,
  description_en = excluded.description_en,
  intensity = excluded.intensity,
  duration_min = excluded.duration_min,
  capacity = excluded.capacity,
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_active = true;

--  Las disciplinas viejas (spinning, yoga, pilates, hiit, funcional,
--  cross-training, stretching) salen de la web.
--  Las que todavía tienen clases pasadas quedan guardadas pero
--  desactivadas, para no romper el historial de nadie.

update public.classes
   set is_active = false
 where slug not in ('musculacion', 'boxeo', 'zumba');

delete from public.classes c
 where c.slug not in ('musculacion', 'boxeo', 'zumba')
   and not exists (select 1 from public.sessions s where s.class_id = c.id);


-- ------------------------------------------------------------
--  7. Planes reales
-- ------------------------------------------------------------
--  price = NULL significa "a consultar": la web muestra un botón de
--  WhatsApp en vez de un precio inventado.

insert into public.plans
  (id, slug, name_es, name_en, tagline_es, tagline_en, price, period, features_es, features_en, is_popular, sort_order)
values
  ('pln_boxeo', 'boxeo', 'Boxeo', 'Boxing',
   'Para todas las edades, con entrenador', 'All ages, coach included',
   20, 'month',
   array['Martes, miércoles y jueves', '3 sesiones al día a elegir', 'Entrenador en cada clase', 'Para todas las edades'],
   array['Tuesday, Wednesday and Thursday', '3 daily sessions to choose from', 'A coach in every class', 'Open to all ages'],
   true, 1),

  ('pln_gimnasio', 'gimnasio-mensual', 'Gimnasio mensual', 'Monthly Gym',
   'Pesas y máquinas todo el mes', 'Weights and machines all month',
   null, 'month',
   array['Máquinas modernas y pesas libres', 'Acceso en todo el horario de atención', 'Orientación del personal para usar los equipos', 'Consultá el precio por WhatsApp'],
   array['Modern machines and free weights', 'Access during all opening hours', 'Staff guidance on how to use the equipment', 'Ask for the price on WhatsApp'],
   false, 2),

  ('pln_dia', 'pase-del-dia', 'Pase del día', 'Day Pass',
   'Una visita para conocernos', 'A single visit to try us out',
   null, 'session',
   array['Una visita, sin compromiso', 'Ideal para probar la sala', 'Consultá el precio por WhatsApp'],
   array['One visit, no commitment', 'Great for trying the gym floor', 'Ask for the price on WhatsApp'],
   false, 3)
on conflict (id) do update set
  slug = excluded.slug,
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  tagline_es = excluded.tagline_es,
  tagline_en = excluded.tagline_en,
  price = excluded.price,
  period = excluded.period,
  features_es = excluded.features_es,
  features_en = excluded.features_en,
  is_popular = excluded.is_popular,
  sort_order = excluded.sort_order,
  is_active = true;

delete from public.plans
 where id in ('pln_basico', 'pln_full', 'pln_duo', 'pln_personal');

--  Si algún socio tenía asignado uno de esos planes, le dejamos el
--  plan vacío para que no apunte a algo que ya no existe.
--  La cuenta, el historial y las reservas no se tocan.

update public.profiles
   set plan_id = null
 where plan_id is not null
   and plan_id not in (select id from public.plans);


-- ------------------------------------------------------------
--  8. Mensajes de ejemplo
-- ------------------------------------------------------------
--  La carga inicial traía dos consultas de prueba en el buzón del
--  panel. Las sacamos para que no se confundan con consultas reales.

delete from public.messages
 where email in ('andrea.solis@example.com', 'kevin.ramirez@example.com');


-- ------------------------------------------------------------
--  9. Clases de las próximas 4 semanas
-- ------------------------------------------------------------
--  Se arma la grilla nueva desde el lunes de esta semana.
--  Son 9 clases por semana → 36 en total.

select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1));
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 7);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 14);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 21);


commit;


-- ============================================================
--  COMPROBAR QUE SALIÓ BIEN
-- ============================================================
--  Pegá esta consulta aparte y tocá Run. Tiene que devolver
--  exactamente estas cuatro filas:
--
--    disciplinas activas          | 3
--    entrenadores                 | 0
--    planes                       | 3
--    clases cargadas (4 semanas)  | 36
--
--  select 'disciplinas activas' as dato, count(*)::text as valor
--    from public.classes where is_active
--  union all
--  select 'entrenadores', count(*)::text from public.coaches
--  union all
--  select 'planes', count(*)::text from public.plans where is_active
--  union all
--  select 'clases cargadas (4 semanas)', count(*)::text
--    from public.sessions s
--    join public.classes c on c.id = s.class_id
--   where c.is_active
--     and s.status = 'scheduled'
--     and s.starts_at >= date_trunc('week', now());
-- ============================================================
