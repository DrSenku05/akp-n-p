-- Read-only customer access to Native Heritage stories for published featured products.
-- Run after akp_step2_products_inventory_heritage.sql.
begin;

do $$
begin
  if to_regclass('public.products') is null
    or to_regclass('public.native_heritage_stories') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'products' and column_name = 'visibility'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'products' and column_name = 'is_featured'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'native_heritage_stories' and column_name = 'heritage_description'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'native_heritage_stories' and column_name = 'cover_image_url'
    ) then
    raise exception 'Apply the AKP Step 2 products, inventory, and heritage setup before this customer story RPC.';
  end if;
end
$$;

drop function if exists public.get_published_featured_heritage_stories();

create function public.get_published_featured_heritage_stories()
returns table(product_id uuid, heritage_description text, cover_image_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.product_id, h.heritage_description, h.cover_image_url
  from public.native_heritage_stories h
  join public.products p on p.id = h.product_id
  where p.visibility = 'published'
    and p.is_featured is true
    and (
      nullif(pg_catalog.btrim(h.heritage_description), '') is not null
      or nullif(pg_catalog.btrim(h.cover_image_url), '') is not null
    )
$$;

revoke all on function public.get_published_featured_heritage_stories() from public, anon, authenticated;
grant execute on function public.get_published_featured_heritage_stories() to anon, authenticated;

commit;
