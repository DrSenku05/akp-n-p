-- Keep legacy backup history independent of the admin roster so application restores can replace admin_users.
begin;

alter table public.backup_records
  drop constraint if exists backup_records_created_by_fkey;

alter table public.backup_records
  add constraint backup_records_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

commit;
