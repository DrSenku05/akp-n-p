-- Run this in the Supabase SQL Editor AFTER creating the login in
-- Authentication > Users. This links that Auth user to the admin owner role.
-- Replace both placeholders before running. This does not create a password
-- or an Auth account.

do $$
declare
  owner_email text := lower(trim('OWNER_EMAIL_HERE'));
  owner_name text := 'OWNER_DISPLAY_NAME_HERE';
  owner_id uuid;
begin
  if owner_email = 'owner_email_here' or owner_name = 'OWNER_DISPLAY_NAME_HERE' then
    raise exception 'Replace OWNER_EMAIL_HERE and OWNER_DISPLAY_NAME_HERE first.';
  end if;

  select u.id
    into owner_id
  from auth.users as u
  where lower(u.email) = owner_email;

  if owner_id is null then
    raise exception 'No Supabase Auth user found for %. Create that user in Authentication > Users first.', owner_email;
  end if;

  insert into public.admin_users (user_id, display_name, role, is_active)
  values (owner_id, owner_name, 'owner', true)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        role = 'owner',
        is_active = true,
        updated_at = now();
end
$$;

select au.user_id, au.display_name, au.role, au.is_active
from public.admin_users as au
join auth.users as u on u.id = au.user_id
where lower(u.email) = lower(trim('OWNER_EMAIL_HERE'));
