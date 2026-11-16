-- Additive RPC for saving edited product details as a draft.
-- Run once in Supabase Dashboard > SQL Editor before using the General save button.
-- Saving General details moves a published product back to draft and hides it
-- from the customer catalog until it is published again.

begin;

do $$
begin
  if to_regclass('public.products') is null
    or to_regprocedure('app_private.current_admin_role()') is null
    or to_regprocedure('app_private.prevent_product_managed_write()') is null then
    raise exception 'Apply the AKP Step 2 products setup before installing save_product_draft.';
  end if;
end
$$;

create or replace function app_private.save_product_draft(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_category_id uuid,
  p_subcategory_id uuid,
  p_price numeric,
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
      image_url = p_image_url,
      visibility = 'draft'
  where id = p_product_id;
end
$$;

create or replace function public.save_product_draft(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_category_id uuid,
  p_subcategory_id uuid,
  p_price numeric,
  p_image_url text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_product_draft(
    p_product_id, p_name, p_description, p_category_id,
    p_subcategory_id, p_price, p_image_url
  )
$$;

revoke all on function app_private.save_product_draft(uuid, text, text, uuid, uuid, numeric, text) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.save_product_draft(uuid, text, text, uuid, uuid, numeric, text) to authenticated;
revoke all on function public.save_product_draft(uuid, text, text, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.save_product_draft(uuid, text, text, uuid, uuid, numeric, text) to authenticated;

commit;
