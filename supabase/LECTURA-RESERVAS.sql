-- Reparación de lectura: reservas persistidas ocultas por RLS sin políticas.
-- Requiere FASE2. No modifica reservas, funciones de escritura ni otros permisos.
begin;
alter table public.bookings enable row level security;
drop policy if exists bookings_read_own_or_staff_v1 on public.bookings;
create policy bookings_read_own_or_staff_v1
  on public.bookings
  for select
  to authenticated
  using (user_id = auth.uid() or public.crm_is_staff());
grant select on public.bookings to authenticated;
notify pgrst, 'reload schema';
commit;
