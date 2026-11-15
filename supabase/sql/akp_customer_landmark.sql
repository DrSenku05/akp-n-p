-- Optional customer-provided delivery landmark for saved addresses and orders.
alter table public.customer_addresses
  add column if not exists landmark text;

-- This wrapper delegates all existing validation and ownership checks to the
-- established RPC, then saves the optional landmark on that same owned row.
create or replace function public.save_customer_address_with_landmark(
  p_address_id uuid,
  p_recipient_name text,
  p_phone text,
  p_address_line text,
  p_landmark text,
  p_barangay text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_country text,
  p_latitude double precision,
  p_longitude double precision,
  p_is_default boolean
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_address_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to save an address.' using errcode = '28000'; end if;
  v_address_id := public.save_customer_address(
    p_address_id, p_recipient_name, p_phone, p_address_line, p_barangay, p_city,
    p_province, p_postal_code, p_country, p_latitude, p_longitude, p_is_default
  );
  update public.customer_addresses a
  set landmark = nullif(trim(p_landmark), '')
  where a.id = v_address_id
    and a.customer_id = (select c.id from public.customers c where c.auth_user_id = v_uid);
  if not found then raise exception 'Address not found.' using errcode = 'P0002'; end if;
  return v_address_id;
end;
$$;

revoke all on function public.save_customer_address_with_landmark(
  uuid, text, text, text, text, text, text, text, text, text,
  double precision, double precision, boolean
) from public, anon;
grant execute on function public.save_customer_address_with_landmark(
  uuid, text, text, text, text, text, text, text, text, text,
  double precision, double precision, boolean
) to authenticated;

notify pgrst, 'reload schema';
