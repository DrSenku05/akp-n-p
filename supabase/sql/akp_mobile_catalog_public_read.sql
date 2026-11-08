-- Allow the customer mobile app to read only the public product catalog.
-- Run once in the Supabase SQL Editor after akp_admin_schema.sql.
-- This does not grant anonymous write access or expose unpublished products.

begin;

grant select (
  sku, name, description, category_id, price, stock_quantity,
  reorder_level, image_url, craft_origin, is_featured, visibility
) on table public.products to anon;

grant select (id, name) on table public.product_categories to anon;

drop policy if exists storefront_read_published_products on public.products;
create policy storefront_read_published_products on public.products
  for select to anon
  using (visibility = 'published');

drop policy if exists storefront_read_published_product_categories on public.product_categories;
create policy storefront_read_published_product_categories on public.product_categories
  for select to anon
  using (
    exists (
      select 1
      from public.products as product
      where product.category_id = product_categories.id
        and product.visibility = 'published'
    )
  );

commit;
