-- 00093 · Las fichas que ya existen muestran fotos reales (EX-04)
--
-- Qué pidió el dueño: las fichas se veían como dibujos planos y no le
-- gustaban. El segundo catálogo (dominio público, Unlicense) trae **dos fotos
-- reales por movimiento**: la posición inicial y la final, que es justo lo que
-- la animación de EX-03 alterna cada 900 ms.
--
-- Su condición fue «solo si están todos». No están todos: de las 701 fichas
-- del catálogo viejo, 185 tienen equivalente exacto en el segundo catálogo.
-- Por eso esto es una **sustitución parcial**, ficha por ficha:
--   · no se crea ninguna ficha nueva ni se duplica nada;
--   · cada ficha conserva su `id`, su nombre, sus pasos y sus consejos;
--   · sólo cambian `image_start` y `image_peak` (la portada `image_main` se
--     deja como estaba: es el respaldo cuando no hay dos fotos).
--
-- Cómo se eligió cada par: nombre normalizado idéntico (sin mayúsculas,
-- acentos, plurales ni palabras de relleno) y equipo compatible, o un puñado
-- de sinónimos revisados a mano uno por uno. Nada de parecido automático: un
-- parecido mal resuelto pone la foto de otro ejercicio, que es peor que el
-- dibujo. Quedan fuera los que no tienen dos fotos y `Air_Bike`, que en el
-- origen es una bicicleta en el piso, no la de sala.
--
-- Qué crea:
--   · `exercise_photo_map` — el mapa curado (id viejo → carpeta de fotos) y,
--     en las mismas filas, las rutas anteriores: la copia para volver atrás.
--   · `exercise_photo_keep()` — un disparador que vuelve a poner las fotos si
--     alguien recarga el catálogo viejo (`admin_import_exercises`). Sin esto,
--     una recarga posterior borraría las fotos en silencio.
--
-- Reversible, sin borrar datos:
--   update public.exercise_photo_map set applied = false;
--   update public.exercises e
--      set image_start = m.old_image_start,
--          image_peak  = m.old_image_peak,
--          image_main  = m.old_image_main,
--          updated_at  = now()
--     from public.exercise_photo_map m
--    where m.exercise_id = e.id;
-- (Con `applied = false` el disparador deja de imponer las fotos.)

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.exercises') is null then
    raise exception 'EXERCISES_PREREQUISITE_MISSING';
  end if;
end $$;

-- 1) El mapa y la copia de las rutas anteriores, en una sola tabla.
create table if not exists public.exercise_photo_map (
  exercise_id     text primary key references public.exercises(id) on delete cascade,
  folder          text not null check (folder ~ '^[A-Za-z0-9][A-Za-z0-9 _().,''&-]{0,90}$'),
  origin_name     text,
  applied         boolean not null default true,
  old_image_start text,
  old_image_peak  text,
  old_image_main  text,
  saved_at        timestamptz not null default now()
);

comment on table public.exercise_photo_map is
  'Ficha del catálogo viejo -> carpeta de fotos del segundo catálogo (EX-04). Guarda las rutas anteriores para revertir. No se lee desde la web.';
comment on column public.exercise_photo_map.applied is
  'En true, el disparador impone las fotos (también después de recargar el catálogo). En false se puede revertir.';

alter table public.exercise_photo_map enable row level security;
revoke all on public.exercise_photo_map from anon, authenticated;

-- 2) El mapa curado: 185 fichas equivalentes, revisadas una por una.
-- La copia de las rutas anteriores se toma aquí, una sola vez: si se vuelve a
-- aplicar la migración, `on conflict do nothing` no la pisa.
insert into public.exercise_photo_map
  (exercise_id, folder, origin_name, old_image_start, old_image_peak, old_image_main)
select p.exercise_id, p.folder, p.origin_name,
       e.image_start, e.image_peak, e.image_main
  from (values
  ('arnold-press', 'Arnold_Dumbbell_Press', 'Arnold Dumbbell Press'),
  ('assisted-dips', 'Dip_Machine', 'Dip Machine'),
  ('band-pull-apart', 'Band_Pull_Apart', 'Band Pull Apart'),
  ('barbell-ab-rollout', 'Barbell_Ab_Rollout', 'Barbell Ab Rollout'),
  ('barbell-calf-raise', 'Standing_Barbell_Calf_Raise', 'Standing Barbell Calf Raise'),
  ('barbell-curl', 'Barbell_Curl', 'Barbell Curl'),
  ('barbell-glute-bridge', 'Barbell_Glute_Bridge', 'Barbell Glute Bridge'),
  ('barbell-lunge', 'Barbell_Lunge', 'Barbell Lunge'),
  ('barbell-overhead-extension', 'Standing_Overhead_Barbell_Triceps_Extension', 'Standing Overhead Barbell Triceps Extension'),
  ('barbell-rear-delt-row', 'Barbell_Rear_Delt_Row', 'Barbell Rear Delt Row'),
  ('barbell-row', 'Bent_Over_Barbell_Row', 'Bent Over Barbell Row'),
  ('barbell-wrist-curl', 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench', 'Palms-Up Barbell Wrist Curl Over A Bench'),
  ('behind-the-back-barbell-shrug', 'Barbell_Shrug_Behind_The_Back', 'Barbell Shrug Behind The Back'),
  ('bench-dips', 'Bench_Dips', 'Bench Dips'),
  ('bench-press', 'Barbell_Bench_Press_-_Medium_Grip', 'Barbell Bench Press - Medium Grip'),
  ('bent-arm-barbell-pullover', 'Bent-Arm_Barbell_Pullover', 'Bent-Arm Barbell Pullover'),
  ('bent-over-db-row', 'Bent_Over_Two-Dumbbell_Row', 'Bent Over Two-Dumbbell Row'),
  ('bicep-curl', 'Dumbbell_Bicep_Curl', 'Dumbbell Bicep Curl'),
  ('bodyweight-squat', 'Bodyweight_Squat', 'Bodyweight Squat'),
  ('box-squat', 'Box_Squat', 'Box Squat'),
  ('cable-chest-press', 'Cable_Chest_Press', 'Cable Chest Press'),
  ('cable-crunch', 'Cable_Crunch', 'Cable Crunch'),
  ('cable-curl', 'Standing_Biceps_Cable_Curl', 'Standing Biceps Cable Curl'),
  ('cable-external-rotation', 'External_Rotation_with_Cable', 'External Rotation with Cable'),
  ('cable-fly', 'Cable_Crossover', 'Cable Crossover'),
  ('cable-front-raise', 'Front_Cable_Raise', 'Front Cable Raise'),
  ('cable-hammer-curl', 'Cable_Hammer_Curls_-_Rope_Attachment', 'Cable Hammer Curls - Rope Attachment'),
  ('cable-overhead-tricep-extension', 'Cable_Rope_Overhead_Triceps_Extension', 'Cable Rope Overhead Triceps Extension'),
  ('cable-pallof-press', 'Pallof_Press', 'Pallof Press'),
  ('cable-pull-through', 'Pull_Through', 'Pull Through'),
  ('cable-upright-row', 'Upright_Cable_Row', 'Upright Cable Row'),
  ('cable-wrist-curl', 'Cable_Wrist_Curl', 'Cable Wrist Curl'),
  ('cat-stretch', 'Cat_Stretch', 'Cat Stretch'),
  ('childs-pose', 'Childs_Pose', 'Child''s Pose'),
  ('clean', 'Clean', 'Clean'),
  ('clean-and-jerk', 'Clean_and_Jerk', 'Clean and Jerk'),
  ('close-grip-barbell-curl', 'Close-Grip_Standing_Barbell_Curl', 'Close-Grip Standing Barbell Curl'),
  ('close-grip-bench-press', 'Close-Grip_Barbell_Bench_Press', 'Close-Grip Barbell Bench Press'),
  ('close-grip-db-bench-press', 'Close-Grip_Dumbbell_Press', 'Close-Grip Dumbbell Press'),
  ('close-grip-ez-bar-bench-press', 'Close-Grip_EZ-Bar_Press', 'Close-Grip EZ-Bar Press'),
  ('close-grip-ez-bar-curl', 'Close-Grip_EZ_Bar_Curl', 'Close-Grip EZ Bar Curl'),
  ('close-grip-lat-pulldown', 'Close-Grip_Front_Lat_Pulldown', 'Close-Grip Front Lat Pulldown'),
  ('close-stance-leg-press', 'Narrow_Stance_Leg_Press', 'Narrow Stance Leg Press'),
  ('cocoons', 'Cocoons', 'Cocoons'),
  ('concentration-curl', 'Concentration_Curls', 'Concentration Curls'),
  ('cross-body-crunch', 'Cross-Body_Crunch', 'Cross-Body Crunch'),
  ('cross-body-hammer-curl', 'Cross_Body_Hammer_Curl', 'Cross Body Hammer Curl'),
  ('crunches', 'Crunches', 'Crunches'),
  ('db-bench-press', 'Dumbbell_Bench_Press', 'Dumbbell Bench Press'),
  ('db-lunge', 'Dumbbell_Lunges', 'Dumbbell Lunges'),
  ('db-preacher-curl', 'Two-Arm_Dumbbell_Preacher_Curl', 'Two-Arm Dumbbell Preacher Curl'),
  ('db-pullover', 'Straight-Arm_Dumbbell_Pullover', 'Straight-Arm Dumbbell Pullover'),
  ('db-reverse-curl', 'Standing_Dumbbell_Reverse_Curl', 'Standing Dumbbell Reverse Curl'),
  ('db-shrug', 'Dumbbell_Shrug', 'Dumbbell Shrug'),
  ('db-squat', 'Dumbbell_Squat', 'Dumbbell Squat'),
  ('dead-bug', 'Dead_Bug', 'Dead Bug'),
  ('deadlift', 'Barbell_Deadlift', 'Barbell Deadlift'),
  ('decline-bench-press', 'Decline_Dumbbell_Bench_Press', 'Decline Dumbbell Bench Press'),
  ('decline-bench-press-barbell', 'Decline_Barbell_Bench_Press', 'Decline Barbell Bench Press'),
  ('decline-crunch', 'Decline_Crunch', 'Decline Crunch'),
  ('decline-push-up', 'Decline_Push-Up', 'Decline Push-Up'),
  ('deficit-deadlift', 'Deficit_Deadlift', 'Deficit Deadlift'),
  ('donkey-calf-raise', 'Donkey_Calf_Raises', 'Donkey Calf Raises'),
  ('double-kettlebell-jerk', 'Double_Kettlebell_Jerk', 'Double Kettlebell Jerk'),
  ('double-kettlebell-push-press', 'Double_Kettlebell_Push_Press', 'Double Kettlebell Push Press'),
  ('drag-curl', 'Drag_Curl', 'Drag Curl'),
  ('dumbbell-calf-raise', 'Calf_Raise_On_A_Dumbbell', 'Calf Raise On A Dumbbell'),
  ('dumbbell-floor-press', 'Dumbbell_Floor_Press', 'Dumbbell Floor Press'),
  ('dumbbell-front-raise', 'Front_Dumbbell_Raise', 'Front Dumbbell Raise'),
  ('dumbbell-shoulder-press', 'Dumbbell_Shoulder_Press', 'Dumbbell Shoulder Press'),
  ('dumbbell-side-bend', 'Dumbbell_Side_Bend', 'Dumbbell Side Bend'),
  ('dumbbell-split-squat', 'Split_Squat_with_Dumbbells', 'Split Squat with Dumbbells'),
  ('dumbbell-tricep-extension', 'Dumbbell_Tricep_Extension_-Pronated_Grip', 'Dumbbell Tricep Extension -Pronated Grip'),
  ('dumbbell-upright-row', 'Standing_Dumbbell_Upright_Row', 'Standing Dumbbell Upright Row'),
  ('dumbbell-wrist-curl', 'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench', 'Palms-Up Dumbbell Wrist Curl Over A Bench'),
  ('elliptical-trainer', 'Elliptical_Trainer', 'Elliptical Trainer'),
  ('ez-bar-curl', 'EZ-Bar_Curl', 'EZ-Bar Curl'),
  ('face-pull', 'Face_Pull', 'Face Pull'),
  ('floor-press', 'Floor_Press', 'Floor Press'),
  ('flutter-kicks', 'Flutter_Kicks', 'Flutter Kicks'),
  ('front-squat', 'Front_Barbell_Squat', 'Front Barbell Squat'),
  ('glute-kickback', 'Glute_Kickback', 'Glute Kickback'),
  ('goblet-squat', 'Goblet_Squat', 'Goblet Squat'),
  ('good-morning', 'Good_Morning', 'Good Morning'),
  ('hack-squat', 'Hack_Squat', 'Hack Squat'),
  ('hammer-curl', 'Hammer_Curls', 'Hammer Curls'),
  ('handstand-push-ups', 'Handstand_Push-Ups', 'Handstand Push-Ups'),
  ('hang-clean', 'Hang_Clean', 'Hang Clean'),
  ('hang-snatch', 'Hang_Snatch', 'Hang Snatch'),
  ('hanging-leg-raise', 'Hanging_Leg_Raise', 'Hanging Leg Raise'),
  ('hanging-pike', 'Hanging_Pike', 'Hanging Pike'),
  ('hip-thrust', 'Barbell_Hip_Thrust', 'Barbell Hip Thrust'),
  ('inchworm', 'Inchworm', 'Inchworm'),
  ('incline-bench-press', 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'Barbell Incline Bench Press - Medium Grip'),
  ('incline-db-curl', 'Incline_Dumbbell_Curl', 'Incline Dumbbell Curl'),
  ('incline-db-press', 'Incline_Dumbbell_Press', 'Incline Dumbbell Press'),
  ('incline-hammer-curl', 'Incline_Hammer_Curls', 'Incline Hammer Curls'),
  ('incline-push-ups', 'Incline_Push-Up', 'Incline Push-Up'),
  ('inverted-row', 'Inverted_Row', 'Inverted Row'),
  ('jackknife-sit-up', 'Jackknife_Sit-Up', 'Jackknife Sit-Up'),
  ('kettlebell-pistol-squat', 'Kettlebell_Pistol_Squat', 'Kettlebell Pistol Squat'),
  ('kettlebell-sumo-high-pull', 'Kettlebell_Sumo_High_Pull', 'Kettlebell Sumo High Pull'),
  ('kettlebell-turkish-get-ups', 'Kettlebell_Turkish_Get-Up_Lunge_style', 'Kettlebell Turkish Get-Up (Lunge style)'),
  ('kettlebell-windmills', 'Kettlebell_Windmill', 'Kettlebell Windmill'),
  ('lat-pulldown', 'Wide-Grip_Lat_Pulldown', 'Wide-Grip Lat Pulldown'),
  ('lateral-raise', 'Side_Lateral_Raise', 'Side Lateral Raise'),
  ('leg-curl', 'Lying_Leg_Curls', 'Lying Leg Curls'),
  ('leg-extension', 'Leg_Extensions', 'Leg Extensions'),
  ('leg-press', 'Leg_Press', 'Leg Press'),
  ('lying-tricep-extension', 'Lying_Dumbbell_Tricep_Extension', 'Lying Dumbbell Tricep Extension'),
  ('machine-bicep-curl', 'Machine_Bicep_Curl', 'Machine Bicep Curl'),
  ('machine-preacher-curl', 'Machine_Preacher_Curls', 'Machine Preacher Curls'),
  ('machine-shoulder-press', 'Machine_Shoulder_Military_Press', 'Machine Shoulder (Military) Press'),
  ('machine-triceps-extension', 'Machine_Triceps_Extension', 'Machine Triceps Extension'),
  ('mountain-climbers', 'Mountain_Climbers', 'Mountain Climbers'),
  ('muscle-snatch', 'Muscle_Snatch', 'Muscle Snatch'),
  ('neck-side-stretch', 'Side_Neck_Stretch', 'Side Neck Stretch'),
  ('one-arm-dumbbell-preacher-curl', 'One_Arm_Dumbbell_Preacher_Curl', 'One Arm Dumbbell Preacher Curl'),
  ('one-arm-dumbbell-shoulder-press', 'Dumbbell_One-Arm_Shoulder_Press', 'Dumbbell One-Arm Shoulder Press'),
  ('one-arm-kettlebell-floor-press', 'One-Arm_Kettlebell_Floor_Press', 'One-Arm Kettlebell Floor Press'),
  ('one-arm-kettlebell-push-press', 'One-Arm_Kettlebell_Push_Press', 'One-Arm Kettlebell Push Press'),
  ('one-arm-kettlebell-row', 'One-Arm_Kettlebell_Row', 'One-Arm Kettlebell Row'),
  ('one-arm-kettlebell-swing', 'One-Arm_Kettlebell_Swings', 'One-Arm Kettlebell Swings'),
  ('one-arm-lat-pulldown', 'One_Arm_Lat_Pulldown', 'One Arm Lat Pulldown'),
  ('one-arm-seated-cable-row', 'Seated_One-arm_Cable_Pulley_Rows', 'Seated One-arm Cable Pulley Rows'),
  ('overhead-squat', 'Overhead_Squat', 'Overhead Squat'),
  ('plank', 'Plank', 'Plank'),
  ('plate-pinch', 'Plate_Pinch', 'Plate Pinch'),
  ('plyo-push-up', 'Plyo_Push-up', 'Plyo Push-up'),
  ('preacher-curl', 'Preacher_Curl', 'Preacher Curl'),
  ('preacher-hammer-curl', 'Preacher_Hammer_Dumbbell_Curl', 'Preacher Hammer Dumbbell Curl'),
  ('push-press', 'Push_Press', 'Push Press'),
  ('rack-pull', 'Rack_Pulls', 'Rack Pulls'),
  ('rear-delt-fly', 'Reverse_Flyes', 'Reverse Flyes'),
  ('renegade-row', 'Alternating_Renegade_Row', 'Alternating Renegade Row'),
  ('reverse-curl', 'Reverse_Barbell_Curl', 'Reverse Barbell Curl'),
  ('reverse-grip-bent-over-row', 'Reverse_Grip_Bent-Over_Rows', 'Reverse Grip Bent-Over Rows'),
  ('ring-dips', 'Ring_Dips', 'Ring Dips'),
  ('romanian-deadlift', 'Romanian_Deadlift', 'Romanian Deadlift'),
  ('rope-climb', 'Rope_Climb', 'Rope Climb'),
  ('russian-twist', 'Russian_Twist', 'Russian Twist'),
  ('scissor-kicks', 'Scissor_Kick', 'Scissor Kick'),
  ('seated-barbell-overhead-press', 'Seated_Barbell_Military_Press', 'Seated Barbell Military Press'),
  ('seated-cable-row', 'Seated_Cable_Rows', 'Seated Cable Rows'),
  ('seated-calf-raise', 'Seated_Calf_Raise', 'Seated Calf Raise'),
  ('seated-db-press', 'Seated_Dumbbell_Press', 'Seated Dumbbell Press'),
  ('seated-dumbbell-curl', 'Seated_Dumbbell_Curl', 'Seated Dumbbell Curl'),
  ('seated-dumbbell-lateral-raise', 'Seated_Side_Lateral_Raise', 'Seated Side Lateral Raise'),
  ('seated-leg-curl', 'Seated_Leg_Curl', 'Seated Leg Curl'),
  ('shrug', 'Barbell_Shrug', 'Barbell Shrug'),
  ('single-arm-db-row', 'One-Arm_Dumbbell_Row', 'One-Arm Dumbbell Row'),
  ('single-arm-dumbbell-bench-press', 'One_Arm_Dumbbell_Bench_Press', 'One Arm Dumbbell Bench Press'),
  ('single-leg-extension', 'Single-Leg_Leg_Extension', 'Single-Leg Leg Extension'),
  ('single-leg-glute-bridge', 'Single_Leg_Glute_Bridge', 'Single Leg Glute Bridge'),
  ('skull-crusher', 'EZ-Bar_Skullcrusher', 'EZ-Bar Skullcrusher'),
  ('sled-push', 'Sled_Push', 'Sled Push'),
  ('sled-row', 'Sled_Row', 'Sled Row'),
  ('smith-machine-bench-press', 'Smith_Machine_Bench_Press', 'Smith Machine Bench Press'),
  ('smith-machine-bent-over-row', 'Smith_Machine_Bent_Over_Row', 'Smith Machine Bent Over Row'),
  ('smith-machine-calf-raise', 'Smith_Machine_Calf_Raise', 'Smith Machine Calf Raise'),
  ('smith-machine-decline-bench-press', 'Smith_Machine_Decline_Press', 'Smith Machine Decline Press'),
  ('smith-machine-incline-bench-press', 'Smith_Machine_Incline_Bench_Press', 'Smith Machine Incline Bench Press'),
  ('smith-machine-shoulder-press', 'Smith_Machine_Overhead_Shoulder_Press', 'Smith Machine Overhead Shoulder Press'),
  ('smith-machine-squat', 'Smith_Machine_Squat', 'Smith Machine Squat'),
  ('smith-machine-upright-row', 'Smith_Machine_Upright_Row', 'Smith Machine Upright Row'),
  ('snatch', 'Snatch', 'Snatch'),
  ('split-jerk', 'Split_Jerk', 'Split Jerk'),
  ('split-squat', 'Split_Squats', 'Split Squats'),
  ('squat', 'Barbell_Squat', 'Barbell Squat'),
  ('standing-calf-raise', 'Standing_Calf_Raises', 'Standing Calf Raises'),
  ('straight-arm-pulldown', 'Straight-Arm_Pulldown', 'Straight-Arm Pulldown'),
  ('sumo-deadlift', 'Sumo_Deadlift', 'Sumo Deadlift'),
  ('superman', 'Superman', 'Superman'),
  ('svend-press', 'Svend_Press', 'Svend Press'),
  ('t-bar-row', 'T-Bar_Row_with_Handle', 'T-Bar Row with Handle'),
  ('treadmill-running', 'Running_Treadmill', 'Running, Treadmill'),
  ('tricep-kickback', 'Tricep_Dumbbell_Kickback', 'Tricep Dumbbell Kickback'),
  ('tricep-pushdown', 'Triceps_Pushdown', 'Triceps Pushdown'),
  ('upright-row', 'Upright_Barbell_Row', 'Upright Barbell Row'),
  ('v-bar-tricep-pushdown', 'Triceps_Pushdown_-_V-Bar_Attachment', 'Triceps Pushdown - V-Bar Attachment'),
  ('wide-grip-bench-press', 'Wide-Grip_Barbell_Bench_Press', 'Wide-Grip Barbell Bench Press'),
  ('worlds-greatest-stretch', 'Worlds_Greatest_Stretch', 'World''s Greatest Stretch'),
  ('wrist-roller', 'Wrist_Roller', 'Wrist Roller'),
  ('zercher-squat', 'Zercher_Squats', 'Zercher Squats'),
  ('zottman-curl', 'Zottman_Curl', 'Zottman Curl')
  ) as p(exercise_id, folder, origin_name)
  join public.exercises e on e.id = p.exercise_id
on conflict (exercise_id) do nothing;

-- 3) Las fichas mapeadas pasan a mostrar las dos fotos del movimiento.
update public.exercises e
   set image_start = m.folder || '/0.jpg',
       image_peak  = m.folder || '/1.jpg',
       updated_at  = now()
  from public.exercise_photo_map m
 where m.exercise_id = e.id
   and m.applied
   and (e.image_start is distinct from m.folder || '/0.jpg'
     or e.image_peak  is distinct from m.folder || '/1.jpg');

-- 4) Recargar el catálogo viejo no puede borrar lo que ya se decidió.
create or replace function public.exercise_photo_keep()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_folder text;
begin
  select m.folder into v_folder
    from public.exercise_photo_map m
   where m.exercise_id = new.id
     and m.applied;

  if v_folder is not null then
    new.image_start := v_folder || '/0.jpg';
    new.image_peak  := v_folder || '/1.jpg';
  end if;

  return new;
end;
$$;

comment on function public.exercise_photo_keep() is
  'Mantiene las fotos de EX-04 cuando se recarga el catálogo viejo. Revertir: applied = false en exercise_photo_map.';

drop trigger if exists exercises_keep_photo on public.exercises;
create trigger exercises_keep_photo
  before insert or update on public.exercises
  for each row execute function public.exercise_photo_keep();

commit;
