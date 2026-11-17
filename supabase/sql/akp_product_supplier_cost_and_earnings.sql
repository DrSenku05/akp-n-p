-- Add supplier cost per unit and draft RPCs used by the web admin.
-- Run once in Supabase Dashboard > SQL Editor before creating or saving products.
-- Earnings shown in the admin are estimates from current price and physical stock;
-- they do not include promotions, delivery, payment fees, or other costs.

begin;

do $$
begin
  if to_regclass('public.products') is null
    or to_regprocedure('app_private.current_admin_role()') is null
    or to_regprocedure('app_private.create_product_draft(text, text)') is null
    or to_regprocedure('app_private.prevent_product_managed_write()') is null then
    raise exception 'Apply the AKP admin and Step 2 products setup before this supplier-cost update.';
  end if;
end
$$;

alter table public.products
  add column if not exists supplier_cost numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_supplier_cost_nonnegative'
  ) then
    alter table public.products
      add constraint products_supplier_cost_nonnegative
      check (supplier_cost is null or supplier_cost >= 0);
  end if;
end
$$;

create or replace function app_private.create_product_draft_with_cost(
  p_name text,
  p_image_url text,
  p_supplier_cost numeric
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
  if p_supplier_cost is null or p_supplier_cost < 0 then
    raise exception 'Supplier cost must be zero or greater.' using errcode = '22023';
  end if;

  select created.id, created.sku into v_product_id, v_sku
  from app_private.create_product_draft(p_name, p_image_url) as created;
  update public.products set supplier_cost = p_supplier_cost where products.id = v_product_id;
  return query select v_product_id, v_sku;
end
$$;

create or replace function app_private.save_product_details_as_draft(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_category_id uuid,
  p_subcategory_id uuid,
  p_price numeric,
  p_supplier_cost numeric,
  p_image_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  if nullif(pg_catalog.btrim(p_name), '') is null or length(p_name) > 200 then
    raise exception 'Product name must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Price must be zero or greater.' using errcode = '22023';
  end if;
  if p_supplier_cost is null or p_supplier_cost < 0 then
    raise exception 'Supplier cost must be zero or greater.' using errcode = '22023';
  end if;
  if p_image_url is not null and length(p_image_url) > 2048 then
    raise exception 'Product image URL is too long.' using errcode = '22023';
  end if;

  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product was not found.' using errcode = 'P0002';
  end if;

  perform set_config('akp.product_managed_operation', 'allowed', true);
  update public.products
  set name = pg_catalog.btrim(p_name),
      description = p_description,
      category_id = p_category_id,
      subcategory_id = p_subcategory_id,
      price = p_price,
      supplier_cost = p_supplier_cost,
      image_url = p_image_url,
      visibility = 'draft'
  where id = p_product_id;
end
$$;

create or replace function public.create_product_draft_with_cost(
  p_name text,
  p_image_url text,
  p_supplier_cost numeric
)
returns table(id uuid, sku text)
language sql
security invoker
set search_path = ''
as $$ select * from app_private.create_product_draft_with_cost(p_name, p_image_url, p_supplier_cost) $$;

create or replace function public.save_product_details_as_draft(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_category_id uuid,
  p_subcategory_id uuid,
  p_price numeric,
  p_supplier_cost numeric,
  p_image_url text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_product_details_as_draft(
    p_product_id, p_name, p_description, p_category_id,
    p_subcategory_id, p_price, p_supplier_cost, p_image_url
  )
$$;

revoke all on function app_private.create_product_draft_with_cost(text, text, numeric) from public, anon;
revoke all on function app_private.save_product_details_as_draft(uuid, text, text, uuid, uuid, numeric, numeric, text) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.create_product_draft_with_cost(text, text, numeric) to authenticated;
grant execute on function app_private.save_product_details_as_draft(uuid, text, text, uuid, uuid, numeric, numeric, text) to authenticated;
revoke all on function public.create_product_draft_with_cost(text, text, numeric) from public, anon;
revoke all on function public.save_product_details_as_draft(uuid, text, text, uuid, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.create_product_draft_with_cost(text, text, numeric) to authenticated;
grant execute on function public.save_product_details_as_draft(uuid, text, text, uuid, uuid, numeric, numeric, text) to authenticated;

commit;
