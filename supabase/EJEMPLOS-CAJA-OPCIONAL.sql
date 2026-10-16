-- OPCIONAL: revisar antes de ejecutar en el SQL Editor como propietario.
-- Sólo para bank_accounts_split + CRM + 00022 + 00023.
-- Crea 2 cuentas EJEMPLO con saldo inicial 0 y 1 cliente EJEMPLO sin login/plan.
-- NO crea movimientos, pagos, deuda, crédito, visitas, usuarios ni perfiles.
-- NO modifica registros existentes ni restablece saldos al repetirlo.
begin;
do $$
declare a record;
  v_client uuid := 'e0000000-0000-4000-8000-000000000023';
begin
  if public.crm_finance_layout() <> 'bank_accounts_split' then
    raise exception 'FINANCE_SCHEMA_UNSUPPORTED';
  end if;
  lock table public.bank_accounts, public.gym_clients in share row exclusive mode;
  for a in select * from (values
    ('ejemplo-caja-nio-00023','EJEMPLO - Caja NIO','NIO'),
    ('ejemplo-caja-usd-00023','EJEMPLO - Caja USD','USD')
  ) as x(id,name,currency) loop
    if exists(select 1 from public.bank_accounts b where
      (b.id=a.id and (b.name is distinct from a.name or b.currency is distinct from a.currency or b.account_type <> 'caja_fuerte'))
      or (b.name=a.name and b.id<>a.id)) then
      raise exception 'EJEMPLO_ACCOUNT_CONFLICT';
    end if;
    insert into public.bank_accounts(id,name,account_type,currency,balance,is_active,display_order)
      values(a.id,a.name,'caja_fuerte',a.currency,0,true,900)
      on conflict(id) do nothing;
  end loop;
  if exists(select 1 from public.gym_clients c where
    (c.id=v_client and (c.full_name <> 'EJEMPLO - Cliente de demostración' or not c.is_demo or c.profile_id is not null))
    or (c.full_name='EJEMPLO - Cliente de demostración' and c.id<>v_client)) then
    raise exception 'EJEMPLO_CLIENT_CONFLICT';
  end if;
  insert into public.gym_clients(id,full_name,is_demo,notes)
    values(v_client,'EJEMPLO - Cliente de demostración',true,'Registro ficticio opcional para demostración. Sin cobros ni plan asignado.')
    on conflict(id) do nothing;
end $$;
commit;

-- Comprobación sólo lectura: deben aparecer dos cuentas y un cliente nuevos.
select id,name,currency,balance,is_active from public.bank_accounts
  where id in ('ejemplo-caja-nio-00023','ejemplo-caja-usd-00023') order by id;
select id,client_number,full_name,is_demo,profile_id,plan_id from public.gym_clients
  where id='e0000000-0000-4000-8000-000000000023';
