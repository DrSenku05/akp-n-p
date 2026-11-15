-- Owner-controlled daily SQL backup schedule and five-backup retention.
-- Run after akp_database_backups.sql.
begin;

create table if not exists public.database_backup_automation (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  last_run_at timestamptz,
  last_error text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.database_backup_automation (id, enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.database_backup_automation enable row level security;
revoke all on table public.database_backup_automation from public, anon, authenticated, service_role;

create or replace function app_private.keep_five_database_backups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(1095380304, 1112227152);
  delete from public.database_backups
  where id in (
    select id from public.database_backups
    order by created_at desc, id desc
    offset 5
  );
  return new;
end
$$;
revoke all on function app_private.keep_five_database_backups() from public, anon, authenticated;

drop trigger if exists database_backups_keep_five on public.database_backups;
create trigger database_backups_keep_five
after insert on public.database_backups
for each row execute function app_private.keep_five_database_backups();

commit;
