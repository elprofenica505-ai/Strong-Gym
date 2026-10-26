-- El catálogo de venta en recepción también devuelve la imagen del producto.
--
-- Motivo: recepción debe reconocer el producto por su foto al venderlo desde
-- la ficha, igual que en «Productos y stock». Sigue sin exponer costo ni
-- ganancia y solo lo ejecuta el personal de caja/administración con MFA
-- (crm_is_staff). La imagen ya se guarda reducida (≤ 600 KB) en products.
--
-- Reversión: recrear product_sale_catalog() sin la clave image_data, como en
-- la migración 00059. No se tocan tablas ni datos.

begin;
set local lock_timeout = '5s';

create or replace function public.product_sale_catalog()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.crm_is_staff() then raise exception 'AUTH'; end if;
  return jsonb_build_object('products', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'category', p.category,
      'subcategory', p.subcategory,
      'attributes', p.attributes,
      'price', p.price,
      'stock', s.stock,
      'low_stock', s.stock <= p.stock_min,
      'image_data', p.image_data
    ) order by p.category, p.name)
    from public.products p
    cross join lateral (
      select coalesce(sum(qty), 0)::integer as stock
      from public.stock_movements sm
      where sm.product_id = p.id
    ) s
    where p.status = 'activo' and p.price > 0 and s.stock > 0
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.product_sale_catalog() from public, anon, authenticated;
grant execute on function public.product_sale_catalog() to authenticated;

notify pgrst, 'reload schema';
commit;
