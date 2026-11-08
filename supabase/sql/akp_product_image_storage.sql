-- Public product imagery for the storefront; only active admins may upload or manage files.
-- Product rows keep the resulting public URL in public.products.image_url.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects for select to public
using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (select app_private.current_admin_role()) in ('owner', 'staff')
);

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and (select app_private.current_admin_role()) in ('owner', 'staff')
)
with check (
  bucket_id = 'product-images'
  and (select app_private.current_admin_role()) in ('owner', 'staff')
);

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (select app_private.current_admin_role()) in ('owner', 'staff')
);

commit;
