-- Shared inventory warning threshold used by the admin inventory and dashboard.
begin;

create table if not exists public.store_inventory_settings (
  id boolean primary key default true check (id = true),
  low_stock_threshold integer not null default 10 check (low_stock_threshold between 0 and 100000),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_updated_at on public.store_inventory_settings;
create trigger touch_updated_at
before update on public.store_inventory_settings
for each row execute function app_private.touch_updated_at();

alter table public.store_inventory_settings enable row level security;
grant select, insert, update on public.store_inventory_settings to authenticated;

drop policy if exists "Active admins can read inventory settings" on public.store_inventory_settings;
create policy "Active admins can read inventory settings"
on public.store_inventory_settings for select to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff'));

drop policy if exists "Owners can manage inventory settings" on public.store_inventory_settings;
create policy "Owners can manage inventory settings"
on public.store_inventory_settings for all to authenticated
using ((select app_private.current_admin_role()) = 'owner')
with check ((select app_private.current_admin_role()) = 'owner');

insert into public.store_inventory_settings (id, low_stock_threshold)
values (true, 10)
on conflict (id) do nothing;

commit;
