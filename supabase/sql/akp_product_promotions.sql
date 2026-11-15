-- Product-specific percentage promotions and customer announcements.
-- Run after akp_admin_schema.sql and akp_customer_orders.sql.

begin;

alter table public.promotions
  add column if not exists product_id uuid references public.products(id) on delete cascade;

create index if not exists promotions_active_product_idx
  on public.promotions(product_id, starts_at, ends_at)
  where status = 'active' and product_id is not null;

revoke all on public.promotions from anon;
grant select (product_id, discount_type, discount_value, starts_at, ends_at, status)
  on public.promotions to anon;
drop policy if exists customers_read_active_product_promotions on public.promotions;
create policy customers_read_active_product_promotions on public.promotions
  for select to anon, authenticated
  using (
    product_id is not null
    and status = 'active'
    and starts_at <= now()
    and ends_at > now()
  );

revoke all on public.announcements from anon;
grant select (id, title, message, audience, status, sent_at, created_at)
  on public.announcements to anon;
drop policy if exists customers_read_sent_announcements on public.announcements;
create policy customers_read_sent_announcements on public.announcements
  for select to anon, authenticated
  using (status = 'sent' and audience in ('all', 'customers'));

create or replace function public.create_product_promotion(
  p_name text,
  p_product_sku text,
  p_discount_percent numeric,
  p_ends_at timestamptz
) returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_product record;
  v_promotion_id uuid;
  v_discounted_price numeric(12,2);
  v_message text;
begin
  if v_uid is null or coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active admin access required.' using errcode = '42501';
  end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 120 then
    raise exception 'Enter a promotion name of up to 120 characters.' using errcode = '22023';
  end if;
  if p_discount_percent is null or p_discount_percent <= 0 or p_discount_percent >= 100 then
    raise exception 'Discount must be greater than 0%% and less than 100%%.' using errcode = '22023';
  end if;
  if p_ends_at is null or p_ends_at <= now() then
    raise exception 'Choose a future end date.' using errcode = '22023';
  end if;

  select p.id, p.name, p.price into v_product
  from public.products p
  where p.sku = trim(p_product_sku) and p.visibility = 'published'
  for update;
  if not found then raise exception 'Choose a published product.' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.promotions promotion
    where promotion.product_id = v_product.id
      and promotion.status = 'active'
      and promotion.ends_at > now()
  ) then
    raise exception 'This product already has an active promotion. End it before creating another.'
      using errcode = '23505';
  end if;
  if round(p_discount_percent, 2) <> p_discount_percent then
    raise exception 'Discounts can have at most two decimal places.' using errcode = '22023';
  end if;

  v_discounted_price := round(v_product.price * (1 - p_discount_percent / 100), 2);
  if v_discounted_price <= 0 then
    raise exception 'This discount would make the product price zero.' using errcode = '22023';
  end if;
  v_message := format('%s is %s%% off until %s.',
    v_product.name, trim(to_char(p_discount_percent, 'FM990.99')),
    to_char(p_ends_at at time zone 'Asia/Manila', 'Mon DD, YYYY'));

  insert into public.promotions (
    name, description, product_id, discount_type, discount_value,
    starts_at, ends_at, status, created_by
  ) values (
    trim(p_name), v_message, v_product.id, 'percentage', p_discount_percent,
    now(), p_ends_at, 'active', v_uid
  ) returning id into v_promotion_id;

  insert into public.announcements (title, message, audience, status, sent_at, created_by)
  values (trim(p_name), v_message, 'customers', 'sent', now(), v_uid);

  return v_promotion_id;
end
$$;

revoke all on function public.create_product_promotion(text, text, numeric, timestamptz) from public, anon;
grant execute on function public.create_product_promotion(text, text, numeric, timestamptz) to authenticated;

commit;
