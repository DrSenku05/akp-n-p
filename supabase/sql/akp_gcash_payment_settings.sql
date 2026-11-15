-- Store-wide GCash settings and QR storage used by the admin and customer apps.
-- Account display details and QR image are intentionally public when enabled.
begin;

create table if not exists public.store_payment_settings (
  id boolean primary key default true check (id = true),
  account_name text,
  account_number text,
  qr_url text,
  qr_path text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint store_payment_settings_account_name_length
    check (account_name is null or char_length(account_name) between 2 and 100),
  constraint store_payment_settings_account_number_length
    check (account_number is null or char_length(account_number) between 7 and 24),
  constraint store_payment_settings_qr_path_format
    check (qr_path is null or qr_path ~ '^payment/[a-zA-Z0-9._-]+$')
);

drop trigger if exists touch_updated_at on public.store_payment_settings;
create trigger touch_updated_at
before update on public.store_payment_settings
for each row execute function app_private.touch_updated_at();

alter table public.store_payment_settings enable row level security;
grant select on public.store_payment_settings to anon, authenticated;
grant insert, update on public.store_payment_settings to authenticated;

drop policy if exists "Public can read enabled GCash settings" on public.store_payment_settings;
create policy "Public can read enabled GCash settings"
on public.store_payment_settings for select to anon, authenticated
using (enabled = true);

drop policy if exists "Active admins can read GCash settings" on public.store_payment_settings;
create policy "Active admins can read GCash settings"
on public.store_payment_settings for select to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff'));

drop policy if exists "Owners can manage GCash settings" on public.store_payment_settings;
create policy "Owners can manage GCash settings"
on public.store_payment_settings for all to authenticated
using ((select app_private.current_admin_role()) = 'owner')
with check ((select app_private.current_admin_role()) = 'owner');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gcash-payment', 'gcash-payment', true, 5242880,
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
