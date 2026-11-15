-- Limit sent announcements to authenticated users matching their audience.
-- Run after akp_admin_schema.sql, akp_customer_orders.sql, and akp_driver_app.sql.

begin;

alter table public.announcements enable row level security;
alter table public.announcements
  add column if not exists kind text not null default 'announcement'
  check (kind in ('announcement', 'promotion'));
alter table public.announcements
  drop constraint if exists announcements_audience_check;
alter table public.announcements
  add constraint announcements_audience_check
  check (audience in ('all', 'customers', 'staff', 'drivers'));

revoke all on public.announcements from anon;
grant select (id, title, message, audience, status, sent_at, created_at, kind)
  on public.announcements to authenticated;

drop policy if exists customers_read_sent_announcements on public.announcements;
drop policy if exists driver_read_announcements on public.announcements;
drop policy if exists announcements_read_matching_audience on public.announcements;
create policy announcements_read_matching_audience on public.announcements
  for select to authenticated
  using (
    status = 'sent'
    and (
      (
        audience = 'customers'
        and exists (
          select 1 from public.customers c
          where c.auth_user_id = (select auth.uid())
             or lower(c.email) = lower(coalesce((select auth.jwt()->>'email'), ''))
        )
      )
      or (
        audience = 'drivers'
        and exists (
          select 1 from public.delivery_personnel d
          where d.auth_user_id = (select auth.uid())
            and d.availability <> 'suspended'
        )
      )
      or (
        audience = 'staff'
        and coalesce((select app_private.current_admin_role()), '') in ('owner', 'staff')
      )
      or (
        audience = 'all'
        and (
          exists (
            select 1 from public.customers c
            where c.auth_user_id = (select auth.uid())
               or lower(c.email) = lower(coalesce((select auth.jwt()->>'email'), ''))
          )
          or exists (
            select 1 from public.delivery_personnel d
            where d.auth_user_id = (select auth.uid())
              and d.availability <> 'suspended'
          )
          or coalesce((select app_private.current_admin_role()), '') in ('owner', 'staff')
        )
      )
    )
  );

commit;
