-- 00038 CAJA VE EL RESUMEN DE DEUDAS (corrige 00034 para la página de Caja).
-- ESTADO: BORRADOR. NO APLICAR sin autorización expresa del dueño.
-- Motivo: 00034 dejó finance_debt_report sólo para administrador, pero la página de Caja
-- (getCashSummary) lo usa para el resumen. Caja recibía "FIN_DEBT_REPORT_P0001" (AUTH) y no veía nada.
-- Qué cambia: sólo el permiso de finance_debt_report. Acepta administrador o caja con aal2 (crm_is_staff),
-- igual que finance_read. Entrenador, cliente y visitante siguen sin acceso.
-- Requiere 00034 aplicada.

begin;
set local lock_timeout = '5s';

create or replace function public.finance_debt_report(p_section text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_section not in ('summary', 'receivables') or p_section is null then raise exception 'INVALID_FINANCE_SECTION'; end if;
  return public.finance_read(p_section, 30);
end $$;
revoke all on function public.finance_debt_report(text) from public, anon, authenticated;
grant execute on function public.finance_debt_report(text) to authenticated;

commit;
