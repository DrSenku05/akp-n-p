-- Record refunds only after a staff member has completed the external transfer.
begin;

alter table public.return_requests
  add column if not exists refund_amount numeric(12, 2),
  add column if not exists refund_reference text,
  add column if not exists refunded_by uuid references public.admin_users(user_id) on delete restrict,
  add column if not exists refunded_at timestamptz;

alter table public.return_requests
  drop constraint if exists return_requests_refund_record_check;
alter table public.return_requests
  add constraint return_requests_refund_record_check check (
    (refund_amount is null and refund_reference is null and refunded_by is null and refunded_at is null)
    or (
      refund_amount is not null
      and refund_amount > 0
      and refund_reference is not null
      and nullif(btrim(refund_reference), '') is not null
      and refunded_by is not null
      and refunded_at is not null
    )
  );

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'verified', 'partially_refunded', 'rejected', 'refunded', 'failed'));
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'partially_refunded', 'rejected', 'refunded', 'failed'));

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
    update public.orders
    set payment_status = v_order_status
    where id = new.order_id
      and payment_status is distinct from v_order_status;
  end if;

  return new;
end
$$;
revoke all on function app_private.sync_order_payment_status() from public, anon, authenticated;

create or replace function app_private.record_customer_return_refund(
  p_request_number text,
  p_refund_amount numeric,
  p_refund_reference text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_return public.return_requests%rowtype;
  v_payment_id uuid;
  v_payment_amount numeric(12, 2);
  v_payment_status text;
  v_item_amount numeric(12, 2);
  v_previous_refunds numeric(12, 2);
  v_new_total numeric(12, 2);
  v_reference text := nullif(pg_catalog.btrim(p_refund_reference), '');
begin
  if v_admin_id is null
    or coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access is required to record a refund.' using errcode = '42501';
  end if;
  if p_request_number is null or pg_catalog.btrim(p_request_number) = ''
    or p_refund_amount is null or p_refund_amount <= 0
    or p_refund_amount <> pg_catalog.round(p_refund_amount, 2)
    or v_reference is null or pg_catalog.length(v_reference) > 120 then
    raise exception 'Enter a positive refund amount and the GCash transaction reference.' using errcode = '22023';
  end if;

  select rr.* into v_return
  from public.return_requests rr
  where rr.request_number = pg_catalog.btrim(p_request_number)
  for update;
  if not found then
    raise exception 'Return request was not found.' using errcode = 'P0002';
  end if;
  if v_return.status <> 'approved' then
    raise exception 'Approve the return request before recording its refund.' using errcode = 'P0002';
  end if;
  if v_return.refunded_at is not null then
    raise exception 'A refund has already been recorded for this return request.' using errcode = '23505';
  end if;

  select coalesce(sum(oi.unit_price * oi.quantity), 0)::numeric(12, 2)
    into v_item_amount
  from public.order_items oi
  where oi.order_id = v_return.order_id
    and oi.sku = any(v_return.product_ids);
  if v_item_amount <= 0 or p_refund_amount > v_item_amount then
    raise exception 'Refund amount exceeds the value of the returned items.' using errcode = '22023';
  end if;

  select p.id, p.amount, p.status
    into v_payment_id, v_payment_amount, v_payment_status
  from public.payments p
  where p.order_id = v_return.order_id
  order by p.created_at desc, p.id desc
  limit 1
  for update;
  if not found or v_payment_status not in ('verified', 'partially_refunded') then
    raise exception 'A successfully collected payment is required before recording a refund.' using errcode = 'P0002';
  end if;

  select coalesce(sum(rr.refund_amount), 0)::numeric(12, 2)
    into v_previous_refunds
  from public.return_requests rr
  where rr.order_id = v_return.order_id
    and rr.refunded_at is not null;
  v_new_total := v_previous_refunds + p_refund_amount;
  if v_new_total > v_payment_amount then
    raise exception 'Total refunds cannot exceed the collected payment.' using errcode = '22023';
  end if;

  update public.return_requests
  set refund_amount = p_refund_amount,
      refund_reference = v_reference,
      refunded_by = v_admin_id,
      refunded_at = pg_catalog.now()
  where id = v_return.id;

  update public.payments
  set status = case when v_new_total = v_payment_amount then 'refunded' else 'partially_refunded' end
  where id = v_payment_id;

  return v_return.id;
end;
$$;
revoke all on function app_private.record_customer_return_refund(text, numeric, text) from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.record_customer_return_refund(text, numeric, text) to authenticated;

create or replace function public.record_customer_return_refund(
  p_request_number text,
  p_refund_amount numeric,
  p_refund_reference text
) returns uuid
language sql
volatile
set search_path = ''
as $$
  select app_private.record_customer_return_refund(p_request_number, p_refund_amount, p_refund_reference)
$$;
revoke all on function public.record_customer_return_refund(text, numeric, text) from public, anon;
grant execute on function public.record_customer_return_refund(text, numeric, text) to authenticated;

drop trigger if exists payments_sync_order_status on public.payments;
create trigger payments_sync_order_status
after insert or update on public.payments
for each row
execute function app_private.sync_order_payment_status();

commit;
