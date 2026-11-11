-- Live driver location sharing. Run after akp_driver_app.sql.
-- Coordinates are accepted only from the signed-in driver while they have an
-- active delivery. They are cleared when the driver's last delivery closes.

begin;

alter table public.delivery_personnel
  add column if not exists current_latitude double precision,
  add column if not exists current_longitude double precision,
  add column if not exists location_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.delivery_personnel'::regclass
      and conname = 'delivery_personnel_location_coordinates_check'
  ) then
    alter table public.delivery_personnel
      add constraint delivery_personnel_location_coordinates_check
      check (
        (current_latitude is null and current_longitude is null)
        or (current_latitude is not null and current_longitude is not null
          and current_latitude between -90 and 90 and current_longitude between -180 and 180)
      );
  end if;
end
$$;

create or replace function app_private.driver_update_location(
  p_latitude double precision,
  p_longitude double precision
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_driver_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180 then
    raise exception 'A valid driver location is required.' using errcode = '22023';
  end if;

  select d.id into v_driver_id
  from public.delivery_personnel d
  where d.auth_user_id = v_uid
    and d.availability = 'on_delivery'
  for update;
  if v_driver_id is null then
    raise exception 'Driver must have an active delivery to share location.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.orders o
    where o.delivery_personnel_id = v_driver_id
      and o.delivery_status in ('picked_up', 'out_for_delivery', 'arrived', 'attempted')
      and o.status <> 'cancelled'
  ) then
    raise exception 'No accepted delivery is currently in progress.' using errcode = '42501';
  end if;

  update public.delivery_personnel d
  set current_latitude = p_latitude,
      current_longitude = p_longitude,
      location_updated_at = now()
  where d.id = v_driver_id;
  return true;
end
$$;
revoke all on function app_private.driver_update_location(double precision, double precision) from public, anon;
grant execute on function app_private.driver_update_location(double precision, double precision) to authenticated;

create or replace function public.driver_update_location(
  p_latitude double precision,
  p_longitude double precision
) returns boolean
language sql
volatile
set search_path = ''
as $$ select app_private.driver_update_location(p_latitude, p_longitude) $$;
revoke all on function public.driver_update_location(double precision, double precision) from public, anon;
grant execute on function public.driver_update_location(double precision, double precision) to authenticated;

-- Customers can read only the fresh location for their own active delivery.
create or replace function public.customer_track_delivery(p_order_id uuid)
returns table (
  current_latitude double precision,
  current_longitude double precision,
  location_updated_at timestamptz,
  delivery_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  return query
  select d.current_latitude, d.current_longitude, d.location_updated_at, o.delivery_status
  from public.orders o
  join public.customers c on c.id = o.customer_id and c.auth_user_id = v_uid
  join public.delivery_personnel d on d.id = o.delivery_personnel_id
  where o.id = p_order_id
    and o.fulfillment_method = 'delivery'
    and o.status not in ('cancelled', 'delivered')
    and o.delivery_status not in ('delivered', 'failed')
    and d.current_latitude is not null
    and d.current_longitude is not null
    and d.location_updated_at > now() - interval '2 minutes';
end
$$;
revoke all on function public.customer_track_delivery(uuid) from public, anon;
grant execute on function public.customer_track_delivery(uuid) to authenticated;

create or replace function app_private.driver_clear_terminal_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_personnel_id is not null
    and (new.delivery_status in ('delivered', 'failed') or new.status in ('delivered', 'cancelled'))
    and (old.delivery_status is distinct from new.delivery_status or old.status is distinct from new.status)
    and not exists (
      select 1 from public.orders o
      where o.delivery_personnel_id = new.delivery_personnel_id
        and o.id <> new.id
        and o.delivery_status not in ('delivered', 'failed')
        and o.status <> 'cancelled'
    ) then
    update public.delivery_personnel d
    set availability = case when d.availability = 'on_delivery' then 'available' else d.availability end,
        current_latitude = null,
        current_longitude = null,
        location_updated_at = null
    where d.id = new.delivery_personnel_id;
  end if;
  return new;
end
$$;
revoke all on function app_private.driver_clear_terminal_location() from public, anon, authenticated;

drop trigger if exists clear_driver_location_after_terminal_delivery on public.orders;
create trigger clear_driver_location_after_terminal_delivery
  after update of delivery_status, status on public.orders
  for each row execute function app_private.driver_clear_terminal_location();

commit;
