-- DESTRUCTIVE Step 1 reset. Do not run until the read-only preflight has been
-- reviewed, a recoverable backup has been tested, and table scope is confirmed
-- against the live shared Supabase project.
-- Run manually in Supabase Dashboard > SQL Editor. No Auth, schema, or Storage
-- changes; delete non-owner Auth users separately in Authentication > Users.
-- This transaction commits only after its owner/Auth invariants pass. It will
-- fail closed on an unexpected foreign-key dependency.

begin;

-- Set true only for the deliberate manual reset run.
do $$
declare
  execute_reset boolean := false;
  keep_email constant text := 'akpnatives@gmail.com';
  keep_user_id uuid;
  keep_role text;
  keep_active boolean;
  matched_count integer;
begin
  if not execute_reset then
    raise exception 'Reset stopped: review preflight results, then set execute_reset to true.';
  end if;

  select count(*) into matched_count from auth.users
  where lower(email) = lower(keep_email) and deleted_at is null;
  if matched_count <> 1 then
    raise exception 'Expected exactly one live Auth user for %, found %.', keep_email, matched_count;
  end if;

  select u.id, a.role, a.is_active into keep_user_id, keep_role, keep_active
  from auth.users u join public.admin_users a on a.user_id = u.id
  where lower(u.email) = lower(keep_email) and u.deleted_at is null;
  if keep_user_id is null or keep_role <> 'owner' or keep_active is distinct from true then
    raise exception '% must be linked to an active owner row in public.admin_users.', keep_email;
  end if;
  perform set_config('akp.reset_keep_user_id', keep_user_id::text, true);
end
$$;

-- The explicit target list preserves admin_users, Auth users, and store settings.
-- RESTRICT makes an unlisted FK dependency abort this transaction instead of
-- silently expanding the reset scope.
truncate table
  public.feedback,
  public.inventory_movements,
  public.order_items,
  public.payments,
  public.return_requests,
  public.orders,
  public.customer_addresses,
  public.customers,
  public.delivery_personnel,
  public.products,
  public.product_categories,
  public.announcements,
  public.audit_logs,
  public.promotions
restart identity restrict;

do $$
declare keep_user_id uuid := current_setting('akp.reset_keep_user_id')::uuid;
begin
  if not exists (select 1 from auth.users where id = keep_user_id and lower(email) = lower('akpnatives@gmail.com') and deleted_at is null) then
    raise exception 'Super Admin Auth account invariant failed.';
  end if;
  if not exists (select 1 from public.admin_users where user_id = keep_user_id and role = 'owner' and is_active) then
    raise exception 'Super Admin owner role invariant failed.';
  end if;
end
$$;

-- Return post-reset counts for verification after the atomic transaction.
select 'auth.users' as checked_table, count(*) as remaining_rows from auth.users
union all select 'public.admin_users', count(*) from public.admin_users
union all select 'public.user_presence', count(*) from public.user_presence
union all select 'public.orders', count(*) from public.orders
union all select 'public.products', count(*) from public.products
union all select 'public.customers', count(*) from public.customers
union all select 'public.delivery_personnel', count(*) from public.delivery_personnel;

commit;
