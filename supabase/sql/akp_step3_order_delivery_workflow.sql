-- Step 3 foundation: auditable order events and driver self-selection.
-- Run after admin/customer/driver setup and akp_customer_refunds.sql.
-- The available-order RPC returns only a delivery area; full customer details remain
-- protected by the existing assigned-driver RLS policies until an order is claimed.

begin;

do $$
begin
  if to_regclass('public.orders') is null
    or to_regclass('public.delivery_personnel') is null
    or to_regclass('public.order_items') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.return_requests') is null
    or to_regprocedure('app_private.current_admin_role()') is null
    or to_regprocedure('app_private.driver_claim_profile()') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'return_requests' and column_name = 'refund_amount'
    ) then
    raise exception 'Apply the AKP admin schema, customer orders, driver app, and customer refunds SQL before Step 3.';
  end if;
end
$$;

alter table public.orders
  add column if not exists delivery_claimed_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists out_for_delivery_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cod_collected_at timestamptz,
  add column if not exists cod_collected_by uuid references public.delivery_personnel(id) on delete set null,
  add column if not exists returned_at timestamptz,
  add column if not exists return_inspected_at timestamptz,
  add column if not exists return_inspected_by uuid references public.admin_users(user_id) on delete set null,
  add column if not exists return_inspection_notes text,
  add column if not exists return_usable_items integer,
  add column if not exists return_damaged_items integer,
  add column if not exists return_missing_items integer;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'accepted', 'processing', 'shipped', 'delivered', 'cancelled'));

alter table public.payments
  add column if not exists decision_reason text;

update public.payments
set decision_reason = 'Legacy rejected payment; original decision reason was not recorded.'
where status = 'rejected' and decision_reason is null;

alter table public.payments drop constraint if exists payments_rejected_reason_required;
alter table public.payments add constraint payments_rejected_reason_required
  check (status <> 'rejected' or nullif(pg_catalog.btrim(decision_reason), '') is not null);

alter table public.orders drop constraint if exists orders_return_inspection_counts_check;
alter table public.orders add constraint orders_return_inspection_counts_check check (
  (return_usable_items is null or return_usable_items >= 0)
  and (return_damaged_items is null or return_damaged_items >= 0)
  and (return_missing_items is null or return_missing_items >= 0)
  and (
    return_inspected_at is null
    or (return_inspected_by is not null and return_inspection_notes is not null
      and return_usable_items is not null and return_damaged_items is not null and return_missing_items is not null)
  )
);

alter table public.orders drop constraint if exists orders_delivery_status_check;
alter table public.orders add constraint orders_delivery_status_check
  check (delivery_status in ('ready_for_pickup', 'assigned', 'picked_up', 'out_for_delivery', 'arrived', 'delivered', 'attempted', 'failed', 'returned'));

update public.orders
set delivery_status = 'ready_for_pickup'
where fulfillment_method = 'delivery'
  and status = 'shipped'
  and delivery_personnel_id is null
  and delivery_status = 'assigned';

create or replace function app_private.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_status is distinct from old.payment_status
    and coalesce(current_setting('akp.order_payment_sync', true), '') <> 'allowed' then
    raise exception 'Payment status must be changed through a verified payment record.' using errcode = '42501';
  end if;

  if new.cod_collected_at is distinct from old.cod_collected_at
    or new.cod_collected_by is distinct from old.cod_collected_by then
    if coalesce(current_setting('akp.cod_collection_order', true), '') <> new.id::text then
      raise exception 'Cash collection must be recorded by the assigned driver workflow.' using errcode = '42501';
    end if;
  end if;

  if new.return_inspected_at is distinct from old.return_inspected_at
    or new.return_inspection_notes is distinct from old.return_inspection_notes
    or new.return_usable_items is distinct from old.return_usable_items
    or new.return_damaged_items is distinct from old.return_damaged_items
    or new.return_missing_items is distinct from old.return_missing_items then
    if old.delivery_status <> 'returned'
      or coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff')
      or new.return_inspected_by is distinct from (select auth.uid())
      or nullif(pg_catalog.btrim(new.return_inspection_notes), '') is null then
      raise exception 'Only an authorized staff member can record an inspection for a returned order.' using errcode = '42501';
    end if;
    if coalesce(new.return_usable_items, -1) + coalesce(new.return_damaged_items, -1) + coalesce(new.return_missing_items, -1)
      <> (select coalesce(sum(oi.quantity), 0) from public.order_items oi where oi.order_id = new.id) then
      raise exception 'Inspection counts must account for all ordered units.' using errcode = '22023';
    end if;
  end if;

  if new.status = old.status then return new; end if;

  if old.status = 'pending' and new.status = 'accepted' then
    if lower(coalesce(new.payment_method, '')) like '%gcash%' and new.payment_status <> 'paid' then
      raise exception 'Confirm GCash payment before accepting the order.' using errcode = 'check_violation';
    end if;
  elsif old.status = 'accepted' and new.status = 'processing' then
    null;
  elsif old.status = 'pending' and new.status = 'cancelled' then
    null;
  elsif old.status = 'accepted' and new.status = 'cancelled' then
    null;
  elsif old.status = 'processing' and new.status = 'shipped' then
    if new.fulfillment_method = 'delivery'
      and (new.delivery_status <> 'ready_for_pickup' or new.delivery_personnel_id is not null) then
      raise exception 'Delivery orders must be marked ready before a driver can claim them.' using errcode = 'check_violation';
    end if;
  elsif old.status = 'processing' and new.status = 'cancelled' then
    null;
  elsif old.status = 'shipped' and new.status = 'cancelled'
    and old.delivery_status = 'returned' and old.return_inspected_at is not null then
    if coalesce((select app_private.current_admin_role()), '') <> 'owner' then
      raise exception 'Only an owner can cancel an inspected returned delivery.' using errcode = '42501';
    end if;
    null;
  elsif old.status = 'shipped' and new.status = 'delivered' then
    if new.fulfillment_method = 'delivery' then
      if new.delivery_status <> 'delivered' or new.proof_path is null
        or not exists (
          select 1 from public.delivery_personnel d
          where d.id = new.delivery_personnel_id and d.auth_user_id = (select auth.uid())
        )
        or not exists (
          select 1 from storage.objects so
          where so.bucket_id = 'delivery-proofs' and so.name = new.proof_path
        ) then
        raise exception 'Only the assigned driver can complete delivery with uploaded photo proof.' using errcode = '42501';
      end if;
    end if;
  else
    raise exception 'Invalid order status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status = 'cancelled' and nullif(pg_catalog.btrim(new.cancellation_reason), '') is null then
    raise exception 'A cancellation reason is required.' using errcode = '22023';
  end if;
  if new.status = 'delivered' then new.delivered_at = coalesce(new.delivered_at, pg_catalog.now()); end if;
  if new.status = 'cancelled' then new.cancelled_at = coalesce(new.cancelled_at, pg_catalog.now()); end if;
  new.updated_at = pg_catalog.now();
  return new;
end
$$;
revoke all on function app_private.enforce_order_status_transition() from public, anon, authenticated;

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
  if old.status = 'pending' and new.status = 'accepted' then
    movement_type := 'sale';
    reason_text := 'Accepted order ' || new.order_number;
  elsif old.status = 'pending' and new.status = 'cancelled' then
    movement_type := 'release';
    reason_text := 'Released cancelled order ' || new.order_number;
  else
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
        updated_at = pg_catalog.now()
    where order_id = reservation.order_id and product_sku = reservation.product_sku and status = 'reserved';
  end loop;
  return new;
end
$$;
revoke all on function app_private.apply_order_inventory_transition() from public, anon, authenticated;

create or replace function app_private.sync_order_payment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_order_status text;
begin
  select p.status into v_status
  from public.payments p
  where p.order_id = new.order_id
  order by p.created_at desc, p.id desc
  limit 1;
  v_order_status := case v_status
    when 'verified' then 'paid'
    when 'partially_refunded' then 'partially_refunded'
    when 'rejected' then 'rejected'
    when 'refunded' then 'refunded'
    when 'failed' then 'failed'
    when 'pending' then 'pending'
    else null
  end;
  if v_order_status is not null then
    perform pg_catalog.set_config('akp.order_payment_sync', 'allowed', true);
    update public.orders set payment_status = v_order_status
    where id = new.order_id and payment_status is distinct from v_order_status;
    perform pg_catalog.set_config('akp.order_payment_sync', '', true);
  end if;
  return new;
end
$$;
revoke all on function app_private.sync_order_payment_status() from public, anon, authenticated;

create or replace function app_private.prevent_uncollected_cod_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if lower(coalesce(new.method, '')) in ('cod', 'cash on delivery') and new.status = 'verified' then
    select o.* into v_order from public.orders o where o.id = new.order_id for update;
    if v_order.fulfillment_method = 'delivery'
      and (v_order.cod_collected_at is null or v_order.cod_collected_by is null
        or coalesce(current_setting('akp.cod_collection_order', true), '') <> v_order.id::text) then
      raise exception 'A delivery COD payment can be marked paid only by the assigned driver after cash is collected.' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
revoke all on function app_private.prevent_uncollected_cod_payment() from public, anon, authenticated;
drop trigger if exists payments_require_cod_collection on public.payments;
create trigger payments_require_cod_collection
  before insert or update on public.payments
  for each row execute function app_private.prevent_uncollected_cod_payment();

drop function if exists public.cancel_customer_order(text);
drop function if exists app_private.cancel_customer_order(text);
create or replace function app_private.cancel_customer_order(p_order_number text, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order_id uuid;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
begin
  if v_uid is null then raise exception 'Sign in before cancelling an order.' using errcode = '28000'; end if;
  if v_reason is null or pg_catalog.length(v_reason) > 500 then
    raise exception 'Enter a cancellation reason of 1 to 500 characters.' using errcode = '22023';
  end if;
  update public.orders o
  set status = 'cancelled', cancellation_reason = v_reason
  from public.customers c
  where o.customer_id = c.id and c.auth_user_id = v_uid
    and o.order_number = p_order_number
    and o.status in ('pending', 'accepted', 'processing');
  if not found then
    raise exception 'This order has reached preparation cutoff or cannot be cancelled.' using errcode = 'P0002';
  end if;
  select o.id into v_order_id from public.orders o where o.order_number = p_order_number;
  update public.payments set status = 'failed'
  where order_id = v_order_id and status = 'pending';
  return true;
end
$$;
revoke all on function app_private.cancel_customer_order(text, text) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.cancel_customer_order(text, text) to authenticated;
create or replace function public.cancel_customer_order(p_order_number text, p_reason text default null)
returns boolean
language sql
volatile
set search_path = ''
as $$ select app_private.cancel_customer_order(p_order_number, p_reason) $$;
revoke all on function public.cancel_customer_order(text, text) from public, anon;
grant execute on function public.cancel_customer_order(text, text) to authenticated;

create index if not exists orders_available_delivery_idx
  on public.orders(created_at)
  where fulfillment_method = 'delivery'
    and status = 'shipped'
    and delivery_status = 'ready_for_pickup'
    and delivery_personnel_id is null;

create table if not exists public.order_activity (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null,
  description text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default 'System',
  reason text,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_activity_order_created_idx
  on public.order_activity(order_id, created_at, id);

alter table public.order_activity enable row level security;
revoke all on table public.order_activity from public, anon, authenticated;
grant select on table public.order_activity to authenticated;
drop policy if exists order_activity_read_authorized on public.order_activity;
create policy order_activity_read_authorized on public.order_activity
  for select to authenticated
  using (
    (select app_private.current_admin_role()) in ('owner', 'staff')
    or exists (
      select 1 from public.orders o
      join public.customers c on c.id = o.customer_id
      where o.id = order_activity.order_id and c.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.orders o
      join public.delivery_personnel d on d.id = o.delivery_personnel_id
      where o.id = order_activity.order_id and d.auth_user_id = (select auth.uid())
    )
  );

create or replace function app_private.prevent_order_activity_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Order activity is append-only' using errcode = '42501';
end
$$;
revoke all on function app_private.prevent_order_activity_mutation() from public, anon, authenticated;
drop trigger if exists order_activity_append_only on public.order_activity;
create trigger order_activity_append_only
  before update or delete on public.order_activity
  for each row execute function app_private.prevent_order_activity_mutation();

create or replace function app_private.record_order_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
  v_event_type text;
  v_description text;
  v_previous jsonb;
  v_current jsonb;
begin
  select coalesce(
    (select au.display_name from public.admin_users au where au.user_id = v_actor_id),
    (select d.name from public.delivery_personnel d where d.auth_user_id = v_actor_id),
    (select c.name from public.customers c where c.auth_user_id = v_actor_id),
    (select u.email from auth.users u where u.id = v_actor_id),
    'System'
  ) into v_actor_name;

  v_current := jsonb_build_object(
    'status', new.status,
    'payment_status', new.payment_status,
    'delivery_status', new.delivery_status,
    'delivery_personnel_id', new.delivery_personnel_id,
    'return_inspected_at', new.return_inspected_at,
    'return_usable_items', new.return_usable_items,
    'return_damaged_items', new.return_damaged_items,
    'return_missing_items', new.return_missing_items
  );

  if tg_op = 'INSERT' then
    insert into public.order_activity(order_id, event_type, description, actor_id, actor_name, new_state)
    values (new.id, 'order_created', 'Order created.', v_actor_id, v_actor_name, v_current);
    return new;
  end if;

  v_previous := jsonb_build_object(
    'status', old.status,
    'payment_status', old.payment_status,
    'delivery_status', old.delivery_status,
    'delivery_personnel_id', old.delivery_personnel_id,
    'return_inspected_at', old.return_inspected_at,
    'return_usable_items', old.return_usable_items,
    'return_damaged_items', old.return_damaged_items,
    'return_missing_items', old.return_missing_items
  );

  if old.status is distinct from new.status then
    v_event_type := case new.status
      when 'accepted' then 'order_accepted'
      when 'processing' then 'preparation_started'
      when 'shipped' then 'ready_for_pickup'
      when 'delivered' then 'order_delivered'
      when 'cancelled' then 'order_cancelled'
      else 'fulfillment_status_changed'
    end;
    v_description := 'Order status changed from ' || old.status || ' to ' || new.status || '.';
  elsif old.payment_status is distinct from new.payment_status then
    v_event_type := 'payment_status_changed';
    v_description := 'Payment status changed from ' || old.payment_status || ' to ' || new.payment_status || '.';
  elsif old.delivery_status = 'returned' and new.delivery_status = 'ready_for_pickup' then
    v_event_type := 'return_reopened';
    v_description := 'Inspected order returned to the available driver pool.';
  elsif old.delivery_personnel_id is distinct from new.delivery_personnel_id then
    v_event_type := case when new.delivery_personnel_id is null then 'driver_unassigned' else 'driver_claimed' end;
    v_description := case when new.delivery_personnel_id is null then 'Driver assignment removed.' else 'Driver claimed the delivery.' end;
  elsif old.delivery_status is distinct from new.delivery_status then
    v_event_type := 'delivery_status_changed';
    v_description := 'Delivery status changed from ' || old.delivery_status || ' to ' || new.delivery_status || '.';
  elsif old.return_inspected_at is distinct from new.return_inspected_at
    or old.return_inspection_notes is distinct from new.return_inspection_notes
    or old.return_usable_items is distinct from new.return_usable_items
    or old.return_damaged_items is distinct from new.return_damaged_items
    or old.return_missing_items is distinct from new.return_missing_items then
    v_event_type := 'return_inspected';
    v_description := 'Returned items inspected: ' || new.return_usable_items || ' usable, '
      || new.return_damaged_items || ' damaged, ' || new.return_missing_items || ' missing.';
  else
    return new;
  end if;

  insert into public.order_activity(
    order_id, event_type, description, actor_id, actor_name, reason, previous_state, new_state
  ) values (
    new.id, v_event_type, v_description, v_actor_id, v_actor_name,
    case
      when new.status = 'cancelled' then new.cancellation_reason
      when new.delivery_status in ('attempted', 'failed') then new.delivery_remarks
      when v_event_type = 'return_inspected' then new.return_inspection_notes
      else null
    end,
    v_previous, v_current
  );
  return new;
end
$$;
revoke all on function app_private.record_order_activity() from public, anon, authenticated;
drop trigger if exists orders_record_activity on public.orders;
create trigger orders_record_activity
  after insert or update on public.orders
  for each row execute function app_private.record_order_activity();

create or replace function app_private.record_payment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
  v_order_number text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.reference is not distinct from new.reference
    and old.amount is not distinct from new.amount then return new; end if;
  select o.order_number into v_order_number from public.orders o where o.id = new.order_id;
  select coalesce(
    (select au.display_name from public.admin_users au where au.user_id = v_actor_id),
    (select d.name from public.delivery_personnel d where d.auth_user_id = v_actor_id),
    (select c.name from public.customers c where c.auth_user_id = v_actor_id),
    (select u.email from auth.users u where u.id = v_actor_id),
    'System'
  ) into v_actor_name;
  insert into public.order_activity(order_id, event_type, description, actor_id, actor_name, reason, previous_state, new_state)
  values (
    new.order_id,
    case when tg_op = 'INSERT' then 'payment_submitted' else 'payment_decision' end,
    case when tg_op = 'INSERT' then 'Payment submitted for order ' || coalesce(v_order_number, new.order_id::text) || '.'
      else 'Payment status changed from ' || old.status || ' to ' || new.status || '.' end,
    v_actor_id, v_actor_name, case when new.status = 'rejected' then new.decision_reason else new.reference end,
    case when tg_op = 'INSERT' then null else jsonb_build_object('status', old.status, 'amount', old.amount, 'reference', old.reference) end,
    jsonb_build_object('status', new.status, 'amount', new.amount, 'method', new.method, 'reference', new.reference)
  );
  return new;
end
$$;
revoke all on function app_private.record_payment_activity() from public, anon, authenticated;
drop trigger if exists payments_record_activity on public.payments;
create trigger payments_record_activity
  after insert or update on public.payments
  for each row execute function app_private.record_payment_activity();

create or replace function app_private.record_return_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.refund_amount is not distinct from new.refund_amount then return new; end if;
  select coalesce((select au.display_name from public.admin_users au where au.user_id = v_actor_id),
    (select c.name from public.customers c where c.auth_user_id = v_actor_id),
    (select u.email from auth.users u where u.id = v_actor_id), 'System') into v_actor_name;
  insert into public.order_activity(order_id, event_type, description, actor_id, actor_name, reason, previous_state, new_state)
  values (
    new.order_id,
    case when tg_op = 'INSERT' then 'return_requested' when old.refund_amount is distinct from new.refund_amount then 'refund_recorded' else 'return_decision' end,
    case when tg_op = 'INSERT' then 'Return request submitted.'
      when old.refund_amount is distinct from new.refund_amount then 'Completed refund recorded.'
      else 'Return request marked ' || new.status || '.' end,
    v_actor_id, v_actor_name, coalesce(new.decision_note, new.reason),
    case when tg_op = 'INSERT' then null else jsonb_build_object('status', old.status, 'refund_amount', old.refund_amount) end,
    jsonb_build_object('request_number', new.request_number, 'status', new.status, 'reason', new.reason,
      'refund_amount', new.refund_amount, 'refund_reference', new.refund_reference)
  );
  return new;
end
$$;
revoke all on function app_private.record_return_activity() from public, anon, authenticated;
drop trigger if exists return_requests_record_activity on public.return_requests;
create trigger return_requests_record_activity
  after insert or update on public.return_requests
  for each row execute function app_private.record_return_activity();

create or replace function public.driver_available_orders()
returns table(
  order_id uuid,
  order_number text,
  barangay text,
  city text,
  province text,
  item_count integer,
  total_amount numeric,
  ready_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_availability text;
begin
  select d.id, d.availability into v_driver_id, v_availability
  from public.delivery_personnel d
  where d.auth_user_id = (select auth.uid())
    and d.availability <> 'suspended'
  limit 1;
  if v_driver_id is null then
    raise exception 'An active driver profile is required.' using errcode = '42501';
  end if;
  if v_availability not in ('available', 'on_delivery') then return; end if;

  return query
  select o.id, o.order_number,
    nullif(o.delivery_address->>'barangay', ''),
    nullif(o.delivery_address->>'city', ''),
    nullif(o.delivery_address->>'province', ''),
    coalesce(sum(oi.quantity), 0)::integer,
    o.total_amount,
    o.updated_at
  from public.orders o
  left join public.order_items oi on oi.order_id = o.id
  where o.fulfillment_method = 'delivery'
    and o.status = 'shipped'
    and o.delivery_status = 'ready_for_pickup'
    and o.delivery_personnel_id is null
    and (
      lower(coalesce(o.payment_method, '')) in ('cod', 'cash on delivery')
      or (lower(coalesce(o.payment_method, '')) like '%gcash%' and o.payment_status = 'paid')
    )
  group by o.id
  order by o.updated_at, o.created_at;
end
$$;
revoke all on function public.driver_available_orders() from public, anon;
grant execute on function public.driver_available_orders() to authenticated;

create or replace function public.driver_claim_order(p_order_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_claimed_id uuid;
begin
  if p_order_id is null then
    raise exception 'Choose an available order.' using errcode = '22023';
  end if;

  select d.id into v_driver_id
  from public.delivery_personnel d
  where d.auth_user_id = (select auth.uid())
    and d.availability in ('available', 'on_delivery')
  for update;
  if v_driver_id is null then
    raise exception 'An active available driver profile is required.' using errcode = '42501';
  end if;

  update public.orders o
  set delivery_personnel_id = v_driver_id,
      delivery_status = 'assigned',
      delivery_claimed_at = pg_catalog.now()
  where o.id = p_order_id
    and o.fulfillment_method = 'delivery'
    and o.status = 'shipped'
    and o.delivery_status = 'ready_for_pickup'
    and o.delivery_personnel_id is null
    and (
      lower(coalesce(o.payment_method, '')) in ('cod', 'cash on delivery')
      or (lower(coalesce(o.payment_method, '')) like '%gcash%' and o.payment_status = 'paid')
    )
  returning o.id into v_claimed_id;

  if v_claimed_id is not null then return true; end if;
  if exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.delivery_personnel_id = v_driver_id
  ) then return true; end if;

  raise exception 'This order is no longer available to claim.' using errcode = '40001';
end
$$;
revoke all on function public.driver_claim_order(uuid) from public, anon;
grant execute on function public.driver_claim_order(uuid) to authenticated;

create or replace function app_private.requeue_returned_delivery(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select app_private.current_admin_role()), '');
  v_updated_id uuid;
begin
  if v_role <> 'owner' then raise exception 'Only an owner can retry an inspected returned delivery.' using errcode = '42501'; end if;
  update public.orders
  set delivery_status = 'ready_for_pickup',
      delivery_personnel_id = null,
      delivery_claimed_at = null
  where id = p_order_id
    and status = 'shipped'
    and delivery_status = 'returned'
    and return_inspected_at is not null
  returning id into v_updated_id;
  if v_updated_id is null then raise exception 'Inspect the returned order before retrying delivery.' using errcode = 'P0002'; end if;
  return true;
end
$$;
revoke all on function app_private.requeue_returned_delivery(uuid) from public, anon, authenticated;
grant execute on function app_private.requeue_returned_delivery(uuid) to authenticated;
create or replace function public.requeue_returned_delivery(p_order_id uuid)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$ select app_private.requeue_returned_delivery(p_order_id) $$;
revoke all on function public.requeue_returned_delivery(uuid) from public, anon;
grant execute on function public.requeue_returned_delivery(uuid) to authenticated;

-- Driver progress is validated and written in one database transaction.
drop function if exists public.driver_update_delivery(uuid, text, text, text, text);
drop function if exists app_private.driver_update_delivery(uuid, text, text, text, text);
create or replace function app_private.driver_update_delivery(
  p_order_id uuid,
  p_delivery_status text,
  p_proof_path text default null,
  p_recipient_name text default null,
  p_remarks text default null,
  p_cod_collected boolean default false
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_driver_id uuid;
  v_order public.orders%rowtype;
  v_proof_path text := nullif(pg_catalog.btrim(p_proof_path), '');
  v_remarks text := nullif(pg_catalog.btrim(p_remarks), '');
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select d.id into v_driver_id
  from public.delivery_personnel d
  where d.auth_user_id = v_uid and d.availability <> 'suspended'
  for update;
  if v_driver_id is null then raise exception 'Active driver profile not found.' using errcode = '42501'; end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id and o.delivery_personnel_id = v_driver_id
  for update;
  if not found or v_order.status in ('cancelled', 'delivered') then
    raise exception 'This order is not available for delivery updates.' using errcode = '42501';
  end if;
  if not (
    (v_order.delivery_status = 'assigned' and p_delivery_status = 'picked_up') or
    (v_order.delivery_status = 'picked_up' and p_delivery_status = 'out_for_delivery') or
    (v_order.delivery_status = 'out_for_delivery' and p_delivery_status in ('arrived', 'attempted', 'failed')) or
    (v_order.delivery_status = 'arrived' and p_delivery_status in ('delivered', 'attempted', 'failed')) or
    (v_order.delivery_status = 'attempted' and p_delivery_status in ('out_for_delivery', 'failed')) or
    (v_order.delivery_status = 'failed' and p_delivery_status = 'returned')
  ) then
    raise exception 'Invalid delivery status change.' using errcode = 'check_violation';
  end if;
  if p_delivery_status in ('attempted', 'failed') and v_remarks is null then
    raise exception 'Add a reason for the failed delivery attempt.' using errcode = '22023';
  end if;
  if p_delivery_status = 'delivered' then
    if v_proof_path is null or v_proof_path !~ ('^' || v_uid::text || '/' || p_order_id::text || '/[A-Za-z0-9-]+\.jpg$') then
      raise exception 'A delivery proof photo is required.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from storage.objects so where so.bucket_id = 'delivery-proofs' and so.name = v_proof_path) then
      raise exception 'Delivery proof photo was not uploaded.' using errcode = 'check_violation';
    end if;
    if lower(pg_catalog.replace(pg_catalog.btrim(coalesce(v_order.payment_method, '')), '_', ' ')) in ('cod', 'cash on delivery', 'cash')
      and p_cod_collected and v_order.cod_collected_at is null then
      perform pg_catalog.set_config('akp.cod_collection_order', v_order.id::text, true);
      update public.orders set cod_collected_at = pg_catalog.now(), cod_collected_by = v_driver_id where id = v_order.id;
      if not exists (
        select 1 from public.payments p
        where p.order_id = v_order.id
          and lower(pg_catalog.replace(pg_catalog.btrim(coalesce(p.method, '')), '_', ' ')) in ('cod', 'cash on delivery', 'cash')
          and p.status = 'pending'
      ) then
        perform pg_catalog.set_config('akp.cod_collection_order', '', true);
        raise exception 'No pending COD payment record was found; delivery was not completed.' using errcode = 'P0002';
      end if;
      perform pg_catalog.set_config('akp.cod_collection_order', '', true);
    elsif p_cod_collected and lower(pg_catalog.replace(pg_catalog.btrim(coalesce(v_order.payment_method, '')), '_', ' ')) not in ('cod', 'cash on delivery', 'cash') then
      raise exception 'Cash collection can only be recorded for COD orders.' using errcode = '22023';
    end if;
  elsif p_cod_collected then
    raise exception 'Record COD collection when completing the delivery.' using errcode = '22023';
  end if;
  if v_proof_path is not null and v_proof_path !~ ('^' || v_uid::text || '/' || p_order_id::text || '/[A-Za-z0-9-]+\.jpg$') then
    raise exception 'Invalid delivery proof path.' using errcode = 'check_violation';
  end if;

  update public.orders o
  set delivery_status = p_delivery_status,
      proof_path = coalesce(v_proof_path, o.proof_path),
      recipient_name = coalesce(nullif(pg_catalog.btrim(p_recipient_name), ''), o.recipient_name),
      delivery_remarks = coalesce(v_remarks, o.delivery_remarks),
      picked_up_at = case when p_delivery_status = 'picked_up' then pg_catalog.now() else o.picked_up_at end,
      out_for_delivery_at = case when p_delivery_status = 'out_for_delivery' then pg_catalog.now() else o.out_for_delivery_at end,
      returned_at = case when p_delivery_status = 'returned' then pg_catalog.now() else o.returned_at end
  where o.id = p_order_id;

  if p_delivery_status = 'delivered' then
    perform pg_catalog.set_config('akp.order_payment_sync', 'allowed', true);
    update public.orders set status = 'delivered' where id = p_order_id;
    perform pg_catalog.set_config('akp.order_payment_sync', '', true);
  end if;
  if p_delivery_status in ('picked_up', 'out_for_delivery') then
    update public.delivery_personnel set availability = 'on_delivery' where id = v_driver_id and availability <> 'suspended';
  elsif p_delivery_status in ('delivered', 'returned') and not exists (
    select 1 from public.orders o
    where o.delivery_personnel_id = v_driver_id
      and o.id <> p_order_id
      and o.delivery_status not in ('delivered', 'failed', 'returned')
      and o.status <> 'cancelled'
  ) then
    update public.delivery_personnel set availability = 'available' where id = v_driver_id and availability = 'on_delivery';
  end if;
  return true;
end
$$;
revoke all on function app_private.driver_update_delivery(uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function app_private.driver_update_delivery(uuid, text, text, text, text, boolean) to authenticated;
create or replace function public.driver_update_delivery(
  p_order_id uuid,
  p_delivery_status text,
  p_proof_path text default null,
  p_recipient_name text default null,
  p_remarks text default null,
  p_cod_collected boolean default false
) returns boolean
language sql
volatile
set search_path = ''
as $$ select app_private.driver_update_delivery(p_order_id, p_delivery_status, p_proof_path, p_recipient_name, p_remarks, p_cod_collected) $$;
revoke all on function public.driver_update_delivery(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.driver_update_delivery(uuid, text, text, text, text, boolean) to authenticated;

commit;
