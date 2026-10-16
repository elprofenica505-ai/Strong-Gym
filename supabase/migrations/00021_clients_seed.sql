-- OPCIONAL. Datos FICTICIOS para probar FASE 2. No crea cuentas de login.
-- No se aplica automáticamente a la base existente ni asigna promociones.
-- Se pueden quitar desde SQL: DELETE FROM public.gym_clients WHERE is_demo;
-- No borrar si registraste cobros: la FK a transactions lo impedirá.
begin;
insert into public.gym_clients(id,full_name,phone,category,joined_on,is_demo)
values
 ('dc000000-0000-4000-8000-000000000001','Ejemplo · Andrea López',null,'client',(now() at time zone 'America/Managua')::date-60,true),
 ('dc000000-0000-4000-8000-000000000002','Ejemplo · Marcos Ruiz',null,'friend',(now() at time zone 'America/Managua')::date-60,true),
 ('dc000000-0000-4000-8000-000000000003','Ejemplo · Lucía Hernández',null,'family',(now() at time zone 'America/Managua')::date-60,true),
 ('dc000000-0000-4000-8000-000000000004','Ejemplo · Ernesto Díaz',null,'client',(now() at time zone 'America/Managua')::date-60,true),
 ('dc000000-0000-4000-8000-000000000005','Ejemplo · Paula Flores',null,'friend',(now() at time zone 'America/Managua')::date-60,true),
 ('dc000000-0000-4000-8000-000000000006','Ejemplo · Diego Castro',null,'client',(now() at time zone 'America/Managua')::date-4,true)
on conflict(id) do nothing;
insert into public.client_cards(client_id) select id from public.gym_clients where is_demo on conflict(client_id) do nothing;
insert into public.client_visits(client_id,visited_at,local_day,source)
select c.id, ((c.joined_on + n)::text || ' 17:00 America/Managua')::timestamptz, c.joined_on+n,'manual'
from public.gym_clients c cross join generate_series(31,59) n
where c.is_demo and c.id::text like 'dc000000-%' and
  ((c.category='family' and n%2=0) or (c.category='friend' and n%7=0) or (c.category='client' and n=50))
  and c.joined_on+n <= (now() at time zone 'America/Managua')::date
on conflict(client_id,local_day) do nothing;
commit;
