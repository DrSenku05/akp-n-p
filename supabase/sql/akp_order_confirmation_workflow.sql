-- Confirm an order and start preparation in one admin action.
-- Run after akp_step3_order_delivery_workflow.sql.
begin;

create or replace function public.confirm_order_start_preparation(
  p_order_id uuid,
  p_gcash_verified boolean default false
) returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_method text;
begin
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active owner or staff access is required.' using errcode = '42501';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then
    raise exception 'Order was not found.' using errcode = 'P0002';
  end if;
  if v_order.status not in ('pending', 'accepted') then
    raise exception 'Only pending or accepted orders can start preparation.' using errcode = '40001';
  end if;

  select p.* into v_payment
  from public.payments p
  where p.order_id = v_order.id
  order by p.created_at desc, p.id desc
  limit 1
  for update;

  v_method := lower(pg_catalog.replace(
    coalesce(nullif(v_order.payment_method, ''), v_payment.method, ''),
    '_', ' '
  ));

  if v_method like '%gcash%' or v_method in ('wallet', 'e-wallet') then
    if v_payment.id is null or lower(pg_catalog.replace(v_payment.method, '_', ' ')) not in ('gcash', 'wallet', 'e-wallet') then
      raise exception 'A matching GCash payment record is required.' using errcode = '23514';
    end if;
    if v_payment.status = 'pending' then
      if not p_gcash_verified then
        raise exception 'Verify the GCash transaction in the official account before confirming this order.' using errcode = '23514';
      end if;
      update public.payments
      set status = 'verified', verified_by = (select auth.uid()), verified_at = pg_catalog.now(), decision_reason = null
      where id = v_payment.id and status = 'pending';
      if not found then
        raise exception 'The GCash payment changed during confirmation. Refresh and try again.' using errcode = '40001';
      end if;
    elsif v_payment.status <> 'verified' then
      raise exception 'The latest GCash payment is not verified and cannot be used to confirm this order.' using errcode = '23514';
    end if;
  elsif v_method in ('cod', 'cash on delivery', 'cash') then
    if v_payment.id is not null
      and lower(pg_catalog.replace(v_payment.method, '_', ' ')) not in ('cod', 'cash on delivery', 'cash') then
      raise exception 'The linked payment method does not match this COD or cash order.' using errcode = '23514';
    end if;
    -- COD and walk-in cash are allowed to remain Pending while preparation starts.
    -- Cash collection remains a separate, physically attested payment event.
    null;
  elsif v_payment.status is distinct from 'verified' or v_order.payment_status is distinct from 'paid' then
    raise exception 'This payment method must already be verified before the order can be confirmed.' using errcode = '23514';
  end if;

  if v_order.status = 'pending' then
    update public.orders
    set status = 'accepted'
    where id = v_order.id and status = 'pending';
    if not found then
      raise exception 'The order changed during confirmation. Refresh and try again.' using errcode = '40001';
    end if;
  end if;

  update public.orders
  set status = 'processing'
  where id = v_order.id and status = 'accepted';
  if not found then
    raise exception 'The order could not be moved into preparation.' using errcode = '40001';
  end if;

  return true;
end
$$;

revoke all on function public.confirm_order_start_preparation(uuid, boolean) from public, anon;
grant execute on function public.confirm_order_start_preparation(uuid, boolean) to authenticated;

commit;
