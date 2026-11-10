-- Publicly readable GCash QR assets; only an active AKP owner can manage them.
-- The admin UI uploads to this bucket. The database session separately provisions
-- public.store_payment_settings for the account name, number, QR URL/path, and enabled flag.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gcash-payment',
  'gcash-payment',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view GCash QR images" on storage.objects;
create policy "Public can view GCash QR images"
on storage.objects for select to public
using (bucket_id = 'gcash-payment');

drop policy if exists "Owners can upload GCash QR images" on storage.objects;
create policy "Owners can upload GCash QR images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'gcash-payment'
  and (storage.foldername(name))[1] = 'payment'
  and (select app_private.current_admin_role()) = 'owner'
);

drop policy if exists "Owners can replace GCash QR images" on storage.objects;
create policy "Owners can replace GCash QR images"
on storage.objects for update to authenticated
using (
  bucket_id = 'gcash-payment'
  and (storage.foldername(name))[1] = 'payment'
  and (select app_private.current_admin_role()) = 'owner'
)
with check (
  bucket_id = 'gcash-payment'
  and (storage.foldername(name))[1] = 'payment'
  and (select app_private.current_admin_role()) = 'owner'
);

drop policy if exists "Owners can delete GCash QR images" on storage.objects;
create policy "Owners can delete GCash QR images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'gcash-payment'
  and (storage.foldername(name))[1] = 'payment'
  and (select app_private.current_admin_role()) = 'owner'
);

commit;
