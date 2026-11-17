-- Read-only Step 2 status check. Run the whole file in Supabase SQL Editor.
-- It does not change data, schema, Storage, or permissions.
-- PASS means the object exists; inspect Details for expected names and scope.
-- SQL cannot prove the web app is deployed or that a backup can be restored.

with expected_tables(table_name, rls_required) as (
  values
    ('products', true),
    ('product_categories', true),
    ('inventory_movements', true),
    ('product_sku_settings', true),
    ('product_sku_registry', true),
    ('product_images', true),
    ('native_heritage_stories', true),
    ('order_inventory_reservations', true),
    ('store_inventory_settings', true)
),
table_checks as (
  select
    'Table'::text as check_group,
    t.table_name as check_name,
    (c.oid is not null and (not t.rls_required or c.relrowsecurity)) as passed,
    case
      when c.oid is null then 'Missing public.' || t.table_name
      when t.rls_required and not c.relrowsecurity then 'Exists, but row-level security is disabled'
      else 'Exists; RLS enabled'
    end as details
  from expected_tables t
  left join pg_class c on c.oid = to_regclass(format('public.%I', t.table_name))
),
expected_columns(table_name, column_name) as (
  values
    ('products', 'supplier_cost'),
    ('products', 'reserved_stock'),
    ('products', 'available_stock'),
    ('products', 'visibility'),
    ('product_categories', 'parent_category_id'),
    ('product_categories', 'archived_at'),
    ('store_inventory_settings', 'low_stock_threshold')
),
column_checks as (
  select
    'Column'::text as check_group,
    c.table_name || '.' || c.column_name as check_name,
    exists (
      select 1 from information_schema.columns i
      where i.table_schema = 'public'
        and i.table_name = c.table_name
        and i.column_name = c.column_name
    ) as passed,
    case when exists (
      select 1 from information_schema.columns i
      where i.table_schema = 'public'
        and i.table_name = c.table_name
        and i.column_name = c.column_name
    ) then 'Present' else 'Missing' end as details
  from expected_columns c
),
expected_functions(signature) as (
  values
    ('public.create_product_draft(text,text)'),
    ('public.publish_product(text)'),
    ('public.archive_product(text)'),
    ('public.set_product_heritage_required(text,boolean)'),
    ('public.set_product_featured(text,boolean)'),
    ('public.record_product_stock_movement(text,text,integer,text,text)'),
    ('public.delete_product(text)'),
    ('public.get_product_sku_format()'),
    ('public.set_product_sku_format(text,smallint)'),
    ('public.set_product_primary_image(uuid)'),
    ('public.create_walk_in_order(jsonb,text)'),
    ('public.create_product_draft_with_cost(text,text,numeric)'),
    ('public.save_product_details_as_draft(uuid,text,text,uuid,uuid,numeric,numeric,text)')
),
function_checks as (
  select
    'RPC'::text as check_group,
    f.signature as check_name,
    to_regprocedure(f.signature) is not null as passed,
    case when to_regprocedure(f.signature) is not null then 'Present' else 'Missing' end as details
  from expected_functions f
),
storage_checks as (
  select
    'Storage'::text as check_group,
    'product-images bucket'::text as check_name,
    exists (select 1 from storage.buckets where id = 'product-images') as passed,
    coalesce((
      select 'Present; public=' || b.public::text || '; size limit=' || coalesce(b.file_size_limit::text, 'unlimited')
      from storage.buckets b where b.id = 'product-images'
    ), 'Missing') as details
  union all
  select
    'Storage policy',
    expected.policy_name,
    exists (
      select 1 from pg_policies p
      where p.schemaname = 'storage'
        and p.tablename = 'objects'
        and p.policyname = expected.policy_name
    ),
    case when exists (
      select 1 from pg_policies p
      where p.schemaname = 'storage'
        and p.tablename = 'objects'
        and p.policyname = expected.policy_name
    ) then 'Present on storage.objects' else 'Missing from storage.objects' end
  from (values
    ('Public can view product images'),
    ('Admins can upload product images'),
    ('Admins can update product images'),
    ('Admins can delete product images')
  ) as expected(policy_name)
),
admin_policy_checks as (
  select
    'Admin policy'::text as check_group,
    expected.table_name || '.' || expected.policy_name as check_name,
    exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = expected.table_name
        and p.policyname = expected.policy_name
    ) as passed,
    case when exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = expected.table_name
        and p.policyname = expected.policy_name
    ) then 'Present' else 'Missing' end as details
  from (values
    ('products', 'products_admin_read'),
    ('products', 'products_admin_insert'),
    ('products', 'products_admin_update'),
    ('products', 'products_owner_delete'),
    ('product_categories', 'product_categories_admin_read'),
    ('product_categories', 'product_categories_admin_write'),
    ('product_categories', 'product_categories_admin_update'),
    ('product_images', 'product_images_admin_read'),
    ('product_images', 'product_images_admin_insert'),
    ('product_images', 'product_images_admin_update'),
    ('product_images', 'product_images_admin_delete'),
    ('native_heritage_stories', 'heritage_stories_admin_manage')
  ) as expected(table_name, policy_name)
),
constraint_checks as (
  select
    'Constraint'::text as check_group,
    'products_supplier_cost_nonnegative'::text as check_name,
    exists (
      select 1 from pg_constraint
      where conrelid = to_regclass('public.products')
        and conname = 'products_supplier_cost_nonnegative'
        and contype = 'c'
    ) as passed,
    case when exists (
      select 1 from pg_constraint
      where conrelid = to_regclass('public.products')
        and conname = 'products_supplier_cost_nonnegative'
        and contype = 'c'
    ) then 'Present' else 'Missing' end as details
)
select check_group, check_name, passed, details
from (
  select * from table_checks
  union all select * from column_checks
  union all select * from function_checks
  union all select * from storage_checks
  union all select * from admin_policy_checks
  union all select * from constraint_checks
) checks
order by check_group, check_name;
