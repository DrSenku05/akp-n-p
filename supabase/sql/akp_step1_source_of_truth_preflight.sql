-- Step 1 preflight only. Read-only: safe to run in Supabase SQL Editor.
-- Run against the one shared AKP project before deciding whether the reset is safe.
-- This does not reset data, change schema, delete Auth users, or touch Storage.

-- 1. Confirm the admin account and its application role before any reset.
select u.id as auth_user_id,
       u.email,
       u.deleted_at,
       a.display_name,
       a.role,
       a.is_active
from auth.users u
left join public.admin_users a on a.user_id = u.id
where lower(u.email) = lower('akpnatives@gmail.com');

-- 2. Inventory public tables, estimated row counts, and RLS state.
select n.nspname as schema_name,
       c.relname as table_name,
       c.reltuples::bigint as estimated_rows,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

-- 3. Review every public foreign key and delete behavior.
select conrelid::regclass as referencing_table,
       conname as constraint_name,
       confrelid::regclass as referenced_table,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f' and connamespace = 'public'::regnamespace
order by conrelid::regclass::text, conname;

-- 4. Review functions and triggers in application schemas.
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'app_private')
order by n.nspname, p.proname;

select event_object_schema,
       event_object_table,
       trigger_name,
       action_timing,
       event_manipulation,
       action_statement
from information_schema.triggers
where event_object_schema in ('public', 'storage')
order by event_object_schema, event_object_table, trigger_name;

-- 5. Confirm existing backup records (metadata only; does not prove files can restore).
select id, backup_name, file_name, file_size, sha256, format_version,
       schema_scope, created_at
from public.database_backups
order by created_at desc;

-- 6. List other Auth users and linked application identities for manual review.
select u.id, u.email,
       (a.user_id is not null) as is_admin,
       a.role as admin_role,
       (d.auth_user_id is not null) as is_driver,
       (c.auth_user_id is not null) as is_customer
from auth.users u
left join public.admin_users a on a.user_id = u.id
left join public.delivery_personnel d on d.auth_user_id = u.id
left join public.customers c on c.auth_user_id = u.id
order by lower(u.email);

-- Compare this result to Supabase Storage > Buckets and independently test
-- backup restore in an isolated project. SQL cannot verify those recovery paths.
