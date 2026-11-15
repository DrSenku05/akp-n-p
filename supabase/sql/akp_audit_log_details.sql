-- Record before/after row snapshots so the admin audit folder can show the
-- exact values inserted, modified, or deleted. Existing `row` is retained.
-- Run after akp_admin_schema.sql.

create or replace function app_private.write_admin_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_row jsonb;
  old_row jsonb;
  new_row jsonb;
  target_id uuid;
  audit_actor_id uuid := (select auth.uid());
  audit_actor_role text := (select app_private.current_admin_role());
begin
  if tg_op = 'DELETE' then
    old_row := to_jsonb(old);
    changed_row := old_row;
  elsif tg_op = 'UPDATE' then
    old_row := to_jsonb(old);
    new_row := to_jsonb(new);
    changed_row := new_row;
  else
    new_row := to_jsonb(new);
    changed_row := new_row;
  end if;

  if changed_row ? 'id' then
    target_id := (changed_row ->> 'id')::uuid;
  elsif changed_row ? 'user_id' then
    target_id := (changed_row ->> 'user_id')::uuid;
  end if;

  -- actor_id references admin_users, so customers and service operations must
  -- be recorded as system/customer activity with a null admin actor.
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
    jsonb_build_object('row', changed_row, 'old_row', old_row, 'new_row', new_row)
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function app_private.write_admin_audit_log() from public, anon, authenticated;
