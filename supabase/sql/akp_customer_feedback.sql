-- Store verified-purchase reviews in Supabase and expose them only to the
-- purchasing customer and authorized administrators.
begin;

alter table public.feedback enable row level security;
grant select on table public.feedback to authenticated;

drop policy if exists customer_feedback_read_own on public.feedback;
create policy customer_feedback_read_own on public.feedback
  for select to authenticated
  using (exists (
    select 1
    from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = feedback.order_id
      and c.id = feedback.customer_id
      and c.auth_user_id = (select auth.uid())
  ));

create or replace function app_private.submit_customer_feedback(
  p_order_id uuid,
  p_product_sku text,
  p_rating smallint,
  p_comment text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_customer_id uuid;
  v_product_id uuid;
  v_feedback_id uuid;
  v_sku text := nullif(pg_catalog.btrim(p_product_sku), '');
  v_comment text := pg_catalog.btrim(coalesce(p_comment, ''));
begin
  if v_uid is null then
    raise exception 'Sign in before submitting a review.' using errcode = '28000';
  end if;
  if p_order_id is null or v_sku is null or pg_catalog.length(v_sku) > 100
    or p_rating is null or p_rating not between 1 and 5
    or pg_catalog.length(v_comment) > 2000 then
    raise exception 'Enter a product, a rating from 1 to 5, and a review of at most 2000 characters.'
      using errcode = '22023';
  end if;

  select o.customer_id into v_customer_id
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.id = p_order_id
    and o.status = 'delivered'
    and c.auth_user_id = v_uid
  for update of o;
  if not found then
    raise exception 'Reviews are available only for your delivered orders.' using errcode = 'P0002';
  end if;

  select oi.product_id into v_product_id
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.sku = v_sku
    and oi.product_id is not null
  limit 1;
  if v_product_id is null then
    raise exception 'This product is not part of the selected order.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.feedback f
    where f.customer_id = v_customer_id
      and f.order_id = p_order_id
      and f.product_id = v_product_id
  ) then
    raise exception 'You have already reviewed this product from this order.' using errcode = '23505';
  end if;

  insert into public.feedback(customer_id, order_id, product_id, rating, comment)
  values (v_customer_id, p_order_id, v_product_id, p_rating, v_comment)
  returning id into v_feedback_id;

  return v_feedback_id;
end;
$$;
revoke all on function app_private.submit_customer_feedback(uuid, text, smallint, text) from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.submit_customer_feedback(uuid, text, smallint, text) to authenticated;

create or replace function public.submit_customer_feedback(
  p_order_id uuid,
  p_product_sku text,
  p_rating smallint,
  p_comment text
) returns uuid
language sql
volatile
set search_path = ''
as $$
  select app_private.submit_customer_feedback(p_order_id, p_product_sku, p_rating, p_comment)
$$;
revoke all on function public.submit_customer_feedback(uuid, text, smallint, text) from public, anon;
grant execute on function public.submit_customer_feedback(uuid, text, smallint, text) to authenticated;

commit;
