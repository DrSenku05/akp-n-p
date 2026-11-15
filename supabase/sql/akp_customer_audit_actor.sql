-- Prevent customer and service writes from violating audit_logs.actor_id's
-- foreign key to admin_users. Non-admin activity remains auditable with a NULL
-- actor_id/actor_role and the changed row preserved in metadata.

create or replace function app_private.write_admin_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_row jsonb;
  target_id uuid;
  audit_actor_id uuid := (select auth.uid());
  audit_actor_role text := (select app_private.current_admin_role());
begin
  if tg_op = 'DELETE' then
    changed_row := to_jsonb(old);
  else
    changed_row := to_jsonb(new);
  end if;

  if changed_row ? 'id' then
    target_id := (changed_row ->> 'id')::uuid;
  elsif changed_row ? 'user_id' then
    target_id := (changed_row ->> 'user_id')::uuid;
  end if;

  if audit_actor_role is null then
    audit_actor_id := null;
  end if;

  insert into public.audit_logs (actor_id, actor_role, module, action, entity_id, metadata)
  values (
    audit_actor_id,
    audit_actor_role,
    tg_table_name,
    lower(tg_op),
    target_id,
    jsonb_build_object('row', changed_row)
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
