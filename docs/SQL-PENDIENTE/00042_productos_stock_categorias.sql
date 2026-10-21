-- 00042 PRODUCTOS, STOCK, VENTAS Y CATEGORÍA DE CLIENTE. ESTADO: PENDIENTE de aplicar.
-- Requiere 00024 (finance_record_movement), 00039 (progress_can_read_client), 00041 (asistencia).
--
-- Reglas:
-- - Productos y stock: sólo administración y caja (crm_is_staff). Entrenador y cliente no escriben.
-- - Venta: suma en finanzas con finance_record_movement (service_income) y baja el stock en la misma transacción.
--   Requiere cliente (la finanza actual exige cliente en ingresos). Moneda: NIO (precios en córdobas).
-- - Compra de inventario: resta en finanzas con finance_record_movement (expense) y suma stock.
-- - Stock nunca queda negativo. Mismo request_id = misma operación (no duplica dinero ni stock).
-- - Categoría de cliente calculada (no reemplaza gym_clients.category, que se conserva):
--   strong_gym: membresía mensual activa + compra de producto en 90 días.
--   familia: membresía semanal o mensual activa (sin cumplir lo anterior).
--   amigo: sin membresía y 3 o más visitas en 30 días.
--   comun: el resto.

begin;
set local lock_timeout = '5s';

-- Categoría de gasto para compras de inventario para la venta.
do $cat$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='expense_categories' and column_name='slug') then
    insert into public.expense_categories (id, slug, name_es, name_en, icon, sort_order)
    values ('exp_inventario', 'inventario-venta', 'Compra de inventario para venta', 'Inventory for resale', 'Package', 8)
    on conflict (id) do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='expense_categories' and column_name='name') then
    insert into public.expense_categories (id, name)
    values ('exp_inventario', 'Compra de inventario para venta')
    on conflict (id) do nothing;
  end if;
end $cat$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  category text not null check (length(trim(category)) between 2 and 60),
  subcategory text check (subcategory is null or length(trim(subcategory)) between 1 and 60),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  status text not null default 'activo' check (status in ('activo', 'inactivo')),
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  price numeric(12, 2) not null check (price >= 0),
  profit numeric(12, 2) generated always as (price - cost) stored,
  stock_min integer not null default 0 check (stock_min >= 0),
  -- Imagen ya comprimida en el navegador a JPEG de máximo 600 KB (≈820 000 caracteres en base64).
  image_data text check (image_data is null or (image_data like 'data:image/jpeg;base64,%' and length(image_data) <= 820000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  kind text not null check (kind in ('entrada', 'venta', 'ajuste')),
  qty integer not null check (qty <> 0),
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  unit_price numeric(12, 2) check (unit_price is null or unit_price >= 0),
  client_id uuid references public.gym_clients(id) on delete restrict,
  transaction_id uuid references public.transactions(id) on delete restrict,
  request_id uuid unique,
  note text check (note is null or length(note) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint stock_sign check ((kind = 'venta' and qty < 0) or (kind = 'entrada' and qty > 0) or kind = 'ajuste'),
  constraint stock_sale_client check (kind <> 'venta' or client_id is not null)
);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id);
create index if not exists stock_movements_client_idx on public.stock_movements(client_id, created_at desc);

alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.products, public.stock_movements from public, anon, authenticated;
grant select on public.products, public.stock_movements to authenticated;
drop policy if exists products_staff_read on public.products;
create policy products_staff_read on public.products for select to authenticated using (public.crm_is_staff());
drop policy if exists stock_staff_read on public.stock_movements;
create policy stock_staff_read on public.stock_movements for select to authenticated using (public.crm_is_staff());

-- Existencia actual de un producto (suma de movimientos).
create or replace function public.product_stock_of(p_id uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(qty), 0)::integer from public.stock_movements where product_id = p_id;
$$;

-- Crear o editar producto (administración y caja).
create or replace function public.product_save(
  p_id uuid, p_name text, p_category text, p_subcategory text, p_attributes jsonb,
  p_status text, p_cost numeric, p_price numeric, p_stock_min integer, p_image text
) returns uuid language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_id uuid;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 120
    or p_category is null or length(trim(p_category)) not between 2 and 60
    or p_status not in ('activo', 'inactivo')
    or p_cost is null or p_cost < 0 or p_cost > 9999999999.99
    or p_price is null or p_price < 0 or p_price > 9999999999.99
    or p_stock_min is null or p_stock_min < 0
    or (p_attributes is not null and jsonb_typeof(p_attributes) <> 'object') then
    raise exception 'INVALID_PRODUCT';
  end if;
  if p_id is null then
    insert into public.products(name, category, subcategory, attributes, status, cost, price, stock_min, image_data)
    values (trim(p_name), trim(p_category), nullif(trim(coalesce(p_subcategory, '')), ''),
            coalesce(p_attributes, '{}'::jsonb), p_status, p_cost, p_price, p_stock_min, nullif(p_image, ''))
    returning id into v_id;
  else
    update public.products set name = trim(p_name), category = trim(p_category),
      subcategory = nullif(trim(coalesce(p_subcategory, '')), ''), attributes = coalesce(p_attributes, '{}'::jsonb),
      status = p_status, cost = p_cost, price = p_price, stock_min = p_stock_min,
      image_data = case when p_image is null then image_data when p_image = '' then null else p_image end,
      updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  return v_id;
end;
$$;

-- Lista de productos con existencia (administración y caja).
create or replace function public.product_list()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'category', p.category, 'subcategory', p.subcategory,
      'attributes', p.attributes, 'status', p.status, 'cost', p.cost, 'price', p.price,
      'profit', p.profit, 'stock', public.product_stock_of(p.id), 'stock_min', p.stock_min,
      'low_stock', public.product_stock_of(p.id) <= p.stock_min, 'image_data', p.image_data)
      order by p.category, p.name)
    from public.products p), '[]'::jsonb);
end;
$$;

-- Ajuste de inventario (conteo físico). Nunca deja existencia negativa.
create or replace function public.product_stock_adjust(p_product uuid, p_qty integer, p_note text)
returns integer language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_stock integer;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_qty is null or p_qty = 0 or abs(p_qty) > 100000 then raise exception 'INVALID_QTY'; end if;
  perform 1 from public.products where id = p_product for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_stock := public.product_stock_of(p_product);
  if v_stock + p_qty < 0 then raise exception 'SIN_STOCK'; end if;
  insert into public.stock_movements(product_id, kind, qty, note, created_by)
  values (p_product, 'ajuste', p_qty, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  return v_stock + p_qty;
end;
$$;

-- Compra de inventario: resta en finanzas (gasto) y suma stock. Idempotente por p_request.
create or replace function public.product_purchase(
  p_request uuid, p_product uuid, p_qty integer, p_unit_cost numeric,
  p_method text, p_account text, p_category text default 'exp_inventario', p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_name text; v_active text; v_total numeric; v_tx uuid; v_existing public.stock_movements;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  select * into v_existing from public.stock_movements where request_id = p_request;
  if found then
    return jsonb_build_object('transaction_id', v_existing.transaction_id, 'already', true,
      'stock', public.product_stock_of(p_product));
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > 100000 then raise exception 'INVALID_QTY'; end if;
  if p_unit_cost is null or p_unit_cost <= 0 or p_unit_cost > 9999999 or p_unit_cost <> round(p_unit_cost, 2) then
    raise exception 'INVALID_COST';
  end if;
  select name, status into v_name, v_active from public.products where id = p_product for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_active <> 'activo' then raise exception 'PRODUCT_INACTIVE'; end if;
  v_total := round(p_qty * p_unit_cost, 2);
  v_tx := public.finance_record_movement(p_request, 'expense', null, v_total, 'NIO', p_method, p_account,
    'Compra inventario: ' || v_name || ' x' || p_qty, 1, p_category);
  insert into public.stock_movements(product_id, kind, qty, unit_cost, transaction_id, request_id, note, created_by)
  values (p_product, 'entrada', p_qty, p_unit_cost, v_tx, p_request, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  return jsonb_build_object('transaction_id', v_tx, 'already', false, 'stock', public.product_stock_of(p_product));
end;
$$;

-- Venta de producto a un cliente: suma en finanzas (ingreso) y baja stock. Idempotente por p_request.
create or replace function public.product_sell(
  p_request uuid, p_product uuid, p_qty integer, p_client uuid, p_method text, p_account text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '5s' as $$
declare v_name text; v_status text; v_price numeric; v_stock integer; v_total numeric; v_tx uuid; v_existing public.stock_movements;
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  select * into v_existing from public.stock_movements where request_id = p_request;
  if found then
    return jsonb_build_object('transaction_id', v_existing.transaction_id, 'already', true,
      'stock', public.product_stock_of(p_product));
  end if;
  if p_client is null then raise exception 'CLIENT_REQUIRED'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000 then raise exception 'INVALID_QTY'; end if;
  select name, status, price into v_name, v_status, v_price from public.products where id = p_product for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status <> 'activo' then raise exception 'PRODUCT_INACTIVE'; end if;
  v_stock := public.product_stock_of(p_product);
  if v_stock < p_qty then raise exception 'SIN_STOCK'; end if;
  v_total := round(p_qty * v_price, 2);
  v_tx := public.finance_record_movement(p_request, 'service_income', p_client, v_total, 'NIO', p_method, p_account,
    'Venta: ' || v_name || ' x' || p_qty, 1, null);
  insert into public.stock_movements(product_id, kind, qty, unit_price, client_id, transaction_id, request_id, created_by)
  values (p_product, 'venta', -p_qty, v_price, p_client, v_tx, p_request, auth.uid());
  return jsonb_build_object('transaction_id', v_tx, 'already', false, 'stock', v_stock - p_qty, 'total', v_total);
end;
$$;

-- Categoría de cliente calculada. Permiso: personal con acceso al progreso, o el propio cliente.
create or replace function public.client_category(p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_client uuid; v_today date := (now() at time zone 'America/Managua')::date;
  v_period text; v_status text; v_membership boolean; v_visits integer; v_purchases integer; v_cat text;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if p_client is null then
    select id into v_client from public.gym_clients where profile_id = auth.uid() limit 1;
  else
    v_client := p_client;
  end if;
  if v_client is null then return null; end if;
  if not (public.progress_can_read_client(v_client)
          or exists(select 1 from public.gym_clients where id = v_client and profile_id = auth.uid())) then
    return null;
  end if;
  select pl.period, g.status into v_period, v_status
    from public.gym_clients g left join public.plans pl on pl.id = g.plan_id where g.id = v_client;
  v_membership := v_status = 'active' and v_period in ('week', 'month');
  select count(*) into v_visits from public.client_visits
    where client_id = v_client and local_day > v_today - 30 and local_day <= v_today;
  select count(*) into v_purchases from public.stock_movements
    where client_id = v_client and kind = 'venta' and created_at >= now() - interval '90 days';
  v_cat := case
    when v_membership and v_period = 'month' and v_purchases > 0 then 'strong_gym'
    when v_membership then 'familia'
    when v_visits >= 3 then 'amigo'
    else 'comun' end;
  return jsonb_build_object('category', v_cat, 'membership_period', v_period, 'membership_active', v_membership,
    'visits_30_days', v_visits, 'purchases_90_days', v_purchases);
end;
$$;

-- Permisos de ejecución: sólo sesión iniciada; nunca anónimo.
revoke all on function public.product_stock_of(uuid), public.product_save(uuid,text,text,text,jsonb,text,numeric,numeric,integer,text),
  public.product_list(), public.product_stock_adjust(uuid,integer,text),
  public.product_purchase(uuid,uuid,integer,numeric,text,text,text,text),
  public.product_sell(uuid,uuid,integer,uuid,text,text), public.client_category(uuid) from public, anon;
grant execute on function public.product_save(uuid,text,text,text,jsonb,text,numeric,numeric,integer,text),
  public.product_list(), public.product_stock_adjust(uuid,integer,text),
  public.product_purchase(uuid,uuid,integer,numeric,text,text,text,text),
  public.product_sell(uuid,uuid,integer,uuid,text,text), public.client_category(uuid) to authenticated;
revoke all on function public.product_stock_of(uuid) from authenticated;

commit;
