-- Keep order payment state aligned with its latest payment and enforce customer
-- suspensions at the database boundary. Safe to re-run.
begin;

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

drop trigger if exists payments_sync_order_status on public.payments;
create trigger payments_sync_order_status
after insert or update on public.payments
for each row
execute function app_private.sync_order_payment_status();

with latest_payments as (
  select distinct on (p.order_id) p.order_id, p.status
  from public.payments p
  order by p.order_id, p.created_at desc, p.id desc
)
update public.orders o
set payment_status = case p.status
  when 'verified' then 'paid'
  when 'rejected' then 'rejected'
  when 'refunded' then 'refunded'
  when 'failed' then 'failed'
  when 'pending' then 'pending'
  else o.payment_status
end
from latest_payments p
where p.order_id = o.id
  and p.status in ('verified', 'rejected', 'refunded', 'failed', 'pending')
  and o.payment_status is distinct from case p.status
    when 'verified' then 'paid'
    when 'rejected' then 'rejected'
    when 'refunded' then 'refunded'
    when 'failed' then 'failed'
    when 'pending' then 'pending'
  end;

create or replace function app_private.reject_suspended_customer_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.customer_id is not null and exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and lower(c.status) = 'suspended'
  ) then
    raise exception 'This customer account is suspended and cannot place orders.'
      using errcode = '42501';
  end if;

  return new;
end
$$;
revoke all on function app_private.reject_suspended_customer_order() from public, anon, authenticated;

drop trigger if exists orders_reject_suspended_customer on public.orders;
create trigger orders_reject_suspended_customer
before insert on public.orders
for each row
execute function app_private.reject_suspended_customer_order();

commit;
