-- 00052 · La altura se guarda una sola vez en la ficha del cliente
--
-- Antes, cada medición traía su propia altura. Ahora:
--  1. gym_clients.height_cm guarda la altura una sola vez.
--  2. Un disparador en body_measurements aplica la regla en todas las rutas de escritura
--     (medición, calculadora y metas), sin cambiar esas funciones:
--     - Si la ficha no tiene altura, la primera medición con altura la guarda.
--     - Si la ficha ya tiene altura, una medición sin altura hereda la de la ficha.
--     - Si una medición trae una altura distinta, se rechaza con un mensaje claro.
--  3. Relleno inicial: la ficha toma la altura de la medición más reciente de cada cliente.
--     Las mediciones anteriores no se modifican (son de solo lectura).
--
-- Reversión (copiar y pegar si hiciera falta):
--   drop trigger if exists body_measurements_altura_ficha on public.body_measurements;
--   drop function if exists public.body_measurements_altura_ficha();
--   alter table public.gym_clients drop column if exists height_cm;

begin;

alter table public.gym_clients
  add column if not exists height_cm numeric(5,1)
  check (height_cm is null or (height_cm > 0 and height_cm <= 250));

update public.gym_clients c
   set height_cm = m.h
  from (
    select distinct on (client_id) client_id, height_cm as h
      from public.body_measurements
     where height_cm is not null
     order by client_id, measured_on desc, created_at desc
  ) m
 where m.client_id = c.id
   and c.height_cm is null;

create or replace function public.body_measurements_altura_ficha()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ficha numeric;
begin
  select height_cm into v_ficha from public.gym_clients where id = new.client_id for update;

  if new.height_cm is null then
    new.height_cm := v_ficha;
    return new;
  end if;

  if v_ficha is null then
    update public.gym_clients set height_cm = new.height_cm where id = new.client_id;
  elsif v_ficha <> new.height_cm then
    raise exception 'ALTURA_DISTINTA: la ficha ya tiene una altura de % cm. Para corregirla, consultá al administrador.', v_ficha;
  end if;
  return new;
end $$;

drop trigger if exists body_measurements_altura_ficha on public.body_measurements;
create trigger body_measurements_altura_ficha
  before insert on public.body_measurements
  for each row execute function public.body_measurements_altura_ficha();

commit;
