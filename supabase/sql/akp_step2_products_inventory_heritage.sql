-- Step 2 additive catalog, inventory, and Native Heritage support.
-- Apply manually in Supabase SQL Editor only after reviewing the live schema.
-- Requires the existing AKP admin, customer-order, and inventory SQL setup.
-- Existing product columns used by the customer app remain available.

begin;

do $$
begin
  if to_regclass('public.products') is null
    or to_regclass('public.product_categories') is null
    or to_regclass('public.inventory_movements') is null
    or to_regclass('public.order_items') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.store_inventory_settings') is null
    or to_regprocedure('app_private.current_admin_role()') is null then
    raise exception 'Apply the existing AKP admin, customer-order, and inventory-settings setup before Step 2.';
  end if;
end
$$;

-- Keep the SKU format configurable while storing every SKU permanently.
create table if not exists public.product_sku_settings (
  id boolean primary key default true check (id),
  prefix text not null default 'AKP-PRD-',
  minimum_digits smallint not null default 8 check (minimum_digits between 1 and 16),
  next_number bigint not null default 1 check (next_number > 0)
);
insert into public.product_sku_settings(id) values (true) on conflict (id) do nothing;

create table if not exists public.product_sku_registry (
  sku text primary key,
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now()
);
insert into public.product_sku_registry(sku, product_id)
select sku, id from public.products
on conflict (sku) do update set product_id = excluded.product_id;

create or replace function app_private.assign_and_register_product_sku()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sku_format record;
  candidate text;
begin
  if tg_op = 'UPDATE' and new.sku is distinct from old.sku then
    raise exception 'A product SKU cannot be changed.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and coalesce(current_setting('akp.restore_mode', true), '') <> 'true' then
    if nullif(pg_catalog.btrim(new.name), '') is null or nullif(pg_catalog.btrim(new.image_url), '') is null then
      raise exception 'A product draft needs a name and primary image.' using errcode = '22023';
    end if;
    new.sku := null;
    new.visibility := 'draft';
    new.price := 0;
    new.stock_quantity := 0;
    new.reserved_stock := 0;
    new.is_featured := false;
    new.heritage_required := false;
    loop
      update public.product_sku_settings
      set next_number = next_number + 1
      where id = true
      returning prefix, minimum_digits, next_number into sku_format;
      candidate := sku_format.prefix || pg_catalog.lpad((sku_format.next_number - 1)::text, sku_format.minimum_digits, '0');
      exit when not exists (select 1 from public.product_sku_registry where sku = candidate)
        and not exists (select 1 from public.products where sku = candidate);
    end loop;
    new.sku := candidate;
  end if;

  if nullif(pg_catalog.btrim(new.sku), '') is null then
    raise exception 'A product SKU is required.' using errcode = '22023';
  end if;
  return new;
end
$$;
revoke all on function app_private.assign_and_register_product_sku() from public, anon, authenticated;

create or replace function app_private.register_product_sku()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.product_sku_registry(sku, product_id)
  values (new.sku, new.id)
  on conflict (sku) do update set product_id = excluded.product_id
  where public.product_sku_registry.product_id is null
    or public.product_sku_registry.product_id = excluded.product_id;
  if not found then raise exception 'This SKU is permanently reserved.' using errcode = '23505'; end if;
  return new;
end
$$;
revoke all on function app_private.register_product_sku() from public, anon, authenticated;
drop trigger if exists products_assign_sku on public.products;
create trigger products_assign_sku before insert or update of sku on public.products
for each row execute function app_private.assign_and_register_product_sku();
drop trigger if exists products_register_sku on public.products;
create trigger products_register_sku after insert or update of sku on public.products
for each row execute function app_private.register_product_sku();

-- Hierarchical classifications retain all existing category/product links.
alter table public.product_categories
  add column if not exists parent_category_id uuid references public.product_categories(id) on delete set null,
  add column if not exists archived_at timestamptz;
create unique index if not exists product_categories_id_parent_unique
  on public.product_categories(id, parent_category_id);
create index if not exists product_categories_parent_idx
  on public.product_categories(parent_category_id) where parent_category_id is not null;

create or replace function app_private.validate_product_category_parent()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_category_id is not null and (
    new.parent_category_id = new.id or not exists (
      select 1 from public.product_categories p
      where p.id = new.parent_category_id and p.parent_category_id is null
    )
  ) then raise exception 'A subcategory must reference a top-level category.' using errcode = '23514'; end if;
  return new;
end
$$;
drop trigger if exists product_categories_validate_parent on public.product_categories;
create trigger product_categories_validate_parent before insert or update of parent_category_id
on public.product_categories for each row execute function app_private.validate_product_category_parent();

alter table public.products
  add column if not exists subcategory_id uuid,
  add column if not exists reserved_stock integer not null default 0,
  add column if not exists heritage_required boolean not null default false,
  add column if not exists available_stock integer generated always as (stock_quantity - reserved_stock) stored;
alter table public.products drop constraint if exists products_reserved_stock_check;
alter table public.products add constraint products_reserved_stock_check
  check (reserved_stock >= 0 and reserved_stock <= stock_quantity);
alter table public.products drop constraint if exists products_subcategory_parent_fkey;
alter table public.products add constraint products_subcategory_parent_fkey
  foreign key (subcategory_id, category_id)
  references public.product_categories(id, parent_category_id);
create index if not exists products_subcategory_idx on public.products(subcategory_id);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists product_images_one_primary_per_product
  on public.product_images(product_id) where is_primary;
create index if not exists product_images_product_order_idx
  on public.product_images(product_id, sort_order, created_at);
insert into public.product_images(product_id, image_url, is_primary)
select p.id, p.image_url, true from public.products p
where p.image_url is not null and not exists (
  select 1 from public.product_images i where i.product_id = p.id and i.is_primary
);

create table if not exists public.native_heritage_stories (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  heritage_description text,
  origin text,
  traditional_craft text,
  cover_image_url text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
drop trigger if exists native_heritage_stories_touch_updated_at on public.native_heritage_stories;
create trigger native_heritage_stories_touch_updated_at
before update on public.native_heritage_stories
for each row execute function app_private.touch_updated_at();

-- Existing Native Heritage cards keep receiving origin and Featured from the
-- legacy product columns consumed by the customer app.
insert into public.native_heritage_stories(product_id, heritage_description, origin)
select id, description, craft_origin from public.products
where craft_origin is not null or is_featured
on conflict (product_id) do nothing;

-- Auditable physical and reserved movements; snapshots survive product deletion.
alter table public.inventory_movements
  alter column product_id drop not null,
  add column if not exists reserved_delta integer not null default 0,
  add column if not exists product_sku text,
  add column if not exists product_name text,
  add column if not exists stock_before integer,
  add column if not exists stock_after integer,
  add column if not exists reserved_before integer,
  add column if not exists reserved_after integer;
alter table public.inventory_movements drop constraint if exists inventory_movements_product_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;
alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements drop constraint if exists inventory_movements_quantity_delta_check;
alter table public.inventory_movements drop constraint if exists inventory_movements_check;
alter table public.inventory_movements drop constraint if exists inventory_movements_step2_shape_check;
alter table public.inventory_movements add constraint inventory_movements_step2_shape_check check (
  (movement_type = 'restock' and quantity_delta > 0 and reserved_delta = 0)
  or (movement_type = 'sale' and quantity_delta < 0 and reserved_delta in (0, quantity_delta))
  or (movement_type = 'damage' and quantity_delta < 0 and reserved_delta = 0)
  or (movement_type = 'adjustment' and quantity_delta <> 0 and reserved_delta = 0)
  or (movement_type = 'reservation' and quantity_delta = 0 and reserved_delta > 0)
  or (movement_type = 'release' and quantity_delta = 0 and reserved_delta < 0)
);
alter table public.inventory_movements disable trigger inventory_movements_are_immutable;
update public.inventory_movements m
set product_sku = p.sku, product_name = p.name
from public.products p where m.product_id = p.id
  and (m.product_sku is null or m.product_name is null);
alter table public.inventory_movements enable trigger inventory_movements_are_immutable;

create or replace function app_private.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_product record;
  next_stock integer;
  next_reserved integer;
  low_threshold integer;
begin
  if new.product_id is null then
    raise exception 'New inventory movements require an active product.' using errcode = '22023';
  end if;
  select id, sku, name, stock_quantity, reserved_stock into current_product
  from public.products where id = new.product_id for update;
  if not found then raise exception 'Product was not found.' using errcode = 'P0002'; end if;

  next_stock := current_product.stock_quantity + new.quantity_delta;
  next_reserved := current_product.reserved_stock + new.reserved_delta;
  if next_stock < 0 or next_reserved < 0 or next_reserved > next_stock then
    raise exception 'Movement would make physical stock, reservations, or available stock invalid.' using errcode = '23514';
  end if;

  new.product_sku := coalesce(new.product_sku, current_product.sku);
  new.product_name := coalesce(new.product_name, current_product.name);
  new.stock_before := current_product.stock_quantity;
  new.stock_after := next_stock;
  new.reserved_before := current_product.reserved_stock;
  new.reserved_after := next_reserved;

  perform set_config('akp.product_managed_operation', 'allowed', true);
  update public.products
  set stock_quantity = next_stock,
      reserved_stock = next_reserved,
      updated_at = now()
  where id = current_product.id;

  select low_stock_threshold into low_threshold
  from public.store_inventory_settings where id = true;
  if coalesce(current_setting('akp.restore_mode', true), '') <> 'true'
    and current_product.stock_quantity - current_product.reserved_stock > coalesce(low_threshold, 10)
    and next_stock - next_reserved <= coalesce(low_threshold, 10) then
    insert into public.audit_logs(actor_id, actor_role, module, action, entity_id, metadata)
    values (
      new.created_by,
      (select app_private.current_admin_role()),
      'inventory', 'low_stock', current_product.id,
      jsonb_build_object('sku', current_product.sku, 'product', current_product.name,
        'available_stock', next_stock - next_reserved, 'threshold', coalesce(low_threshold, 10))
    );
  end if;
  return new;
end
$$;
revoke all on function app_private.apply_inventory_movement() from public, anon, authenticated;
drop trigger if exists inventory_movement_apply_stock on public.inventory_movements;
create trigger inventory_movement_apply_stock before insert on public.inventory_movements
for each row execute function app_private.apply_inventory_movement();

-- Reservations remain attached to order snapshots when a catalog product is deleted.
create table if not exists public.order_inventory_reservations (
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_sku text not null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  status text not null check (status in ('reserved', 'committed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (order_id, product_sku)
);
create index if not exists order_inventory_reservations_product_idx
  on public.order_inventory_reservations(product_id, status);
alter table public.order_inventory_reservations enable row level security;
revoke all on public.order_inventory_reservations from anon, authenticated;

create or replace function app_private.reserve_order_item_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row record;
  order_row record;
begin
  if coalesce(current_setting('akp.restore_mode', true), '') = 'true' then return new; end if;
  if new.product_id is null then return new; end if;
  select status, order_number into order_row from public.orders where id = new.order_id for update;
  if not found then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  if order_row.status <> 'pending' then
    raise exception 'Stock can only be reserved while an order is pending.' using errcode = '23514';
  end if;
  select id, sku, name into product_row from public.products where id = new.product_id for update;
  if not found then raise exception 'The ordered product is no longer available.' using errcode = 'P0002'; end if;

  insert into public.order_inventory_reservations(order_id, product_id, product_sku, product_name, quantity, status)
  values (new.order_id, product_row.id, product_row.sku, product_row.name, new.quantity, 'reserved')
  on conflict (order_id, product_sku) do update
    set quantity = public.order_inventory_reservations.quantity + excluded.quantity,
        updated_at = now()
    where public.order_inventory_reservations.status = 'reserved';

  insert into public.inventory_movements(product_id, movement_type, quantity_delta, reserved_delta, reason, reference_id, created_by)
  values (product_row.id, 'reservation', 0, new.quantity,
    'Reserved for order ' || order_row.order_number, new.order_id,
    case when (select app_private.current_admin_role()) in ('owner', 'staff') then (select auth.uid()) else null end);
  return new;
end
$$;
revoke all on function app_private.reserve_order_item_stock() from public, anon, authenticated;
drop trigger if exists order_items_reserve_stock on public.order_items;
create trigger order_items_reserve_stock after insert on public.order_items
for each row execute function app_private.reserve_order_item_stock();
revoke insert, update, delete on public.order_items from anon, authenticated;
grant select on public.order_items to authenticated;

create or replace function app_private.apply_order_inventory_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation record;
  movement_type text;
  physical_delta integer;
  reserved_delta integer;
  reason_text text;
begin
  if old.status = 'pending' and new.status = 'processing' then
    movement_type := 'sale';
    reason_text := 'Accepted order ' || new.order_number;
  elsif old.status = 'pending' and new.status = 'cancelled' then
    movement_type := 'release';
    reason_text := 'Released cancelled order ' || new.order_number;
  else
    -- Accepted-order cancellation does not silently return items to stock.
    return new;
  end if;

  for reservation in
    select r.* from public.order_inventory_reservations r
    where r.order_id = new.id and r.status = 'reserved'
    order by r.product_id nulls last, r.product_sku for update
  loop
    physical_delta := case when movement_type = 'sale' then -reservation.quantity else 0 end;
    reserved_delta := -reservation.quantity;
    if reservation.product_id is not null then
      insert into public.inventory_movements(
        product_id, movement_type, quantity_delta, reserved_delta, reason, reference_id
      ) values (reservation.product_id, movement_type, physical_delta, reserved_delta, reason_text, new.id);
    end if;
    update public.order_inventory_reservations
    set status = case when movement_type = 'sale' then 'committed' else 'released' end,
        updated_at = now()
    where order_id = reservation.order_id and product_sku = reservation.product_sku and status = 'reserved';
  end loop;
  return new;
end
$$;
revoke all on function app_private.apply_order_inventory_transition() from public, anon, authenticated;
drop trigger if exists orders_apply_inventory_transition on public.orders;
create trigger orders_apply_inventory_transition before update of status on public.orders
for each row when (old.status is distinct from new.status)
execute function app_private.apply_order_inventory_transition();

-- A walk-in sale uses the same order and reservation path as a delivery order.
create or replace function app_private.create_walk_in_order(p_items jsonb, p_customer_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  product_row record;
  order_id uuid := gen_random_uuid();
  order_number text := 'AKP-WI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  total numeric(12,2) := 0;
  quantity integer;
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Add between 1 and 50 walk-in items.' using errcode = '22023';
  end if;
  insert into public.orders(id, order_number, status, fulfillment_method, subtotal, delivery_fee, total_amount,
    payment_method, payment_status, notes)
  values (order_id, order_number, 'pending', 'pickup', 0, 0, 0, 'Cash', 'pending',
    nullif(pg_catalog.btrim(p_customer_name), ''));
  for item in select value from jsonb_array_elements(p_items) loop
    if nullif(pg_catalog.btrim(item->>'sku'), '') is null or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Each walk-in item needs a SKU and positive whole-number quantity.' using errcode = '22023';
    end if;
    quantity := (item->>'quantity')::integer;
    if quantity > 99 then raise exception 'Walk-in quantity exceeds 99 per product.' using errcode = '22023'; end if;
    select p.id, p.sku, p.name, p.price into product_row
    from public.products p where p.sku = pg_catalog.btrim(item->>'sku') and p.visibility = 'published'
    for update;
    if not found then raise exception 'A walk-in product is not published.' using errcode = 'P0002'; end if;
    insert into public.order_items(order_id, product_id, product_name, sku, quantity, unit_price)
    values (order_id, product_row.id, product_row.name, product_row.sku, quantity, product_row.price);
    total := total + product_row.price * quantity;
  end loop;
  update public.orders set subtotal = total, total_amount = total where id = order_id;
  insert into public.payments(order_id, method, amount, status)
  values (order_id, 'Cash', total, 'pending');
  return jsonb_build_object('id', order_id, 'order_number', order_number, 'total', total);
end
$$;
revoke all on function app_private.create_walk_in_order(jsonb, text) from public, anon;
grant execute on function app_private.create_walk_in_order(jsonb, text) to authenticated;

-- Keep the original mobile catalog fields; new images/stories are admin-managed.
create or replace function app_private.sync_primary_product_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_image_url text;
begin
  if coalesce(current_setting('akp.restore_mode', true), '') = 'true' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name = 'products' then
    v_product_id := new.id;
    v_image_url := new.image_url;
  elsif tg_op = 'DELETE' then
    return old;
  else
    v_product_id := new.product_id;
    v_image_url := new.image_url;
  end if;

  if tg_table_name = 'products' and v_image_url is not null then
    insert into public.product_images(product_id, image_url, is_primary)
    values (v_product_id, v_image_url, true)
    on conflict do nothing;
    update public.product_images set image_url = v_image_url
    where product_images.product_id = v_product_id and product_images.is_primary
      and product_images.image_url is distinct from v_image_url;
  elsif tg_table_name = 'product_images' and new.is_primary then
    update public.products set image_url = new.image_url
    where id = v_product_id and image_url is distinct from new.image_url;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
revoke all on function app_private.sync_primary_product_image() from public, anon, authenticated;
drop trigger if exists products_sync_primary_image on public.products;
create trigger products_sync_primary_image after insert or update of image_url on public.products
for each row execute function app_private.sync_primary_product_image();
drop trigger if exists product_images_sync_primary on public.product_images;
create trigger product_images_sync_primary after insert or update of image_url, is_primary on public.product_images
for each row execute function app_private.sync_primary_product_image();

create or replace function app_private.sync_heritage_origin_to_legacy_catalog()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.products set craft_origin = new.origin where id = new.product_id
    and craft_origin is distinct from new.origin;
  return new;
end
$$;
revoke all on function app_private.sync_heritage_origin_to_legacy_catalog() from public, anon, authenticated;
drop trigger if exists heritage_origin_sync_legacy on public.native_heritage_stories;
create trigger heritage_origin_sync_legacy after insert or update of origin
on public.native_heritage_stories for each row execute function app_private.sync_heritage_origin_to_legacy_catalog();

create or replace function app_private.set_product_primary_image(p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare image_product_id uuid;
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  select product_id into image_product_id from public.product_images where id = p_image_id;
  if image_product_id is null then raise exception 'Product image was not found.' using errcode = 'P0002'; end if;
  perform 1 from public.products where id = image_product_id for update;
  update public.product_images set is_primary = false where product_id = image_product_id and is_primary;
  update public.product_images set is_primary = true where id = p_image_id;
end
$$;

create or replace function app_private.create_product_draft(p_name text, p_image_url text)
returns table(id uuid, sku text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  if nullif(pg_catalog.btrim(p_name), '') is null or length(pg_catalog.btrim(p_name)) > 200 then
    raise exception 'Product name must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_image_url), '') is null or length(p_image_url) > 2048 then
    raise exception 'Choose a primary product image.' using errcode = '22023';
  end if;
  return query insert into public.products(sku, name, image_url, price, stock_quantity, reserved_stock, visibility)
  values (null, pg_catalog.btrim(p_name), pg_catalog.btrim(p_image_url), 0, 0, 0, 'draft')
  returning products.id, products.sku;
end
$$;

create or replace function app_private.prevent_product_managed_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('akp.product_managed_operation', true), '') <> 'allowed' and (
    new.visibility is distinct from old.visibility
    or new.stock_quantity is distinct from old.stock_quantity
    or new.reserved_stock is distinct from old.reserved_stock
    or new.heritage_required is distinct from old.heritage_required
    or new.is_featured is distinct from old.is_featured
  ) then
    raise exception 'Use the matching product, inventory, or publishing action.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists products_visibility_guard on public.products;
drop trigger if exists products_managed_guard on public.products;
create trigger products_managed_guard before update on public.products
for each row execute function app_private.prevent_product_managed_write();

create or replace function app_private.publish_product(p_sku text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare p record;
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  select * into p from public.products where sku = pg_catalog.btrim(p_sku) for update;
  if not found then raise exception 'Product was not found.' using errcode = 'P0002'; end if;
  if nullif(pg_catalog.btrim(p.name), '') is null or nullif(pg_catalog.btrim(p.image_url), '') is null
    or p.category_id is null or p.price <= 0 then
    raise exception 'Add a product name, primary image, active category, and price greater than zero before publishing.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.product_categories c where c.id = p.category_id and c.archived_at is null and c.parent_category_id is null) then
    raise exception 'Choose an active top-level category.' using errcode = '23514';
  end if;
  if p.subcategory_id is not null and not exists (
    select 1 from public.product_categories c where c.id = p.subcategory_id
      and c.parent_category_id = p.category_id and c.archived_at is null
  ) then raise exception 'Choose a subcategory under the selected category.' using errcode = '23514'; end if;
  if p.heritage_required and not exists (
    select 1 from public.native_heritage_stories h where h.product_id = p.id
      and nullif(pg_catalog.btrim(h.heritage_description), '') is not null
      and nullif(pg_catalog.btrim(h.origin), '') is not null
      and nullif(pg_catalog.btrim(h.traditional_craft), '') is not null
      and nullif(pg_catalog.btrim(h.cover_image_url), '') is not null
  ) then raise exception 'Complete all Native Heritage fields required for this product.' using errcode = '23514'; end if;
  perform set_config('akp.product_managed_operation', 'allowed', true);
  update public.products set visibility = 'published' where id = p.id;
end
$$;

create or replace function app_private.archive_product(p_sku text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  perform 1 from public.products where sku = pg_catalog.btrim(p_sku) for update;
  if not found then raise exception 'Product was not found.' using errcode = 'P0002'; end if;
  perform set_config('akp.product_managed_operation', 'allowed', true);
  update public.products set visibility = 'archived' where sku = pg_catalog.btrim(p_sku);
end
$$;

create or replace function app_private.set_product_heritage_required(p_sku text, p_required boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select app_private.current_admin_role()), '') <> 'owner' then
    raise exception 'Only an owner can require a Native Heritage story.' using errcode = '42501';
  end if;
  perform set_config('akp.product_managed_operation', 'allowed', true);
  update public.products set heritage_required = p_required where sku = pg_catalog.btrim(p_sku);
  if not found then raise exception 'Product was not found.' using errcode = 'P0002'; end if;
end
$$;

create or replace function app_private.set_product_featured(p_sku text, p_featured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_product_id uuid;
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  select id into v_product_id from public.products where sku = pg_catalog.btrim(p_sku);
  if v_product_id is null then raise exception 'Product was not found.' using errcode = 'P0002'; end if;
  if p_featured and not exists (
    select 1 from public.native_heritage_stories where native_heritage_stories.product_id = v_product_id
  ) then raise exception 'Save the Native Heritage story before featuring this product.' using errcode = '23514'; end if;
  perform set_config('akp.product_managed_operation', 'allowed', true);
  update public.products set is_featured = p_featured where id = v_product_id;
end
$$;

create or replace function app_private.record_product_stock_movement(
  p_sku text, p_movement text, p_quantity integer, p_direction text, p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare product_row record; delta integer;
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be a positive whole number.' using errcode = '22023'; end if;
  if nullif(pg_catalog.btrim(p_reason), '') is null or length(pg_catalog.btrim(p_reason)) > 500 then
    raise exception 'Enter a reason of 1 to 500 characters.' using errcode = '22023';
  end if;
  if p_movement = 'restock' then delta := p_quantity;
  elsif p_movement = 'damage' then delta := -p_quantity;
  elsif p_movement = 'adjustment' and p_direction = 'Increase' then delta := p_quantity;
  elsif p_movement = 'adjustment' and p_direction = 'Decrease' then delta := -p_quantity;
  else raise exception 'Choose Received, Damage, or a directed Correction movement.' using errcode = '22023';
  end if;
  select id into product_row from public.products where sku = pg_catalog.btrim(p_sku) for update;
  if not found then raise exception 'Product was not found.' using errcode = 'P0002'; end if;
  insert into public.inventory_movements(product_id, movement_type, quantity_delta, reason, created_by)
  values (product_row.id, p_movement, delta, pg_catalog.btrim(p_reason), (select auth.uid()));
end
$$;

create or replace function app_private.delete_product(p_sku text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_reserved integer; v_product_id uuid;
begin
  if coalesce((select app_private.current_admin_role()), '') <> 'owner' then
    raise exception 'Only an owner can permanently delete a product.' using errcode = '42501';
  end if;
  select id, reserved_stock into v_product_id, v_reserved
  from public.products where sku = pg_catalog.btrim(p_sku) for update;
  if not found then raise exception 'Product was not found.' using errcode = 'P0002'; end if;
  if v_reserved > 0 then raise exception 'Cancel or complete pending orders before permanently deleting this product.' using errcode = '23514'; end if;
  perform pg_catalog.set_config('akp.product_delete_id', v_product_id::text, true);
  delete from public.products where sku = pg_catalog.btrim(p_sku);
  perform pg_catalog.set_config('akp.product_delete_id', '', true);
end
$$;

create or replace function app_private.get_product_sku_format()
returns table(prefix text, minimum_digits smallint)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select app_private.current_admin_role()), '') <> 'owner' then
    raise exception 'Only an owner can view SKU settings.' using errcode = '42501';
  end if;
  return query select s.prefix, s.minimum_digits from public.product_sku_settings s where s.id = true;
end
$$;
create or replace function app_private.set_product_sku_format(p_prefix text, p_minimum_digits smallint)
returns void language plpgsql security definer set search_path = '' as $$
declare normalized_prefix text := pg_catalog.upper(pg_catalog.btrim(p_prefix));
begin
  if coalesce((select app_private.current_admin_role()), '') <> 'owner' then
    raise exception 'Only an owner can change SKU settings.' using errcode = '42501';
  end if;
  if normalized_prefix is null or normalized_prefix !~ '^[A-Z0-9_-]{1,24}$'
    or p_minimum_digits is null or p_minimum_digits not between 1 and 16 then
    raise exception 'Use a 1 to 24 character A-Z, 0-9, underscore, or hyphen prefix and 1 to 16 digits.' using errcode = '22023';
  end if;
  update public.product_sku_settings set prefix = normalized_prefix, minimum_digits = p_minimum_digits where id = true;
end
$$;

-- All exposed product sub-resources use RLS; hidden registries stay inaccessible.
alter table public.product_sku_settings enable row level security;
alter table public.product_sku_registry enable row level security;
alter table public.product_images enable row level security;
alter table public.native_heritage_stories enable row level security;
revoke all on public.product_sku_settings, public.product_sku_registry from anon, authenticated;
revoke all on public.product_images, public.native_heritage_stories from anon, authenticated;
revoke insert, update, delete on public.inventory_movements from anon, authenticated;
grant select on public.inventory_movements to authenticated;
grant select, insert, update, delete on public.product_images, public.native_heritage_stories to authenticated;
drop policy if exists product_images_admin_manage on public.product_images;
drop policy if exists product_images_admin_read on public.product_images;
create policy product_images_admin_read on public.product_images for select to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff'));
drop policy if exists product_images_admin_insert on public.product_images;
create policy product_images_admin_insert on public.product_images for insert to authenticated
with check ((select app_private.current_admin_role()) in ('owner', 'staff'));
drop policy if exists product_images_admin_update on public.product_images;
create policy product_images_admin_update on public.product_images for update to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff'))
with check ((select app_private.current_admin_role()) in ('owner', 'staff'));
drop policy if exists product_images_admin_delete on public.product_images;
create policy product_images_admin_delete on public.product_images for delete to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff') and not is_primary);
drop policy if exists heritage_stories_admin_manage on public.native_heritage_stories;
create policy heritage_stories_admin_manage on public.native_heritage_stories for all to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff'))
with check ((select app_private.current_admin_role()) in ('owner', 'staff'));
drop policy if exists product_categories_admin_owner_staff_manage on public.product_categories;
drop policy if exists admin_owner_staff_manage on public.product_categories;
revoke delete on public.product_categories from authenticated;
drop policy if exists product_categories_admin_read on public.product_categories;
create policy product_categories_admin_read on public.product_categories for select to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff'));
drop policy if exists product_categories_admin_write on public.product_categories;
create policy product_categories_admin_write on public.product_categories for insert to authenticated
with check ((select app_private.current_admin_role()) in ('owner', 'staff'));
drop policy if exists product_categories_admin_update on public.product_categories;
create policy product_categories_admin_update on public.product_categories for update to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff'))
with check ((select app_private.current_admin_role()) in ('owner', 'staff'));

-- Preserve ordinary staff editing while requiring an explicit owner for delete.
drop policy if exists admin_owner_staff_manage on public.products;
grant select, insert, update, delete on public.products to authenticated;
drop policy if exists products_admin_read on public.products;
create policy products_admin_read on public.products for select to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff'));
drop policy if exists products_admin_insert on public.products;
create policy products_admin_insert on public.products for insert to authenticated
with check ((select app_private.current_admin_role()) in ('owner', 'staff'));
drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products for update to authenticated
using ((select app_private.current_admin_role()) in ('owner', 'staff'))
with check ((select app_private.current_admin_role()) in ('owner', 'staff'));
drop policy if exists products_owner_delete on public.products;
create policy products_owner_delete on public.products for delete to authenticated
using ((select app_private.current_admin_role()) = 'owner');

-- RPCs explicitly validate the current database role; never trust client metadata.
revoke all on function app_private.set_product_primary_image(uuid) from public, anon;
revoke all on function app_private.create_product_draft(text, text) from public, anon;
revoke all on function app_private.publish_product(text) from public, anon;
revoke all on function app_private.archive_product(text) from public, anon;
revoke all on function app_private.set_product_heritage_required(text, boolean) from public, anon;
revoke all on function app_private.set_product_featured(text, boolean) from public, anon;
revoke all on function app_private.record_product_stock_movement(text, text, integer, text, text) from public, anon;
revoke all on function app_private.delete_product(text) from public, anon;
revoke all on function app_private.get_product_sku_format() from public, anon;
revoke all on function app_private.set_product_sku_format(text, smallint) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.set_product_primary_image(uuid) to authenticated;
grant execute on function app_private.create_product_draft(text, text) to authenticated;
grant execute on function app_private.publish_product(text) to authenticated;
grant execute on function app_private.archive_product(text) to authenticated;
grant execute on function app_private.set_product_heritage_required(text, boolean) to authenticated;
grant execute on function app_private.set_product_featured(text, boolean) to authenticated;
grant execute on function app_private.record_product_stock_movement(text, text, integer, text, text) to authenticated;
grant execute on function app_private.delete_product(text) to authenticated;
grant execute on function app_private.get_product_sku_format() to authenticated;
grant execute on function app_private.set_product_sku_format(text, smallint) to authenticated;
grant select (available_stock, reserved_stock) on public.products to anon, authenticated;

-- The web app calls public-schema RPCs; privileged implementations stay private.
create or replace function public.create_product_draft(p_name text, p_image_url text)
returns table(id uuid, sku text) language sql security invoker set search_path = ''
as $$ select * from app_private.create_product_draft(p_name, p_image_url) $$;
create or replace function public.publish_product(p_sku text)
returns void language sql security invoker set search_path = ''
as $$ select app_private.publish_product(p_sku) $$;
create or replace function public.archive_product(p_sku text)
returns void language sql security invoker set search_path = ''
as $$ select app_private.archive_product(p_sku) $$;
create or replace function public.set_product_heritage_required(p_sku text, p_required boolean)
returns void language sql security invoker set search_path = ''
as $$ select app_private.set_product_heritage_required(p_sku, p_required) $$;
create or replace function public.set_product_featured(p_sku text, p_featured boolean)
returns void language sql security invoker set search_path = ''
as $$ select app_private.set_product_featured(p_sku, p_featured) $$;
create or replace function public.record_product_stock_movement(
  p_sku text, p_movement text, p_quantity integer, p_direction text, p_reason text
) returns void language sql security invoker set search_path = ''
as $$ select app_private.record_product_stock_movement(p_sku, p_movement, p_quantity, p_direction, p_reason) $$;
create or replace function public.delete_product(p_sku text)
returns void language sql security invoker set search_path = ''
as $$ select app_private.delete_product(p_sku) $$;
create or replace function public.set_product_primary_image(p_image_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select app_private.set_product_primary_image(p_image_id) $$;
create or replace function public.get_product_sku_format()
returns table(prefix text, minimum_digits smallint) language sql security invoker set search_path = ''
as $$ select * from app_private.get_product_sku_format() $$;
create or replace function public.set_product_sku_format(p_prefix text, p_minimum_digits smallint)
returns void language sql security invoker set search_path = ''
as $$ select app_private.set_product_sku_format(p_prefix, p_minimum_digits) $$;
create or replace function public.create_walk_in_order(p_items jsonb, p_customer_name text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.create_walk_in_order(p_items, p_customer_name) $$;
revoke all on function public.create_product_draft(text, text), public.publish_product(text),
  public.archive_product(text), public.set_product_heritage_required(text, boolean),
  public.set_product_featured(text, boolean),
  public.record_product_stock_movement(text, text, integer, text, text), public.delete_product(text),
  public.set_product_primary_image(uuid), public.get_product_sku_format(),
  public.set_product_sku_format(text, smallint), public.create_walk_in_order(jsonb, text) from public, anon;
grant execute on function public.create_product_draft(text, text), public.publish_product(text),
  public.archive_product(text), public.set_product_heritage_required(text, boolean),
  public.set_product_featured(text, boolean),
  public.record_product_stock_movement(text, text, integer, text, text), public.delete_product(text),
  public.set_product_primary_image(uuid), public.get_product_sku_format(),
  public.set_product_sku_format(text, smallint), public.create_walk_in_order(jsonb, text) to authenticated;

commit;
