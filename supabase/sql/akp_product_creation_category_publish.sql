-- Create a categorized product, record its opening stock, and optionally publish it atomically.
-- Run after akp_step2_products_inventory_heritage.sql and akp_product_supplier_cost_and_earnings.sql.
begin;

do $$
begin
  if to_regclass('public.product_categories') is null
    or to_regprocedure('app_private.current_admin_role()') is null
    or to_regprocedure('app_private.create_product_draft_with_cost(text,text,numeric)') is null
    or to_regprocedure('app_private.record_product_stock_movement(text,text,integer,text,text)') is null
    or to_regprocedure('app_private.publish_product(text)') is null then
    raise exception 'Apply the AKP product, inventory, category, and supplier-cost setup before this product-creation update.';
  end if;
end
$$;

create or replace function app_private.create_product_with_category_and_inventory(
  p_name text,
  p_image_url text,
  p_supplier_cost numeric,
  p_retail_price numeric,
  p_opening_stock integer,
  p_category_id uuid,
  p_publish boolean
)
returns table(id uuid, sku text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_sku text;
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  if p_retail_price is null or p_retail_price < 0 or p_retail_price > 9999999999.99 then
    raise exception 'Retail price must be between 0 and 9,999,999,999.99.' using errcode = '22023';
  end if;
  if p_opening_stock is null or p_opening_stock < 0 then
    raise exception 'Opening stock must be a whole number of zero or greater.' using errcode = '22023';
  end if;
  if p_category_id is null or not exists (
    select 1 from public.product_categories c
    where c.id = p_category_id and c.archived_at is null and c.parent_category_id is null
  ) then
    raise exception 'Choose an active top-level category.' using errcode = '23514';
  end if;
  if p_publish is null then
    raise exception 'Choose whether to publish or save this product as a draft.' using errcode = '22023';
  end if;
  if p_publish and p_retail_price <= 0 then
    raise exception 'Retail price must be greater than zero to publish.' using errcode = '23514';
  end if;

  select created.id, created.sku into v_product_id, v_sku
  from app_private.create_product_draft_with_cost(p_name, p_image_url, p_supplier_cost) as created;
  update public.products
  set price = p_retail_price, category_id = p_category_id
  where products.id = v_product_id;

  if p_opening_stock > 0 then
    perform app_private.record_product_stock_movement(
      v_sku, 'restock', p_opening_stock, null, 'Opening stock received during product creation'
    );
  end if;
  if p_publish then
    perform app_private.publish_product(v_sku);
  end if;

  return query select v_product_id, v_sku;
end
$$;

create or replace function public.create_product_with_category_and_inventory(
  p_name text,
  p_image_url text,
  p_supplier_cost numeric,
  p_retail_price numeric,
  p_opening_stock integer,
  p_category_id uuid,
  p_publish boolean
)
returns table(id uuid, sku text)
language sql
security invoker
set search_path = ''
as $$
  select * from app_private.create_product_with_category_and_inventory(
    p_name, p_image_url, p_supplier_cost, p_retail_price, p_opening_stock, p_category_id, p_publish
  )
$$;

revoke all on function app_private.create_product_with_category_and_inventory(text,text,numeric,numeric,integer,uuid,boolean) from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.create_product_with_category_and_inventory(text,text,numeric,numeric,integer,uuid,boolean) to authenticated;
revoke all on function public.create_product_with_category_and_inventory(text,text,numeric,numeric,integer,uuid,boolean) from public, anon;
grant execute on function public.create_product_with_category_and_inventory(text,text,numeric,numeric,integer,uuid,boolean) to authenticated;

commit;
