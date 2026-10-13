-- ============================================================
--  Strong Gym — Datos iniciales
-- ============================================================
--  Cargá este archivo DESPUÉS de 00001_schema.sql, en el SQL Editor.
--  Se puede correr las veces que quieras: actualiza en lugar de duplicar.
-- ============================================================


-- ------------------------------------------------------------
--  DISCIPLINAS
-- ------------------------------------------------------------

insert into public.classes
  (id, slug, name_es, name_en, description_es, description_en, intensity, duration_min, capacity, color, sort_order)
values
  ('cls_funcional', 'funcional', 'Funcional', 'Functional Training',
   'Trabajo de fuerza y resistencia con el peso del cuerpo, kettlebells, TRX y sogas. Mejora todo lo que necesitás para el día a día.',
   'Strength and endurance work with bodyweight, kettlebells, TRX and ropes. Builds everything you need for daily life.',
   'high', 50, 18, '#cbf73f', 1),

  ('cls_cross', 'cross-training', 'Cross Training', 'Cross Training',
   'Circuitos de alta intensidad que combinan levantamiento, gimnasia y cardio. La clase más exigente del gimnasio.',
   'High-intensity circuits combining lifting, gymnastics and cardio. The toughest class we run.',
   'high', 60, 16, '#ff5b26', 2),

  ('cls_spinning', 'spinning', 'Spinning', 'Spinning',
   'Pedaleo con música, luces y mucha energía. Quemá calorías y mejorá tu capacidad cardiovascular sin impacto en las rodillas.',
   'Pedal to music, lights and high energy. Burn calories and improve your cardio with zero impact on your knees.',
   'high', 45, 24, '#38bdf8', 3),

  ('cls_hiit', 'hiit', 'HIIT', 'HIIT',
   'Intervalos cortos de máxima intensidad con descansos medidos. 40 minutos que rinden como dos horas.',
   'Short bursts of maximum intensity with measured rest. 40 minutes that pay off like two hours.',
   'high', 40, 20, '#f472b6', 4),

  ('cls_boxeo', 'boxeo', 'Boxeo', 'Boxing',
   'Técnica, bolsa y guanteo controlado. Aprendés a moverte, ganás reflejos y descargás todo el estrés de la semana.',
   'Technique, heavy bag and controlled sparring. Learn to move, sharpen your reflexes and burn off the week''s stress.',
   'high', 55, 14, '#ef4444', 5),

  ('cls_zumba', 'zumba', 'Zumba', 'Zumba',
   'Coreografías de ritmos latinos para entrenar sin darte cuenta. La clase donde más te vas a reír.',
   'Latin rhythm choreographies that sneak the workout in. The class where you''ll laugh the most.',
   'medium', 45, 26, '#fbbf24', 6),

  ('cls_pilates', 'pilates', 'Pilates', 'Pilates',
   'Trabajo profundo de core, postura y respiración. Ideal si pasás muchas horas sentado o si estás volviendo de una lesión.',
   'Deep core work, posture and breathing. Ideal if you sit for long hours or are coming back from an injury.',
   'low', 50, 16, '#a78bfa', 7),

  ('cls_yoga', 'yoga', 'Yoga', 'Yoga',
   'Posturas, respiración y estiramiento para cerrar el día. Bajá el ritmo, soltá la espalda y dormí mejor.',
   'Poses, breathing and stretching to close the day. Slow down, release your back and sleep better.',
   'low', 60, 20, '#4ade80', 8),

  ('cls_stretching', 'stretching', 'Stretching y movilidad', 'Stretching & Mobility',
   'Rutina de movilidad articular y elongación guiada. La mejor manera de evitar lesiones y recuperarte más rápido.',
   'Joint mobility and guided stretching routine. The best way to avoid injuries and recover faster.',
   'low', 45, 22, '#22d3ee', 9)
on conflict (id) do update set
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  description_es = excluded.description_es,
  description_en = excluded.description_en,
  intensity = excluded.intensity,
  duration_min = excluded.duration_min,
  capacity = excluded.capacity,
  color = excluded.color,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  PROFES
-- ------------------------------------------------------------

insert into public.coaches
  (id, slug, name, role_es, role_en, bio_es, bio_en, specialties, initials, color, sort_order)
values
  ('cch_diego', 'diego-farias', 'Diego Farías',
   'Head Coach · Funcional y Cross', 'Head Coach · Functional & Cross',
   'Ex jugador de rugby y entrenador hace 12 años. Especialista en fuerza y acondicionamiento. Si querés resultados, Diego te los va a sacar.',
   'Former rugby player and coach for 12 years. Strength and conditioning specialist. If you want results, Diego will get them out of you.',
   array['funcional', 'cross-training'], 'DF', '#cbf73f', 1),

  ('cch_sofia', 'sofia-mendez', 'Sofía Méndez',
   'Spinning e HIIT', 'Spinning & HIIT',
   'Instructora de ciclismo indoor certificada. Sus clases tienen lista de espera todos los martes: la energía que pone es difícil de igualar.',
   'Certified indoor cycling instructor. Her classes have a waiting list every Tuesday: her energy is hard to match.',
   array['spinning', 'hiit'], 'SM', '#38bdf8', 2),

  ('cch_nicolas', 'nicolas-ruiz', 'Nicolás Ruiz',
   'Boxeo', 'Boxing',
   'Boxeador amateur con 40 peleas y entrenador de la escuela juvenil del club. Enseña técnica desde cero, sin apuro.',
   'Amateur boxer with 40 fights and coach of the club''s youth school. Teaches technique from scratch, no rush.',
   array['boxeo', 'funcional'], 'NR', '#ef4444', 3),

  ('cch_valentina', 'valentina-sosa', 'Valentina Sosa',
   'Yoga y Pilates', 'Yoga & Pilates',
   'Kinesióloga y profesora de yoga. Trabaja con rehabilitación postural y adapta cada postura a tu cuerpo.',
   'Physiotherapist and yoga teacher. She works with postural rehab and adapts every pose to your body.',
   array['yoga', 'pilates', 'stretching'], 'VS', '#4ade80', 4),

  ('cch_marcos', 'marcos-leiva', 'Marcos Leiva',
   'Zumba y Stretching', 'Zumba & Stretching',
   'Bailarín y profesor de danza. Hace que la clase más divertida sea también la que más te hace transpirar.',
   'Dancer and dance teacher. He makes the most fun class also the one that makes you sweat the most.',
   array['zumba', 'stretching'], 'ML', '#fbbf24', 5),

  ('cch_julieta', 'julieta-barrios', 'Julieta Barrios',
   'Funcional y HIIT', 'Functional & HIIT',
   'Profesora de educación física y atleta de crossfit. Especialista en entrenamiento para principiantes y embarazadas.',
   'Physical education teacher and crossfit athlete. Specialist in training for beginners and pregnant members.',
   array['funcional', 'hiit', 'cross-training'], 'JB', '#f472b6', 6)
on conflict (id) do update set
  name = excluded.name,
  role_es = excluded.role_es,
  role_en = excluded.role_en,
  bio_es = excluded.bio_es,
  bio_en = excluded.bio_en,
  specialties = excluded.specialties,
  initials = excluded.initials,
  color = excluded.color,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  PLANES  (cambiá los precios a los tuyos)
-- ------------------------------------------------------------

insert into public.plans
  (id, slug, name_es, name_en, tagline_es, tagline_en, price, period, features_es, features_en, is_popular, sort_order)
values
  ('pln_basico', 'basico', 'Básico', 'Basic',
   'Para arrancar y armar el hábito', 'To get started and build the habit',
   25, 'month',
   array['3 clases dirigidas por semana', 'Acceso a la sala de musculación', 'Evaluación física inicial', 'Sin matrícula ni contrato'],
   array['3 instructor-led classes per week', 'Access to the weights room', 'Initial fitness assessment', 'No joining fee, no contract'],
   false, 1),

  ('pln_full', 'full', 'Full', 'Full',
   'Clases ilimitadas y musculación 24/7', 'Unlimited classes and 24/7 weights room',
   39, 'month',
   array['Clases dirigidas ilimitadas', 'Acceso 24/7 con llave digital', 'Plan de entrenamiento personalizado', 'Seguimiento mensual con tu profe', '1 invitado por mes, sin cargo'],
   array['Unlimited instructor-led classes', '24/7 access with digital key', 'Personalised training plan', 'Monthly check-in with your coach', '1 free guest pass per month'],
   true, 2),

  ('pln_duo', 'duo', 'Dúo', 'Duo',
   'Dos personas, un precio, mismos beneficios', 'Two people, one price, same benefits',
   65, 'month',
   array['Todo lo del plan Full para 2 personas', 'Ideal para parejas, hermanos o amigos', 'Congelá el plan hasta 30 días por año', 'Vestuarios y lockers individuales'],
   array['Everything in the Full plan for 2 people', 'Ideal for couples, siblings or friends', 'Freeze your plan up to 30 days a year', 'Locker rooms and individual lockers'],
   false, 3),

  ('pln_personal', 'personal-trainer', 'Personal Trainer', 'Personal Trainer',
   'Entrenamiento 1 a 1 con profe exclusivo', 'One-on-one training with a dedicated coach',
   99, 'month',
   array['8 sesiones personales al mes', 'Plan y dieta derivada a nutricionista', 'Clases grupales incluidas', 'Mediciones y control de progreso cada 2 semanas'],
   array['8 personal sessions per month', 'Training plan plus nutritionist referral', 'Group classes included', 'Measurements and progress tracking every 2 weeks'],
   false, 4)
on conflict (id) do update set
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  tagline_es = excluded.tagline_es,
  tagline_en = excluded.tagline_en,
  price = excluded.price,
  features_es = excluded.features_es,
  features_en = excluded.features_en,
  is_popular = excluded.is_popular,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  CLASES DE LAS PRÓXIMAS 4 SEMANAS
-- ------------------------------------------------------------
--  generate_week_sessions(lunes) crea la grilla de una semana.
--  Acá la llamamos para las próximas 4 semanas (la fecha se
--  calcula tomando el lunes de esta semana).

select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1));
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 7);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 14);
select public.generate_week_sessions(current_date - (extract(isodow from current_date)::int - 1) + 21);


-- ------------------------------------------------------------
--  CONSULTAS DE EJEMPLO (borralas cuando estés en producción)
-- ------------------------------------------------------------

--  (Si volvés a correr este archivo, no se duplican.)
insert into public.messages (name, email, phone, subject, message, locale, is_read)
select * from (values
  ('Andrea Solís', 'andrea.solis@example.com', '+505 8712 4490', 'trial',
   '¡Buenas! Quiero aprovechar la clase de prueba gratis. ¿Puedo ir un martes por la tarde a probar funcional?',
   'es', false),
  ('Kevin Ramírez', 'kevin.ramirez@example.com', null, 'plans',
   'Consulto por el plan Full: ¿incluye el acceso 24/7 desde el primer mes?',
   'es', false)
) as nueva(name, email, phone, subject, message, locale, is_read)
where not exists (
  select 1 from public.messages m where m.email = nueva.email
);


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
