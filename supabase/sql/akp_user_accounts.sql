-- Account presence and safe user deletion support.
-- Run this migration in Supabase after akp_admin_schema.sql and akp_customer_refunds.sql.

begin;

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from anon, authenticated;
grant select, insert, update on table public.user_presence to authenticated;
drop policy if exists user_presence_read_self_or_admin on public.user_presence;
create policy user_presence_read_self_or_admin on public.user_presence
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app_private.current_admin_role()) in ('owner', 'staff')
  );
drop policy if exists user_presence_write_self on public.user_presence;
create policy user_presence_write_self on public.user_presence
  for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists user_presence_update_self on public.user_presence;
create policy user_presence_update_self on public.user_presence
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function app_private.block_suspended_customer_orders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is not null and exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.status = 'suspended'
  ) then
    raise exception 'This customer account is suspended.' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function app_private.block_suspended_customer_orders() from public, anon, authenticated;
drop trigger if exists block_suspended_customer_orders on public.orders;
create trigger block_suspended_customer_orders
before insert or update of customer_id on public.orders
for each row execute function app_private.block_suspended_customer_orders();

-- Let Supabase Auth deletion remove the admin roster row. Related audit,
-- payment-verification, and announcement records already use SET NULL.
alter table public.admin_users drop constraint if exists admin_users_user_id_fkey;
alter table public.admin_users add constraint admin_users_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Refund receipts survive account deletion; the person reference becomes NULL.
alter table public.return_requests drop constraint if exists return_requests_refunded_by_fkey;
alter table public.return_requests add constraint return_requests_refunded_by_fkey
  foreign key (refunded_by) references public.admin_users(user_id) on delete set null;
alter table public.return_requests drop constraint if exists return_requests_refund_record_check;
alter table public.return_requests add constraint return_requests_refund_record_check check (
  (refund_amount is null and refund_reference is null and refunded_by is null and refunded_at is null)
  or (
    refund_amount is not null and refund_amount > 0
    and refund_reference is not null and nullif(btrim(refund_reference), '') is not null
    and refunded_at is not null
  )
);

commit;
