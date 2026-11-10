-- Customer-owned records and authoritative storefront ordering.
-- Run in the AKP_native Supabase SQL Editor after akp_admin_schema.sql.
-- Platform encryption at rest is provided by Supabase; RLS limits each
-- authenticated customer to their own rows. Order writes go through the RPC.

begin;

alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists customers_auth_user_id_unique
  on public.customers(auth_user_id) where auth_user_id is not null;

-- Backfill only an unambiguous email match. Auth metadata is not an authority.
update public.customers c
set auth_user_id = u.id
from auth.users u
where c.auth_user_id is null
  and c.email is not null
  and lower(c.email) = lower(u.email)
  and (select count(*) from public.customers c2 where lower(c2.email) = lower(c.email)) = 1
  and (select count(*) from auth.users u2 where lower(u2.email) = lower(u.email)) = 1;

alter table public.orders
  add column if not exists client_order_key text,
  add column if not exists payment_method text,
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'rejected', 'refunded', 'failed')),
  add column if not exists delivery_address jsonb;
alter table public.customer_addresses
  add column if not exists country text not null default 'Philippines',
  add column if not exists landmark text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
create unique index if not exists orders_customer_client_key_unique
  on public.orders(customer_id, client_order_key)
  where client_order_key is not null;
create index if not exists customers_auth_user_id_idx
  on public.customers(auth_user_id) where auth_user_id is not null;

drop policy if exists customers_read_own_profile on public.customers;
create policy customers_read_own_profile on public.customers
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists customer_addresses_read_own on public.customer_addresses;
create policy customer_addresses_read_own on public.customer_addresses
  for select to authenticated
  using (exists (
    select 1 from public.customers c
    where c.id = customer_addresses.customer_id
      and c.auth_user_id = (select auth.uid())
  ));

drop policy if exists customer_orders_read_own on public.orders;
create policy customer_orders_read_own on public.orders
  for select to authenticated
  using (exists (
    select 1 from public.customers c
    where c.id = orders.customer_id
      and c.auth_user_id = (select auth.uid())
  ));

drop policy if exists customer_order_items_read_own on public.order_items;
create policy customer_order_items_read_own on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = order_items.order_id
      and c.auth_user_id = (select auth.uid())
  ));

drop policy if exists customer_payments_read_own on public.payments;
create policy customer_payments_read_own on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = payments.order_id
      and c.auth_user_id = (select auth.uid())
  ));

drop function if exists public.place_customer_order(text, jsonb, text, jsonb, text, text, text);
drop function if exists app_private.place_customer_order(text, jsonb, text, jsonb, text, text, text);
drop function if exists public.place_customer_order(text, jsonb, text, jsonb, text, text);
drop function if exists app_private.place_customer_order(text, jsonb, text, jsonb, text, text);
drop function if exists public.place_customer_order(text, jsonb, text, jsonb);
drop function if exists app_private.place_customer_order(text, jsonb, text, jsonb);

create or replace function app_private.place_customer_order(
  p_client_key text,
  p_items jsonb,
  p_payment_method text,
  p_delivery jsonb,
  p_payment_reference text default null,
  p_receipt_path text default null,
  p_fulfillment_method text default 'delivery'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_customer_id uuid;
  v_address_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_product record;
  v_quantity integer;
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 60.00;
  v_total numeric(12,2);
  v_payment_method text;
  v_payment_reference text := nullif(trim(p_payment_reference), '');
  v_receipt_path text := nullif(trim(p_receipt_path), '');
begin
  if v_uid is null then
    raise exception 'Sign in before placing an order.' using errcode = '28000';
  end if;
  if p_client_key is null or length(trim(p_client_key)) < 8 or length(p_client_key) > 100 then
    raise exception 'Invalid order request key.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 50 then
    raise exception 'Your cart is empty or has too many items.' using errcode = '22023';
  end if;
  if p_fulfillment_method not in ('delivery', 'pickup') then
    raise exception 'Unsupported order type.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_delivery) <> 'object'
    or nullif(trim(p_delivery->>'name'), '') is null
    or nullif(trim(p_delivery->>'contact'), '') is null then
    raise exception 'Enter your name and contact information.' using errcode = '22023';
  end if;
  if p_fulfillment_method = 'delivery' and (
    nullif(trim(p_delivery->>'street'), '') is null
    or nullif(trim(p_delivery->>'city'), '') is null
    or coalesce(p_delivery->>'latitude', '') !~ '^-?([0-9]+\.?[0-9]*|\.[0-9]+)$'
    or coalesce(p_delivery->>'longitude', '') !~ '^-?([0-9]+\.?[0-9]*|\.[0-9]+)$'
  ) then
    raise exception 'Complete your delivery address and select a map pin.' using errcode = '22023';
  end if;
  if p_fulfillment_method = 'delivery' and (
    (p_delivery->>'latitude')::double precision not between -90 and 90
    or (p_delivery->>'longitude')::double precision not between -180 and 180
  ) then
    raise exception 'Invalid delivery map pin.' using errcode = '22023';
  end if;
  if p_fulfillment_method = 'pickup' then
    v_delivery_fee := 0;
  end if;
  if p_payment_method not in ('GCash', 'Cash on delivery') then
    raise exception 'Unsupported payment method.' using errcode = '22023';
  end if;
  if p_payment_method = 'GCash' and v_payment_reference is null and v_receipt_path is null then
    raise exception 'Provide a GCash reference ID or payment screenshot.' using errcode = '22023';
  end if;
  if v_receipt_path is not null and (p_payment_method <> 'GCash' or v_receipt_path !~ ('^' || v_uid::text || '/checkout-[a-zA-Z0-9-]+/receipt\.(jpg|png|webp)$')) then
    raise exception 'Invalid payment screenshot path.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text || ':' || p_client_key, 0)
  );

  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is null then
    raise exception 'Customer account email is unavailable.' using errcode = '28000';
  end if;

  select c.id into v_customer_id from public.customers c where c.auth_user_id = v_uid for update;
  if v_customer_id is null then
    update public.customers c
    set auth_user_id = v_uid,
        name = trim(p_delivery->>'name'),
        email = v_email,
        phone = trim(p_delivery->>'contact'),
        updated_at = now()
    where c.auth_user_id is null and lower(c.email) = lower(v_email)
      and (select count(*) from public.customers c2 where lower(c2.email) = lower(v_email)) = 1
    returning c.id into v_customer_id;
  else
    update public.customers c
    set name = trim(p_delivery->>'name'), email = v_email,
        phone = trim(p_delivery->>'contact'), updated_at = now()
    where c.id = v_customer_id;
  end if;
  if v_customer_id is null then
    insert into public.customers(auth_user_id, name, email, phone)
    values (v_uid, trim(p_delivery->>'name'), v_email, trim(p_delivery->>'contact'))
    returning id into v_customer_id;
  end if;

  select o.id, o.order_number into v_order_id, v_order_number
  from public.orders o
  where o.customer_id = v_customer_id and o.client_order_key = p_client_key;
  if v_order_id is not null then
    return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'replayed', true);
  end if;

  if p_fulfillment_method = 'delivery' then
    update public.customer_addresses set is_default = false where customer_id = v_customer_id and is_default;
    insert into public.customer_addresses
      (customer_id, recipient_name, phone, address_line, barangay, city, province, postal_code, country, latitude, longitude, is_default)
    values (
      v_customer_id, trim(p_delivery->>'name'), trim(p_delivery->>'contact'),
      trim(p_delivery->>'street'), nullif(trim(p_delivery->>'barangay'), ''),
      trim(p_delivery->>'city'), nullif(trim(p_delivery->>'province'), ''),
      nullif(trim(p_delivery->>'postal'), ''), coalesce(nullif(trim(p_delivery->>'country'), ''), 'Philippines'),
      (p_delivery->>'latitude')::double precision, (p_delivery->>'longitude')::double precision, true
    ) returning id into v_address_id;
  end if;

  v_payment_method := p_payment_method;
  v_order_id := gen_random_uuid();
  v_order_number := 'AKP-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.orders
    (id, order_number, customer_id, delivery_address_id, status, fulfillment_method,
     subtotal, delivery_fee, total_amount, client_order_key, payment_method,
     payment_status, delivery_address)
  values
    (v_order_id, v_order_number, v_customer_id, v_address_id, 'pending', p_fulfillment_method,
     0, v_delivery_fee, v_delivery_fee, p_client_key, v_payment_method,
     'pending', case when p_fulfillment_method = 'delivery' then p_delivery else null end);

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or nullif(trim(v_item->>'sku'), '') is null
      or (v_item->>'quantity') !~ '^[1-9][0-9]*$' then
      raise exception 'Invalid item in cart.' using errcode = '22023';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity > 99 then
      raise exception 'Item quantity exceeds the limit.' using errcode = '22023';
    end if;

    select p.id, p.sku, p.name, p.price, p.stock_quantity
    into v_product
    from public.products p
    where p.sku = trim(v_item->>'sku') and p.visibility = 'published'
    for update;
    if not found then
      raise exception 'A product in your cart is no longer available.' using errcode = 'P0002';
    end if;
    if v_product.stock_quantity < v_quantity then
      raise exception 'Insufficient stock for %.', v_product.name using errcode = '23514';
    end if;

    insert into public.order_items(order_id, product_id, product_name, sku, quantity, unit_price)
    values (v_order_id, v_product.id, v_product.name, v_product.sku, v_quantity, v_product.price);
    v_subtotal := v_subtotal + v_product.price * v_quantity;
  end loop;

  v_total := v_subtotal + v_delivery_fee;
  update public.orders
  set subtotal = v_subtotal, total_amount = v_total
  where id = v_order_id;

  insert into public.payments(order_id, method, amount, status, reference, receipt_url)
  values (v_order_id, v_payment_method, v_total, 'pending', v_payment_reference, v_receipt_path);

  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'replayed', false);
end;
$$;

revoke all on function app_private.place_customer_order(text, jsonb, text, jsonb, text, text, text) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.place_customer_order(text, jsonb, text, jsonb, text, text, text) to authenticated;

create or replace function public.place_customer_order(
  p_client_key text,
  p_items jsonb,
  p_payment_method text,
  p_delivery jsonb,
  p_payment_reference text default null,
  p_receipt_path text default null,
  p_fulfillment_method text default 'delivery'
) returns jsonb
language sql
volatile
set search_path = ''
as $$
  select app_private.place_customer_order(p_client_key, p_items, p_payment_method, p_delivery, p_payment_reference, p_receipt_path, p_fulfillment_method)
$$;
revoke all on function public.place_customer_order(text, jsonb, text, jsonb, text, text, text) from public, anon;
grant execute on function public.place_customer_order(text, jsonb, text, jsonb, text, text, text) to authenticated;

create or replace function app_private.cancel_customer_order(p_order_number text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in before cancelling an order.' using errcode = '28000';
  end if;
  update public.orders o
  set status = 'cancelled'
  from public.customers c
  where o.customer_id = c.id
    and c.auth_user_id = v_uid
    and o.order_number = p_order_number
    and o.status = 'pending'
  returning o.id into v_order_id;
  if v_order_id is null then
    raise exception 'This order cannot be cancelled.' using errcode = 'P0002';
  end if;
  update public.payments
  set status = 'failed'
  where order_id = v_order_id and status = 'pending';
  return true;
end;
$$;
revoke all on function app_private.cancel_customer_order(text) from public, anon;
grant execute on function app_private.cancel_customer_order(text) to authenticated;

create or replace function public.cancel_customer_order(p_order_number text)
returns boolean
language sql
volatile
set search_path = ''
as $$
  select app_private.cancel_customer_order(p_order_number)
$$;
revoke all on function public.cancel_customer_order(text) from public, anon;
grant execute on function public.cancel_customer_order(text) to authenticated;

create or replace function public.save_customer_address(
  p_address_id uuid,
  p_recipient_name text,
  p_phone text,
  p_address_line text,
  p_barangay text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_country text,
  p_latitude double precision,
  p_longitude double precision,
  p_is_default boolean
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_customer_id uuid;
  v_address_id uuid;
  v_make_default boolean;
begin
  if v_uid is null then raise exception 'Sign in to save an address.' using errcode = '28000'; end if;
  if nullif(trim(p_recipient_name), '') is null or nullif(trim(p_address_line), '') is null
    or nullif(trim(p_city), '') is null or nullif(trim(p_country), '') is null then
    raise exception 'Enter a name, street address, city, and country.' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Select a valid map pin for this address.' using errcode = '22023';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is null then raise exception 'Customer account email is unavailable.' using errcode = '28000'; end if;
  select c.id into v_customer_id from public.customers c where c.auth_user_id = v_uid for update;
  if v_customer_id is null then
    update public.customers c set auth_user_id = v_uid, updated_at = now()
    where c.auth_user_id is null and lower(c.email) = lower(v_email)
      and (select count(*) from public.customers c2 where lower(c2.email) = lower(v_email)) = 1
    returning c.id into v_customer_id;
  end if;
  if v_customer_id is null then
    insert into public.customers(auth_user_id, name, email, phone)
    values (v_uid, trim(p_recipient_name), v_email, nullif(trim(p_phone), ''))
    returning id into v_customer_id;
  end if;

  if p_address_id is not null then
    select a.id into v_address_id from public.customer_addresses a
    where a.id = p_address_id and a.customer_id = v_customer_id for update;
    if v_address_id is null then raise exception 'Address not found.' using errcode = 'P0002'; end if;
  end if;
  v_make_default := coalesce(p_is_default, false) or p_address_id is null
    and not exists (select 1 from public.customer_addresses a where a.customer_id = v_customer_id);
  if v_make_default then
    update public.customer_addresses set is_default = false where customer_id = v_customer_id and is_default;
  end if;

  if p_address_id is null then
    insert into public.customer_addresses
      (customer_id, recipient_name, phone, address_line, barangay, city, province, postal_code, country, latitude, longitude, is_default)
    values
      (v_customer_id, trim(p_recipient_name), nullif(trim(p_phone), ''), trim(p_address_line), nullif(trim(p_barangay), ''),
       trim(p_city), nullif(trim(p_province), ''), nullif(trim(p_postal_code), ''), trim(p_country), p_latitude, p_longitude, v_make_default)
    returning id into v_address_id;
  else
    update public.customer_addresses set
      recipient_name = trim(p_recipient_name), phone = nullif(trim(p_phone), ''), address_line = trim(p_address_line),
      barangay = nullif(trim(p_barangay), ''), city = trim(p_city), province = nullif(trim(p_province), ''),
      postal_code = nullif(trim(p_postal_code), ''), country = trim(p_country), latitude = p_latitude,
      longitude = p_longitude, is_default = case when v_make_default then true else is_default end
    where id = v_address_id and customer_id = v_customer_id;
  end if;
  return v_address_id;
end;
$$;
revoke all on function public.save_customer_address(uuid, text, text, text, text, text, text, text, text, double precision, double precision, boolean) from public, anon;
grant execute on function public.save_customer_address(uuid, text, text, text, text, text, text, text, text, double precision, double precision, boolean) to authenticated;

-- Landmark-aware wrapper preserves the existing owner checks and address handling.
create or replace function public.save_customer_address_with_landmark(
  p_address_id uuid,
  p_recipient_name text,
  p_phone text,
  p_address_line text,
  p_landmark text,
  p_barangay text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_country text,
  p_latitude double precision,
  p_longitude double precision,
  p_is_default boolean
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_address_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to save an address.' using errcode = '28000'; end if;
  v_address_id := public.save_customer_address(
    p_address_id, p_recipient_name, p_phone, p_address_line, p_barangay, p_city,
    p_province, p_postal_code, p_country, p_latitude, p_longitude, p_is_default
  );
  update public.customer_addresses a
  set landmark = nullif(trim(p_landmark), '')
  where a.id = v_address_id
    and a.customer_id = (select c.id from public.customers c where c.auth_user_id = v_uid);
  if not found then raise exception 'Address not found.' using errcode = 'P0002'; end if;
  return v_address_id;
end;
$$;
revoke all on function public.save_customer_address_with_landmark(uuid, text, text, text, text, text, text, text, text, text, double precision, double precision, boolean) from public, anon;
grant execute on function public.save_customer_address_with_landmark(uuid, text, text, text, text, text, text, text, text, text, double precision, double precision, boolean) to authenticated;

create or replace function public.set_default_customer_address(p_address_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_customer_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to manage addresses.' using errcode = '28000'; end if;
  select c.id into v_customer_id from public.customers c where c.auth_user_id = v_uid;
  if v_customer_id is null or not exists (select 1 from public.customer_addresses a where a.id = p_address_id and a.customer_id = v_customer_id) then
    raise exception 'Address not found.' using errcode = 'P0002';
  end if;
  update public.customer_addresses set is_default = (id = p_address_id) where customer_id = v_customer_id;
  return true;
end;
$$;
revoke all on function public.set_default_customer_address(uuid) from public, anon;
grant execute on function public.set_default_customer_address(uuid) to authenticated;

create or replace function public.delete_customer_address(p_address_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_customer_id uuid;
  v_was_default boolean;
begin
  if v_uid is null then raise exception 'Sign in to manage addresses.' using errcode = '28000'; end if;
  select c.id into v_customer_id from public.customers c where c.auth_user_id = v_uid;
  if v_customer_id is null then raise exception 'Address not found.' using errcode = 'P0002'; end if;
  delete from public.customer_addresses a where a.id = p_address_id and a.customer_id = v_customer_id and a.is_default
  returning true into v_was_default;
  if not coalesce(v_was_default, false) then
    delete from public.customer_addresses a where a.id = p_address_id and a.customer_id = v_customer_id;
    if not found then raise exception 'Address not found.' using errcode = 'P0002'; end if;
  else
    update public.customer_addresses set is_default = true
    where id = (select a.id from public.customer_addresses a where a.customer_id = v_customer_id order by a.created_at, a.id limit 1);
  end if;
  return true;
end;
$$;
revoke all on function public.delete_customer_address(uuid) from public, anon;
grant execute on function public.delete_customer_address(uuid) to authenticated;

-- Keep checkout orders pending without reserving stock. Deduct only when an
-- authorized admin accepts the order by moving it from pending to processing.
create or replace function app_private.apply_order_inventory_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  v_already_deducted integer;
  v_to_deduct integer;
begin
  if old.status = 'pending' and new.status = 'processing' then
    for item in
      select oi.product_id, sum(oi.quantity)::integer as quantity
      from public.order_items oi
      where oi.order_id = new.id and oi.product_id is not null
      group by oi.product_id
      order by oi.product_id
    loop
      select coalesce(sum(-im.quantity_delta), 0)::integer
      into v_already_deducted
      from public.inventory_movements im
      where im.reference_id = new.id
        and im.product_id = item.product_id
        and im.movement_type = 'sale';

      v_to_deduct := item.quantity - v_already_deducted;
      if v_to_deduct > 0 then
        insert into public.inventory_movements
          (product_id, movement_type, quantity_delta, reason, reference_id)
        values
          (item.product_id, 'sale', -v_to_deduct, 'Accepted order ' || new.order_number, new.id);
      end if;
    end loop;
  elsif old.status in ('pending', 'processing') and new.status = 'cancelled' then
    for item in
      select im.product_id, sum(-im.quantity_delta)::integer as quantity
      from public.inventory_movements im
      where im.reference_id = new.id and im.movement_type = 'sale'
      group by im.product_id
      order by im.product_id
    loop
      if item.quantity > 0 then
        insert into public.inventory_movements
          (product_id, movement_type, quantity_delta, reason, reference_id)
        values
          (item.product_id, 'restock', item.quantity, 'Cancelled accepted order ' || new.order_number, new.id);
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function app_private.apply_order_inventory_transition() from public, anon, authenticated;
drop trigger if exists orders_apply_inventory_transition on public.orders;
create trigger orders_apply_inventory_transition
  before update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function app_private.apply_order_inventory_transition();

-- Private customer payment screenshots. The existing gcash-payment bucket is the public receiver QR only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-payment-proofs', 'customer-payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists customer_payment_proofs_insert_own on storage.objects;
create policy customer_payment_proofs_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'customer-payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists customer_payment_proofs_read_own on storage.objects;
create policy customer_payment_proofs_read_own on storage.objects for select to authenticated
using (bucket_id = 'customer-payment-proofs' and ((storage.foldername(name))[1] = (select auth.uid())::text or exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.is_active and a.role in ('owner','staff'))));
drop policy if exists customer_payment_proofs_update_own on storage.objects;
create policy customer_payment_proofs_update_own on storage.objects for update to authenticated
using (bucket_id = 'customer-payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'customer-payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

notify pgrst, 'reload schema';
commit;
