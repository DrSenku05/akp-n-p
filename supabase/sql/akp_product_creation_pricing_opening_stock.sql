-- Create a draft with price and audited opening stock in one transaction.
-- Run after akp_step2_products_inventory_heritage.sql and akp_product_supplier_cost_and_earnings.sql.
begin;

do $$
begin
  if to_regprocedure('app_private.current_admin_role()') is null
    or to_regprocedure('app_private.create_product_draft_with_cost(text,text,numeric)') is null
    or to_regprocedure('app_private.record_product_stock_movement(text,text,integer,text,text)') is null then
    raise exception 'Apply the AKP product, inventory, and supplier-cost setup before this product-creation update.';
  end if;
end
$$;

create or replace function app_private.create_product_draft_with_inventory(
  p_name text,
  p_image_url text,
  p_supplier_cost numeric,
  p_retail_price numeric,
  p_opening_stock integer
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

  select created.id, created.sku into v_product_id, v_sku
  from app_private.create_product_draft_with_cost(p_name, p_image_url, p_supplier_cost) as created;
  update public.products set price = p_retail_price where products.id = v_product_id;
  if p_opening_stock > 0 then
    perform app_private.record_product_stock_movement(
      v_sku, 'restock', p_opening_stock, null, 'Opening stock received during product creation'
    );
  end if;
  return query select v_product_id, v_sku;
end
$$;

create or replace function public.create_product_draft_with_inventory(
  p_name text,
  p_image_url text,
  p_supplier_cost numeric,
  p_retail_price numeric,
  p_opening_stock integer
)
returns table(id uuid, sku text)
language sql
security invoker
set search_path = ''
as $$
  select * from app_private.create_product_draft_with_inventory(
    p_name, p_image_url, p_supplier_cost, p_retail_price, p_opening_stock
  )
$$;

revoke all on function app_private.create_product_draft_with_inventory(text,text,numeric,numeric,integer) from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.create_product_draft_with_inventory(text,text,numeric,numeric,integer) to authenticated;
revoke all on function public.create_product_draft_with_inventory(text,text,numeric,numeric,integer) from public, anon;
grant execute on function public.create_product_draft_with_inventory(text,text,numeric,numeric,integer) to authenticated;

commit;
