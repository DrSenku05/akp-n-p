-- Driver app access. Run after akp_admin_schema.sql and akp_customer_orders.sql.
-- Drivers may read only their own profile and assigned orders. Delivery changes
-- go through a checked RPC; payment and order details remain admin-managed.

begin;

alter table public.orders
  add column if not exists delivery_status text not null default 'assigned',
  add column if not exists proof_path text,
  add column if not exists recipient_name text,
  add column if not exists delivery_remarks text;

alter table public.orders drop constraint if exists orders_delivery_status_check;
alter table public.orders add constraint orders_delivery_status_check
  check (delivery_status in ('assigned', 'picked_up', 'out_for_delivery', 'arrived', 'delivered', 'attempted', 'failed'));

update public.orders
set delivery_status = case
  when status = 'delivered' then 'delivered'
  when status = 'shipped' then 'out_for_delivery'
  else 'assigned'
end
where delivery_personnel_id is not null and delivery_status = 'assigned';

create index if not exists orders_driver_assignment_idx
  on public.orders(delivery_personnel_id, created_at desc)
  where delivery_personnel_id is not null;

drop policy if exists driver_read_own_profile on public.delivery_personnel;
create policy driver_read_own_profile on public.delivery_personnel
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists driver_read_assigned_orders on public.orders;
create policy driver_read_assigned_orders on public.orders
  for select to authenticated
  using (exists (
    select 1 from public.delivery_personnel d
    where d.id = orders.delivery_personnel_id
      and d.auth_user_id = (select auth.uid())
      and d.availability <> 'suspended'
  ));

drop policy if exists driver_read_assigned_order_items on public.order_items;
create policy driver_read_assigned_order_items on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    join public.delivery_personnel d on d.id = o.delivery_personnel_id
    where o.id = order_items.order_id
      and d.auth_user_id = (select auth.uid())
      and d.availability <> 'suspended'
  ));

drop policy if exists driver_read_announcements on public.announcements;
create policy driver_read_announcements on public.announcements
  for select to authenticated
  using (
    status = 'sent'
    and audience in ('all', 'staff')
    and exists (
      select 1 from public.delivery_personnel d
      where d.auth_user_id = (select auth.uid())
        and d.availability <> 'suspended'
    )
  );

create or replace function app_private.driver_claim_profile()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_driver_id uuid;
begin
  if v_uid is null then return false; end if;
  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then return false; end if;

  if exists (select 1 from public.delivery_personnel d where d.auth_user_id = v_uid) then
    return true;
  end if;
  if (select count(*) from public.delivery_personnel d where lower(d.email) = v_email and d.auth_user_id is null and d.availability <> 'suspended') <> 1 then
    return false;
  end if;
  update public.delivery_personnel d set auth_user_id = v_uid
  where lower(d.email) = v_email and d.auth_user_id is null and d.availability <> 'suspended'
  returning d.id into v_driver_id;
  return v_driver_id is not null or exists (
    select 1 from public.delivery_personnel d where d.auth_user_id = v_uid
  );
end
$$;
revoke all on function app_private.driver_claim_profile() from public, anon;
grant execute on function app_private.driver_claim_profile() to authenticated;

create or replace function public.driver_claim_profile()
returns boolean
language sql
volatile
set search_path = ''
as $$ select app_private.driver_claim_profile() $$;
revoke all on function public.driver_claim_profile() from public, anon;
grant execute on function public.driver_claim_profile() to authenticated;

create or replace function app_private.driver_set_availability(p_availability text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_driver_id uuid;
  v_availability text;
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if p_availability not in ('available', 'off_duty') then
    raise exception 'Choose Available or Off duty.' using errcode = '22023';
  end if;
  select d.id into v_driver_id
  from public.delivery_personnel d
  where d.auth_user_id = v_uid and d.availability <> 'suspended'
  for update;
  if v_driver_id is null then raise exception 'Active driver profile not found.' using errcode = '42501'; end if;

  if p_availability = 'off_duty' and exists (
    select 1 from public.orders o
    where o.delivery_personnel_id = v_driver_id
      and o.delivery_status not in ('delivered', 'failed')
      and o.status <> 'cancelled'
  ) then
    raise exception 'Finish or return active deliveries before going off duty.' using errcode = 'check_violation';
  end if;
  if p_availability = 'available' and exists (
    select 1 from public.orders o
    where o.delivery_personnel_id = v_driver_id
      and o.delivery_status not in ('delivered', 'failed')
      and o.status <> 'cancelled'
  ) then
    raise exception 'You have active deliveries and cannot switch to Available yet.' using errcode = 'check_violation';
  end if;
  update public.delivery_personnel d set availability = p_availability where d.id = v_driver_id;
  return p_availability;
end
$$;
revoke all on function app_private.driver_set_availability(text) from public, anon;
grant execute on function app_private.driver_set_availability(text) to authenticated;

create or replace function public.driver_set_availability(p_availability text)
returns text
language sql
volatile
set search_path = ''
as $$ select app_private.driver_set_availability(p_availability) $$;
revoke all on function public.driver_set_availability(text) from public, anon;
grant execute on function public.driver_set_availability(text) to authenticated;

create or replace function app_private.driver_update_delivery(
  p_order_id uuid,
  p_delivery_status text,
  p_proof_path text default null,
  p_recipient_name text default null,
  p_remarks text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_driver_id uuid;
  v_order public.orders%rowtype;
  v_proof_path text := nullif(trim(p_proof_path), '');
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
    (v_order.delivery_status = 'attempted' and p_delivery_status in ('out_for_delivery', 'failed'))
  ) then
    raise exception 'Invalid delivery status change.' using errcode = 'check_violation';
  end if;

  if p_delivery_status = 'delivered' then
    if v_proof_path is null or v_proof_path !~ ('^' || v_uid::text || '/' || p_order_id::text || '/[A-Za-z0-9-]+\.jpg$') then
      raise exception 'A delivery proof photo is required.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from storage.objects so where so.bucket_id = 'delivery-proofs' and so.name = v_proof_path) then
      raise exception 'Delivery proof photo was not uploaded.' using errcode = 'check_violation';
    end if;
  elsif v_proof_path is not null and v_proof_path !~ ('^' || v_uid::text || '/' || p_order_id::text || '/[A-Za-z0-9-]+\.jpg$') then
    raise exception 'Invalid delivery proof path.' using errcode = 'check_violation';
  end if;

  update public.orders o
  set delivery_status = p_delivery_status,
      proof_path = coalesce(v_proof_path, o.proof_path),
      recipient_name = nullif(trim(p_recipient_name), ''),
      delivery_remarks = nullif(trim(p_remarks), '')
  where o.id = p_order_id;

  if p_delivery_status in ('picked_up', 'out_for_delivery') then
    if p_delivery_status = 'out_for_delivery' then
      if v_order.status = 'pending' then
        update public.orders set status = 'processing' where id = p_order_id;
      end if;
      if v_order.status in ('pending', 'processing') then
        update public.orders set status = 'shipped' where id = p_order_id;
      end if;
    end if;
    update public.delivery_personnel set availability = 'on_delivery' where id = v_driver_id and availability <> 'suspended';
  elsif p_delivery_status = 'delivered' then
    if v_order.status in ('pending', 'processing') then
      if v_order.status = 'pending' then update public.orders set status = 'processing' where id = p_order_id; end if;
      update public.orders set status = 'shipped' where id = p_order_id;
    end if;
    update public.orders set status = 'delivered' where id = p_order_id;
    if not exists (
      select 1 from public.orders o
      where o.delivery_personnel_id = v_driver_id
        and o.id <> p_order_id
        and o.delivery_status not in ('delivered', 'failed')
        and o.status <> 'cancelled'
    ) then
      update public.delivery_personnel set availability = 'available' where id = v_driver_id and availability = 'on_delivery';
    end if;
  end if;
  return true;
end
$$;
revoke all on function app_private.driver_update_delivery(uuid, text, text, text, text) from public, anon;
grant execute on function app_private.driver_update_delivery(uuid, text, text, text, text) to authenticated;

create or replace function public.driver_update_delivery(
  p_order_id uuid,
  p_delivery_status text,
  p_proof_path text default null,
  p_recipient_name text default null,
  p_remarks text default null
) returns boolean
language sql
volatile
set search_path = ''
as $$ select app_private.driver_update_delivery(p_order_id, p_delivery_status, p_proof_path, p_recipient_name, p_remarks) $$;
revoke all on function public.driver_update_delivery(uuid, text, text, text, text) from public, anon;
grant execute on function public.driver_update_delivery(uuid, text, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proofs', 'delivery-proofs', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists driver_upload_own_delivery_proof on storage.objects;
create policy driver_upload_own_delivery_proof on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-fA-F-]{36}/[A-Za-z0-9-]+[.]jpg$')
  );

drop policy if exists delivery_proofs_admin_or_assigned_read on storage.objects;
create policy delivery_proofs_admin_or_assigned_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and (
      (select app_private.current_admin_role()) in ('owner', 'staff')
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and exists (
          select 1 from public.orders o
          join public.delivery_personnel d on d.id = o.delivery_personnel_id
          where o.id::text = (storage.foldername(name))[2]
            and d.auth_user_id = (select auth.uid())
            and d.availability <> 'suspended'
        )
      )
    )
  );

commit;
