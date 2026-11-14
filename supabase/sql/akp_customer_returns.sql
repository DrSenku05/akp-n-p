-- Customer return requests and shared store settings.
-- Run after akp_admin_schema.sql and akp_customer_orders.sql.
begin;

create table if not exists public.store_settings (
  id boolean primary key default true check (id = true),
  store_name text not null default 'AKP Native Products Trading'
    check (char_length(btrim(store_name)) between 2 and 120),
  currency_code text not null default 'PHP' check (currency_code = 'PHP'),
  return_window_days integer not null default 7 check (return_window_days between 1 and 365),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_updated_at on public.store_settings;
create trigger touch_updated_at
before update on public.store_settings
for each row execute function app_private.touch_updated_at();

alter table public.store_settings enable row level security;
revoke all on table public.store_settings from anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;

drop policy if exists "Anyone can read store settings" on public.store_settings;
create policy "Anyone can read store settings"
on public.store_settings for select to anon, authenticated
using (true);

drop policy if exists "Owners can update store settings" on public.store_settings;
create policy "Owners can update store settings"
on public.store_settings for update to authenticated
using ((select app_private.current_admin_role()) = 'owner')
with check ((select app_private.current_admin_role()) = 'owner');

insert into public.store_settings (id, store_name, currency_code, return_window_days)
values (true, 'AKP Native Products Trading', 'PHP', 7)
on conflict (id) do nothing;

alter table public.return_requests
  add column if not exists product_ids text[] not null default '{}';

drop policy if exists customer_return_requests_read_own on public.return_requests;
create policy customer_return_requests_read_own on public.return_requests
  for select to authenticated
  using (exists (
    select 1
    from public.customers c
    where c.id = return_requests.customer_id
      and c.auth_user_id = (select auth.uid())
  ));

create or replace function app_private.submit_customer_return_request(
  p_order_id uuid,
  p_product_ids text[],
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_customer_id uuid;
  v_order_status text;
  v_delivered_at timestamptz;
  v_return_window_days integer;
  v_product_ids text[];
  v_request_id uuid;
  v_request_number text;
begin
  if v_uid is null then
    raise exception 'Sign in before requesting a return.' using errcode = '28000';
  end if;
  if p_order_id is null
    or p_product_ids is null
    or pg_catalog.cardinality(p_product_ids) < 1
    or pg_catalog.cardinality(p_product_ids) > 50
    or exists (
      select 1 from pg_catalog.unnest(p_product_ids) as requested(product_id)
      where requested.product_id is null or pg_catalog.btrim(requested.product_id) = ''
    ) then
    raise exception 'Select at least one valid order item.' using errcode = '22023';
  end if;
  if p_reason is null or pg_catalog.btrim(p_reason) = '' or pg_catalog.length(pg_catalog.btrim(p_reason)) > 1000 then
    raise exception 'Enter a return reason of up to 1000 characters.' using errcode = '22023';
  end if;

  select pg_catalog.array_agg(distinct pg_catalog.btrim(requested.product_id) order by pg_catalog.btrim(requested.product_id))
    into v_product_ids
  from pg_catalog.unnest(p_product_ids) as requested(product_id);

  select o.customer_id, o.status, o.delivered_at
    into v_customer_id, v_order_status, v_delivered_at
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.id = p_order_id
    and c.auth_user_id = v_uid
  for update of o;

  if not found or v_order_status <> 'delivered' then
    raise exception 'Only your delivered orders can be returned.' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(v_product_ids) as requested(product_id)
    where not exists (
      select 1 from public.order_items oi
      where oi.order_id = p_order_id and oi.sku = requested.product_id
    )
  ) then
    raise exception 'One or more selected items do not belong to this order.' using errcode = '22023';
  end if;

  select rr.id into v_request_id
  from public.return_requests rr
  where rr.order_id = p_order_id
    and rr.customer_id = v_customer_id
    and rr.product_ids = v_product_ids
    and rr.reason = pg_catalog.btrim(p_reason)
    and rr.status in ('pending', 'approved')
  order by rr.created_at desc
  limit 1;
  if v_request_id is not null then
    return v_request_id;
  end if;

  if exists (
    select 1
    from public.return_requests rr
    where rr.order_id = p_order_id
      and rr.customer_id = v_customer_id
      and rr.status in ('pending', 'approved')
      and rr.product_ids && v_product_ids
  ) then
    raise exception 'One or more selected items already have an active return request.' using errcode = 'P0002';
  end if;

  select settings.return_window_days
    into v_return_window_days
  from public.store_settings settings
  where settings.id = true;
  if v_return_window_days is null then
    raise exception 'Store return settings are unavailable.' using errcode = 'P0001';
  end if;
  if v_delivered_at is null
    or pg_catalog.now() > v_delivered_at + pg_catalog.make_interval(days => v_return_window_days) then
    raise exception 'The return window for this order has expired.' using errcode = 'P0002';
  end if;

  v_request_number := 'RET-' || pg_catalog.to_char(pg_catalog.now() at time zone 'UTC', 'YYMMDD')
    || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.return_requests(request_number, order_id, customer_id, reason, product_ids)
  values (v_request_number, p_order_id, v_customer_id, pg_catalog.btrim(p_reason), v_product_ids)
  returning id into v_request_id;

  return v_request_id;
end;
$$;
revoke all on function app_private.submit_customer_return_request(uuid, text[], text) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.submit_customer_return_request(uuid, text[], text) to authenticated;

create or replace function public.submit_customer_return_request(
  p_order_id uuid,
  p_product_ids text[],
  p_reason text
) returns uuid
language sql
volatile
set search_path = ''
as $$
  select app_private.submit_customer_return_request(p_order_id, p_product_ids, p_reason)
$$;
revoke all on function public.submit_customer_return_request(uuid, text[], text) from public, anon;
grant execute on function public.submit_customer_return_request(uuid, text[], text) to authenticated;

commit;
