-- ============================================================
--  Strong Fitness Gym — Datos iniciales
-- ============================================================
--  Cargá este archivo DESPUÉS de 00001_schema.sql, en el SQL Editor.
--  Se puede correr las veces que quieras: actualiza en lugar de duplicar.
--
--  Son los datos REALES del gimnasio. Lo que todavía no está
--  confirmado (precio de la mensualidad, nombres de entrenadores)
--  queda vacío o en NULL a propósito: la web muestra "Consultar"
--  en vez de inventar un número.
-- ============================================================


-- ------------------------------------------------------------
--  DISCIPLINAS
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


-- ------------------------------------------------------------
--  ENTRENADORES
-- ------------------------------------------------------------
--  El gimnasio todavía no pasó los nombres reales. Mientras la
--  tabla esté vacía, la web no muestra la sección "Nuestro equipo".
--
--  Para cargarlos, copiá este bloque y completá los datos:
--
--    insert into public.coaches
--      (id, slug, name, role_es, role_en, specialties, initials, color, sort_order)
--    values
--      ('cch_ejemplo', 'nombre-apellido', 'Nombre Apellido',
--       'Entrenador de boxeo', 'Boxing coach',
--       array['boxeo'], 'NA', '#d81a22', 1)
--    on conflict (id) do update set name = excluded.name;


-- ------------------------------------------------------------
--  PLANES
-- ------------------------------------------------------------
--  price = NULL significa "a consultar": la web muestra un botón
--  de WhatsApp en lugar de un precio.

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


-- ------------------------------------------------------------
--  CLASES DE LAS PRÓXIMAS 4 SEMANAS
-- ------------------------------------------------------------
--  generate_week_sessions(lunes) crea la grilla de una semana.
--  Acá la llamamos para las próximas 4 semanas (la fecha se
--  calcula tomando el lunes de esta semana).
--
--  La grilla sale de src/lib/data/demo-sessions.ts: boxeo los
--  martes, miércoles y jueves a las 06:00, 17:30 y 20:00.
--  El gimnasio cierra los domingos, así que no hay clases ese día.

select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1));
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 7);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 14);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 21);


-- ============================================================
--  ¿CÓMO DARME PERMISOS DE ADMIN?
-- ============================================================
--  1. Creá tu cuenta desde la web (/es/registro)
--  2. Volvé al SQL Editor y corré esto con tu email:
--
--     update public.profiles
--        set role = 'admin'
--      where email = 'tu-correo@ejemplo.com';
--
--  3. Salí y volvé a entrar a la web. Vas a ver el Panel.
-- ============================================================
