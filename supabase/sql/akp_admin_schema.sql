-- AKP Native Products admin schema for Supabase SQL Editor.
-- Additive only: does not alter the existing public.user or public.contacts tables.
-- Run once in the intended Supabase project. Create the first Auth user separately,
-- then add that user's UUID to public.admin_users with role = 'owner'.

begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  role text not null check (role in ('owner', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text,
  category_id uuid references public.product_categories(id) on delete set null,
  price numeric(12,2) not null check (price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  image_url text,
  craft_origin text,
  is_featured boolean not null default false,
  visibility text not null default 'draft' check (visibility in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_email_lower_unique
  on public.customers (lower(email)) where email is not null;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  recipient_name text not null,
  phone text,
  address_line text not null,
  barangay text,
  city text not null,
  province text,
  postal_code text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_personnel (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  availability text not null default 'available' check (availability in ('available', 'on_delivery', 'off_duty', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  delivery_address_id uuid references public.customer_addresses(id) on delete set null,
  delivery_personnel_id uuid references public.delivery_personnel(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  fulfillment_method text not null default 'delivery' check (fulfillment_method in ('delivery', 'pickup')),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  cancelled_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('restock', 'sale', 'damage', 'adjustment')),
  quantity_delta integer not null check (quantity_delta <> 0),
  reason text not null,
  reference_id uuid,
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (movement_type = 'restock' and quantity_delta > 0)
    or (movement_type in ('sale', 'damage') and quantity_delta < 0)
    or movement_type = 'adjustment'
  )
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  method text not null,
  amount numeric(12,2) not null check (amount >= 0),
  reference text,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'refunded', 'failed')),
  verified_by uuid references public.admin_users(user_id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_note text,
  decided_by uuid references public.admin_users(user_id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null,
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'flagged', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'ended', 'archived')),
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'all' check (audience in ('all', 'customers', 'staff')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.admin_users(user_id) on delete set null,
  actor_role text,
  module text not null,
  action text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.backup_records (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null check (backup_type in ('manual', 'scheduled')),
  storage_key text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'restoring')),
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_message text
);

create index if not exists products_category_idx on public.products(category_id);
create index if not exists customers_name_idx on public.customers(name);
create index if not exists orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists inventory_movements_product_created_idx on public.inventory_movements(product_id, created_at desc);
create index if not exists payments_order_status_idx on public.payments(order_id, status);
create index if not exists returns_order_status_idx on public.return_requests(order_id, status);
create index if not exists feedback_product_created_idx on public.feedback(product_id, created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function app_private.current_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select au.role
  from public.admin_users as au
  where au.user_id = (select auth.uid())
    and au.is_active = true
  limit 1
$$;

revoke all on function app_private.current_admin_role() from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.current_admin_role() to authenticated;

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;
grant select, insert, update, delete on table public.admin_users to authenticated;
drop policy if exists admin_users_read_self_or_owner on public.admin_users;
create policy admin_users_read_self_or_owner on public.admin_users
  for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.current_admin_role()) = 'owner');
drop policy if exists admin_users_owner_manage on public.admin_users;
create policy admin_users_owner_manage on public.admin_users
  for all to authenticated
  using ((select app_private.current_admin_role()) = 'owner')
  with check ((select app_private.current_admin_role()) = 'owner');

do $$
declare
  table_name text;
  business_tables text[] := array[
    'product_categories', 'products', 'customers', 'customer_addresses',
    'delivery_personnel', 'orders', 'order_items', 'inventory_movements',
    'payments', 'return_requests', 'feedback', 'promotions', 'announcements',
    'backup_records'
  ];
begin
  foreach table_name in array business_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('drop policy if exists admin_owner_staff_manage on public.%I', table_name);
    execute format(
      'create policy admin_owner_staff_manage on public.%I for all to authenticated using ((select app_private.current_admin_role()) in (''owner'', ''staff'')) with check ((select app_private.current_admin_role()) in (''owner'', ''staff''))',
      table_name
    );
  end loop;
end
$$;

alter table public.audit_logs enable row level security;
revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;
drop policy if exists audit_logs_owner_or_own_activity on public.audit_logs;
create policy audit_logs_owner_or_own_activity on public.audit_logs
  for select to authenticated
  using (
    (select app_private.current_admin_role()) = 'owner'
    or actor_id = (select auth.uid())
  );

create or replace function app_private.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status in ('processing', 'cancelled') then
    null;
  elsif old.status = 'processing' and new.status in ('shipped', 'cancelled') then
    null;
  elsif old.status = 'shipped' and new.status = 'delivered' then
    null;
  else
    raise exception 'Invalid order status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status = 'delivered' then
    new.delivered_at = coalesce(new.delivered_at, now());
  elsif new.status = 'cancelled' then
    new.cancelled_at = coalesce(new.cancelled_at, now());
  end if;
  new.updated_at = now();
  return new;
end
$$;

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

do $$
declare
  table_name text;
  timestamped_tables text[] := array[
    'admin_users', 'products', 'customers', 'delivery_personnel',
    'orders', 'payments', 'feedback', 'promotions'
  ];
begin
  foreach table_name in array timestamped_tables loop
    execute format('drop trigger if exists touch_updated_at on public.%I', table_name);
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function app_private.touch_updated_at()',
      table_name
    );
  end loop;
end
$$;

drop trigger if exists orders_enforce_status_transition on public.orders;
create trigger orders_enforce_status_transition
  before update of status on public.orders
  for each row execute function app_private.enforce_order_status_transition();

create or replace function app_private.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
  set stock_quantity = stock_quantity + new.quantity_delta,
      updated_at = now()
  where id = new.product_id
    and stock_quantity + new.quantity_delta >= 0;

  if not found then
    raise exception 'Inventory movement would make stock negative or product does not exist'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists inventory_movement_apply_stock on public.inventory_movements;
create trigger inventory_movement_apply_stock
  before insert on public.inventory_movements
  for each row execute function app_private.apply_inventory_movement();

create or replace function app_private.reject_inventory_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Inventory movements are immutable; record a correcting movement instead'
    using errcode = 'insufficient_privilege';
end
$$;

drop trigger if exists inventory_movements_are_immutable on public.inventory_movements;
create trigger inventory_movements_are_immutable
  before update or delete on public.inventory_movements
  for each row execute function app_private.reject_inventory_movement_mutation();

create or replace function app_private.write_admin_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_row jsonb;
  target_id uuid;
begin
  if tg_op = 'DELETE' then
    changed_row := to_jsonb(old);
  else
    changed_row := to_jsonb(new);
  end if;

  if changed_row ? 'id' then
    target_id := (changed_row ->> 'id')::uuid;
  elsif changed_row ? 'user_id' then
    target_id := (changed_row ->> 'user_id')::uuid;
  end if;

  insert into public.audit_logs (actor_id, actor_role, module, action, entity_id, metadata)
  values (
    (select auth.uid()),
    (select app_private.current_admin_role()),
    tg_table_name,
    lower(tg_op),
    target_id,
    jsonb_build_object('row', changed_row)
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create or replace function app_private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit logs are append-only'
    using errcode = 'insufficient_privilege';
end
$$;

drop trigger if exists audit_logs_are_immutable on public.audit_logs;
create trigger audit_logs_are_immutable
  before update or delete on public.audit_logs
  for each row execute function app_private.prevent_audit_log_mutation();

do $$
declare
  table_name text;
  audited_tables text[] := array[
    'admin_users', 'product_categories', 'products', 'customers',
    'customer_addresses', 'delivery_personnel', 'orders', 'order_items',
    'inventory_movements', 'payments', 'return_requests', 'feedback',
    'promotions', 'announcements', 'backup_records'
  ];
begin
  foreach table_name in array audited_tables loop
    execute format('drop trigger if exists write_admin_audit on public.%I', table_name);
    execute format(
      'create trigger write_admin_audit after insert or update or delete on public.%I for each row execute function app_private.write_admin_audit_log()',
      table_name
    );
  end loop;
end
$$;

revoke all on function app_private.apply_inventory_movement() from public, anon, authenticated;
revoke all on function app_private.write_admin_audit_log() from public, anon, authenticated;
revoke all on function app_private.reject_inventory_movement_mutation() from public, anon, authenticated;
revoke all on function app_private.prevent_audit_log_mutation() from public, anon, authenticated;
revoke all on function app_private.enforce_order_status_transition() from public, anon, authenticated;
revoke all on function app_private.touch_updated_at() from public, anon, authenticated;

commit;

-- After creating the owner in Supabase Authentication, attach its Auth UUID:
-- insert into public.admin_users (user_id, display_name, role)
-- values ('AUTH-USER-UUID-HERE', 'Owner Name', 'owner');
