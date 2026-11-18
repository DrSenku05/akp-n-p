-- Require the driver's COD collection attestation before delivery completion,
-- then let an admin confirm receipt from the linked Orders & Payments card.
-- Run after akp_step3_order_delivery_workflow.sql.
begin;

do $$
begin
  if to_regclass('public.orders') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.delivery_personnel') is null
    or to_regclass('public.order_activity') is null
    or to_regprocedure('app_private.current_admin_role()') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'cod_collected_at'
    ) then
    raise exception 'Apply the AKP Step 3 order and delivery workflow before this COD handover update.';
  end if;
end
$$;

create or replace function app_private.require_driver_cod_collection_before_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.delivery_status is distinct from 'delivered'
    and new.delivery_status = 'delivered'
    and new.fulfillment_method = 'delivery'
    and lower(pg_catalog.replace(pg_catalog.btrim(coalesce(new.payment_method, '')), '_', ' ')) in ('cod', 'cash on delivery', 'cash') then
    if new.cod_collected_at is null
      or new.cod_collected_by is distinct from new.delivery_personnel_id
      or not exists (
        select 1 from public.delivery_personnel d
        where d.id = new.delivery_personnel_id and d.auth_user_id = (select auth.uid())
      ) then
      raise exception 'The assigned driver must confirm receiving COD cash before completing delivery.' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
revoke all on function app_private.require_driver_cod_collection_before_delivery() from public, anon, authenticated;
drop trigger if exists orders_require_driver_cod_collection on public.orders;
create trigger orders_require_driver_cod_collection
  before update on public.orders
  for each row execute function app_private.require_driver_cod_collection_before_delivery();

-- The existing Step 3 driver RPC still attempts to mark COD paid. Keep that
-- update successful but pending; only the new admin RPC can record payment.
create or replace function app_private.prevent_uncollected_cod_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_driver_id uuid;
  v_driver_marker text := coalesce(current_setting('akp.cod_collection_order', true), '');
  v_admin_marker text := coalesce(current_setting('akp.cod_admin_confirm_order', true), '');
begin
  if lower(pg_catalog.replace(pg_catalog.btrim(coalesce(new.method, '')), '_', ' ')) in ('cod', 'cash on delivery', 'cash')
    and new.status = 'verified' and old.status is distinct from 'verified' then
    select o.* into v_order from public.orders o where o.id = new.order_id for update;
    if v_order.fulfillment_method = 'delivery' then
      if v_driver_marker = v_order.id::text then
        select d.id into v_driver_id from public.delivery_personnel d
        where d.id = v_order.cod_collected_by and d.auth_user_id = (select auth.uid());
        if v_order.cod_collected_at is null or v_driver_id is null
          or v_order.cod_collected_by is distinct from v_order.delivery_personnel_id then
          raise exception 'The assigned driver must record cash collection before delivery completion.' using errcode = '42501';
        end if;
        new.status := old.status;
        new.verified_by := old.verified_by;
        new.verified_at := old.verified_at;
        new.decision_reason := old.decision_reason;
        return new;
      elsif v_admin_marker = v_order.id::text then
        if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff')
          or v_order.status <> 'delivered' or v_order.delivery_status <> 'delivered'
          or v_order.cod_collected_at is null or v_order.cod_collected_by is distinct from v_order.delivery_personnel_id then
          raise exception 'An admin can confirm COD payment only after the assigned driver recorded collection and delivery is complete.' using errcode = '42501';
        end if;
      else
        raise exception 'Delivery COD payment requires an admin cash receipt confirmation after driver collection.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end
$$;
revoke all on function app_private.prevent_uncollected_cod_payment() from public, anon, authenticated;

create or replace function app_private.confirm_delivery_cod_payment(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_driver_name text;
  v_actor_name text;
  v_receipt_exists boolean;
begin
  if v_uid is null then raise exception 'Sign in before confirming COD receipt.' using errcode = '28000'; end if;
  if coalesce((select app_private.current_admin_role()), '') not in ('owner', 'staff') then
    raise exception 'Active owner or staff access is required.' using errcode = '42501';
  end if;

  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  select exists (
    select 1 from public.order_activity a
    where a.order_id = v_order.id and a.event_type = 'cod_cash_received'
  ) into v_receipt_exists;
  if v_receipt_exists then return true; end if;
  if v_order.fulfillment_method <> 'delivery'
    or lower(pg_catalog.replace(pg_catalog.btrim(coalesce(v_order.payment_method, '')), '_', ' ')) not in ('cod', 'cash on delivery', 'cash')
    or v_order.status <> 'delivered' or v_order.delivery_status <> 'delivered' then
    raise exception 'Only completed delivery COD orders can be confirmed here.' using errcode = '23514';
  end if;
  if v_order.cod_collected_at is null
    or v_order.cod_collected_by is null
    or v_order.cod_collected_by is distinct from v_order.delivery_personnel_id then
    raise exception 'The assigned driver must confirm collecting the cash before admin confirmation is available.' using errcode = '23514';
  end if;

  select p.* into v_payment from public.payments p
  where p.order_id = v_order.id
    and lower(pg_catalog.replace(pg_catalog.btrim(coalesce(p.method, '')), '_', ' ')) in ('cod', 'cash on delivery', 'cash')
  order by p.created_at desc, p.id desc limit 1 for update;
  if not found then raise exception 'No linked COD payment record was found.' using errcode = 'P0002'; end if;
  if v_payment.status <> 'pending' then
    raise exception 'The COD payment is no longer pending; review its current status before recording cash receipt.' using errcode = '40001';
  end if;

  perform pg_catalog.set_config('akp.cod_admin_confirm_order', v_order.id::text, true);
  update public.payments
  set status = 'verified', verified_by = v_uid, verified_at = pg_catalog.now(), decision_reason = null
  where id = v_payment.id and status = 'pending';
  if not found then raise exception 'The COD payment changed during confirmation. Refresh and try again.' using errcode = '40001'; end if;

  select d.name into v_driver_name from public.delivery_personnel d where d.id = v_order.delivery_personnel_id;
  select coalesce(
    (select au.display_name from public.admin_users au where au.user_id = v_uid),
    (select u.email from auth.users u where u.id = v_uid), 'Admin'
  ) into v_actor_name;
  insert into public.order_activity(order_id, event_type, description, actor_id, actor_name, previous_state, new_state)
  values (
    v_order.id, 'cod_cash_received',
    'Admin confirmed receipt of ₱' || pg_catalog.to_char(v_payment.amount, 'FM999999999990.00') || ' COD cash from driver ' || coalesce(v_driver_name, 'Unknown') || '.',
    v_uid, v_actor_name,
    jsonb_build_object('payment_status', v_payment.status, 'cod_driver_collected_at', v_order.cod_collected_at),
    jsonb_build_object('payment_status', 'verified', 'amount', v_payment.amount, 'driver_name', v_driver_name)
  );
  perform pg_catalog.set_config('akp.cod_admin_confirm_order', '', true);
  return true;
end
$$;
revoke all on function app_private.confirm_delivery_cod_payment(uuid) from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.confirm_delivery_cod_payment(uuid) to authenticated;

create or replace function public.confirm_delivery_cod_payment(p_order_id uuid)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$ select app_private.confirm_delivery_cod_payment(p_order_id) $$;
revoke all on function public.confirm_delivery_cod_payment(uuid) from public, anon;
grant execute on function public.confirm_delivery_cod_payment(uuid) to authenticated;

commit;
