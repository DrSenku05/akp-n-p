-- Publicly expose only aggregate ratings for published products; never expose review text or customer identity.
-- Run after akp_admin_schema.sql and akp_customer_feedback.sql.
begin;

do $$
begin
  if to_regclass('public.products') is null or to_regclass('public.feedback') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'products' and column_name = 'visibility'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'feedback' and column_name = 'moderation_status'
    ) then
    raise exception 'Apply the AKP product catalog and customer feedback setup before public rating summaries.';
  end if;
end
$$;

create or replace function public.get_published_product_rating_summaries()
returns table(product_id uuid, average_rating numeric, review_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, round(avg(f.rating)::numeric, 1), count(f.id)
  from public.products p
  left join public.feedback f
    on f.product_id = p.id and f.moderation_status = 'visible'
  where p.visibility = 'published'
  group by p.id
$$;

revoke all on function public.get_published_product_rating_summaries() from public, anon, authenticated;
grant execute on function public.get_published_product_rating_summaries() to anon, authenticated;

commit;
