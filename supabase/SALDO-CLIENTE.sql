-- Lectura financiera de la ficha: no crea saldos ni modifica movimientos.
-- Requiere FASE2/compatibilidad CRM ya instalada. Ejecutar sólo este archivo.
begin;
create or replace function public.crm_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_client public.gym_clients; v_layout text; v_balance numeric;
  v_balances jsonb; v_state text; v_collections jsonb; v_payments jsonb;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  select * into v_client from public.gym_clients where id=p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_layout := public.crm_finance_layout();
  v_state := case when v_layout='unsupported' then 'unsupported'
    when v_client.profile_id is null then 'unlinked' else 'missing' end;
  if v_client.profile_id is not null then
    if v_layout='repository' then
      select balance_nio into v_balance from public.member_balances where member_id=v_client.profile_id;
      if found then v_state := 'ready'; end if;
    elsif v_layout='bank_accounts_split' then
      select jsonb_build_object('credit_nio',credit_nio,'credit_usd',credit_usd,'debt_nio',debt_nio,'debt_usd',debt_usd)
        into v_balances from public.member_balances where member_id=v_client.profile_id;
      if found then v_state := 'ready'; end if;
    end if;
  end if;
  if v_layout in ('repository','bank_accounts_split') then
    -- Sólo ingresos: el vínculo explícito de ficha prevalece sobre member_id legado.
    -- to_jsonb permite leer direction/type sin referenciar columnas inexistentes.
    with income as (
      select t.* from public.transactions t
      where (t.client_id=p_id or (t.client_id is null and v_client.profile_id is not null and t.member_id=v_client.profile_id))
        and (case when v_layout='repository' then to_jsonb(t)->>'direction' else to_jsonb(t)->>'type' end)='income'
    )
    select jsonb_build_object(
      'count_nio',count(*) filter(where status::text='completed' and currency::text='NIO'),
      'amount_nio',coalesce(sum(amount) filter(where status::text='completed' and currency::text='NIO'),0),
      'count_usd',count(*) filter(where status::text='completed' and currency::text='USD'),
      'amount_usd',coalesce(sum(amount) filter(where status::text='completed' and currency::text='USD'),0))
    into v_collections from income;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at desc,t.id desc),'[]'::jsonb)
    into v_payments from (
      select id,occurred_at,concept,amount,currency,status from public.transactions t
      where (t.client_id=p_id or (t.client_id is null and v_client.profile_id is not null and t.member_id=v_client.profile_id))
        and (case when v_layout='repository' then to_jsonb(t)->>'direction' else to_jsonb(t)->>'type' end)='income'
      order by occurred_at desc,id desc limit 40
    ) t;
  end if;
  return jsonb_build_object('client',to_jsonb(v_client),'card',public.crm_get_card(p_id),
    'visits',coalesce((select jsonb_agg(to_jsonb(v)) from (select * from public.client_visits where client_id=p_id order by visited_at desc limit 60)v),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.client_events where client_id=p_id order by created_at desc limit 40)e),'[]'::jsonb),
    'payments',coalesce(v_payments,'[]'::jsonb),'balance',v_balance,'balances',v_balances,'finance_layout',v_layout,
    'finance',jsonb_build_object('version',1,'client_id',p_id,'profile_id',v_client.profile_id,
      'layout',v_layout,'balance_status',v_state,'balance_nio',v_balance,'balances',v_balances,
      'collections',v_collections));
end $$;
revoke all on function public.crm_detail(uuid) from public, anon, authenticated;
grant execute on function public.crm_detail(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
