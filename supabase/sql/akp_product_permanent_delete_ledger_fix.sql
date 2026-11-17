-- Allow permanent product deletion to detach immutable inventory snapshots.
-- Run after akp_step2_products_inventory_heritage.sql.
begin;

do $$
begin
  if to_regclass('public.products') is null
    or to_regclass('public.inventory_movements') is null
    or to_regprocedure('app_private.current_admin_role()') is null
    or to_regprocedure('app_private.delete_product(text)') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory_movements' and column_name = 'product_sku'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory_movements' and column_name = 'product_name'
    ) then
    raise exception 'Apply the AKP Step 2 Products and Inventory setup before this permanent-delete fix.';
  end if;
end
$$;

create or replace function app_private.reject_inventory_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The product FK uses ON DELETE SET NULL. Permit only that internal detach,
  -- and only when the immutable product snapshots remain byte-for-byte equal.
  if tg_op = 'UPDATE'
    and old.product_id is not null
    and new.product_id is null
    and old.product_sku is not null
    and old.product_name is not null
    and coalesce(current_setting('akp.product_delete_id', true), '') = old.product_id::text
    and (pg_catalog.to_jsonb(new) - 'product_id') is not distinct from (pg_catalog.to_jsonb(old) - 'product_id') then
    return new;
  end if;
  raise exception 'Inventory movements are immutable; record a correcting movement instead'
    using errcode = 'insufficient_privilege';
end
$$;
revoke all on function app_private.reject_inventory_movement_mutation() from public, anon, authenticated;

create or replace function app_private.delete_product(p_sku text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_reserved integer;
begin
  if coalesce((select app_private.current_admin_role()), '') <> 'owner' then
    raise exception 'Only an owner can permanently delete a product.' using errcode = '42501';
  end if;
  select id, reserved_stock into v_product_id, v_reserved
  from public.products
  where sku = pg_catalog.btrim(p_sku)
  for update;
  if not found then
    raise exception 'Product was not found.' using errcode = 'P0002';
  end if;
  if v_reserved > 0 then
    raise exception 'Cancel or complete pending orders before permanently deleting this product.' using errcode = '23514';
  end if;

  perform pg_catalog.set_config('akp.product_delete_id', v_product_id::text, true);
  delete from public.products where id = v_product_id;
  perform pg_catalog.set_config('akp.product_delete_id', '', true);
end
$$;
revoke all on function app_private.delete_product(text) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.delete_product(text) to authenticated;

commit;
