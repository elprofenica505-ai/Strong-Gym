-- 00094 · Las tres fichas que sí tenían fotos y se quedaron sin movimiento (EX-04b)
--
-- Qué pasó: al abrir la biblioteca en el teléfono el dueño vio que algunas
-- fichas se movían y otras no. De las 467 visibles, **32 no se mueven** porque
-- el catálogo de dibujos (RepDB) publicó **una sola imagen** para ellas: son
-- posiciones que se mantienen (planchas, sostenes, L-sit, levers), paseos con
-- peso y máquinas de cardio.
--
-- De esas 32, sólo **tres** tienen equivalente con dos fotos en el segundo
-- catálogo y equivalen al mismo movimiento:
--   · Caminata en cinta inclinada → `Walking_Treadmill` (cinta caminando).
--   · Escaladora de escaleras    → `Stairmaster` (escaladora de sala).
--   · Caminata del granjero con mancuernas → `Farmers_Walk` (mancuernas).
--
-- Las otras 29 se quedan como están, a propósito: o son posiciones que no se
-- mueven (no hay movimiento que mostrar), o el segundo catálogo sólo tiene un
-- aparato parecido pero **distinto** (una bicicleta reclinada no es la
-- bicicleta fija de la sala, y su «Air Bike» es un abdominal en el piso, no la
-- de aire). Poner la foto de otro aparato sería peor que el dibujo quieto.
--
-- Usa la misma tabla y el mismo disparador de la 00093: no crea nada nuevo y
-- guarda las rutas anteriores para poder revertir con
--   update public.exercise_photo_map set applied = false;  (+ restaurar old_*)

begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regclass('public.exercise_photo_map') is null then
    raise exception 'EXERCISES_PREREQUISITE_MISSING';
  end if;
end $$;

insert into public.exercise_photo_map
  (exercise_id, folder, origin_name, old_image_start, old_image_peak, old_image_main)
select p.exercise_id, p.folder, p.origin_name,
       e.image_start, e.image_peak, e.image_main
  from (values
    ('dumbbell-farmers-walk',   'Farmers_Walk',      'Farmer''s Walk'),
    ('incline-treadmill-walk',  'Walking_Treadmill', 'Walking, Treadmill'),
    ('stair-climber',           'Stairmaster',       'Stairmaster')
  ) as p(exercise_id, folder, origin_name)
  join public.exercises e on e.id = p.exercise_id
on conflict (exercise_id) do nothing;

-- Las tres pasan a mostrar sus dos fotos (el disparador de la 00093 las
-- mantiene aunque se recargue el catálogo viejo).
update public.exercises e
   set image_start = m.folder || '/0.jpg',
       image_peak  = m.folder || '/1.jpg',
       updated_at  = now()
  from public.exercise_photo_map m
 where m.exercise_id = e.id
   and m.applied
   and m.folder in ('Farmers_Walk', 'Walking_Treadmill', 'Stairmaster')
   and (e.image_start is distinct from m.folder || '/0.jpg'
     or e.image_peak  is distinct from m.folder || '/1.jpg');

commit;
