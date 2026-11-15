-- Owner-managed SQL backup archive.
-- Backups contain business-table data only; account tables and Supabase-managed data are excluded.
begin;

create table if not exists public.database_backups (
  id uuid primary key default gen_random_uuid(),
  backup_name text not null check (char_length(btrim(backup_name)) between 1 and 120),
  backup_data text not null,
  file_name text not null,
  file_size bigint not null check (file_size between 1 and 33554432),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  format_version smallint not null default 1 check (format_version = 1),
  schema_scope text[] not null default array['public']::text[],
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (octet_length(backup_data) <= 44739244)
);

alter table public.database_backups enable row level security;
revoke all on table public.database_backups from public, anon, authenticated, service_role;
drop policy if exists "Owners manage database backups" on public.database_backups;

commit;
