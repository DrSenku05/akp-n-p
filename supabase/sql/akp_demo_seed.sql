-- Fictional AKP demo records for the schema in akp_admin_schema.sql.
-- Paste into Supabase SQL Editor after the schema exists. Safe to re-run:
-- stable IDs and ON CONFLICT DO NOTHING prevent duplicate demo rows.
-- No Auth accounts, credentials, actual backup artifacts, or sent notices are created.

begin;

insert into public.product_categories (id, name, description) values
  ('10000000-0000-4000-8000-000000000001', 'Bags', 'Demo category for locally crafted bags.'),
  ('10000000-0000-4000-8000-000000000002', 'Baskets', 'Demo category for woven home and market baskets.'),
  ('10000000-0000-4000-8000-000000000003', 'Home Decor', 'Demo category for handwoven home pieces.'),
  ('10000000-0000-4000-8000-000000000004', 'Accessories', 'Demo category for small-batch accessories.'),
  ('10000000-0000-4000-8000-000000000005', 'Headwear', 'Demo category for locally made headwear.')
on conflict (id) do nothing;

insert into public.products
  (id, sku, name, description, category_id, price, stock_quantity, reorder_level, craft_origin, is_featured, visibility)
values
  ('20000000-0000-4000-8000-000000000001', 'DEMO-SKU-001', 'Woven Abaca Bag', 'Demo listing; replace with the verified product description and image.', '10000000-0000-4000-8000-000000000001', 850.00, 0, 10, 'South Cotabato · demo origin', true, 'published'),
  ('20000000-0000-4000-8000-000000000002', 'DEMO-SKU-002', 'Native Rattan Basket', 'Demo listing; replace with the verified product description and image.', '10000000-0000-4000-8000-000000000002', 1200.00, 0, 10, 'Philippines · demo origin', true, 'published'),
  ('20000000-0000-4000-8000-000000000003', 'DEMO-SKU-003', 'Handwoven Table Runner', 'Demo listing; replace with the verified product description and image.', '10000000-0000-4000-8000-000000000003', 430.00, 0, 8, 'Philippines · demo origin', false, 'published'),
  ('20000000-0000-4000-8000-000000000004', 'DEMO-SKU-004', 'Bamboo Jewelry Set', 'Demo listing; replace with the verified product description and image.', '10000000-0000-4000-8000-000000000004', 650.00, 0, 5, 'Philippines · demo origin', false, 'draft'),
  ('20000000-0000-4000-8000-000000000005', 'DEMO-SKU-005', 'Native Buri Hat', 'Demo listing; replace with the verified product description and image.', '10000000-0000-4000-8000-000000000005', 320.00, 0, 5, 'Philippines · demo origin', false, 'published')
on conflict (id) do nothing;

insert into public.customers (id, name, email, phone, status) values
  ('30000000-0000-4000-8000-000000000001', 'Demo Customer - Ana S.', 'ana.demo@example.com', null, 'active'),
  ('30000000-0000-4000-8000-000000000002', 'Demo Customer - Miguel R.', 'miguel.demo@example.com', null, 'active'),
  ('30000000-0000-4000-8000-000000000003', 'Demo Customer - Liza C.', 'liza.demo@example.com', null, 'active')
on conflict (id) do nothing;

insert into public.customer_addresses
  (id, customer_id, recipient_name, phone, address_line, barangay, city, province, postal_code, is_default)
values
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Demo Customer - Ana S.', null, 'Demo address - replace before any real fulfillment', 'Demo Barangay', 'Koronadal City', 'South Cotabato', null, true),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Demo Customer - Miguel R.', null, 'Demo address - replace before any real fulfillment', 'Demo Barangay', 'Davao City', 'Davao del Sur', null, true),
  ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'Demo Customer - Liza C.', null, 'Demo address - replace before any real fulfillment', 'Demo Barangay', 'Cebu City', 'Cebu', null, true)
on conflict (id) do nothing;

insert into public.delivery_personnel (id, name, email, phone, availability) values
  ('40000000-0000-4000-8000-000000000001', 'Demo Rider - R. Dela Cruz', null, null, 'available'),
  ('40000000-0000-4000-8000-000000000002', 'Demo Rider - J. Santos', null, null, 'off_duty')
on conflict (id) do nothing;

insert into public.orders
  (id, order_number, customer_id, delivery_address_id, delivery_personnel_id, status, fulfillment_method, subtotal, delivery_fee, total_amount)
values
  ('50000000-0000-4000-8000-000000000001', 'DEMO-ORD-1001', '30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', null, 'pending', 'delivery', 1200.00, 80.00, 1280.00),
  ('50000000-0000-4000-8000-000000000002', 'DEMO-ORD-1002', '30000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'processing', 'delivery', 1280.00, 80.00, 1360.00),
  ('50000000-0000-4000-8000-000000000003', 'DEMO-ORD-1003', '30000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'shipped', 'delivery', 1300.00, 80.00, 1380.00),
  ('50000000-0000-4000-8000-000000000004', 'DEMO-ORD-1004', '30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', null, 'delivered', 'delivery', 320.00, 80.00, 400.00)
on conflict (id) do nothing;

insert into public.order_items (id, order_id, product_id, product_name, sku, quantity, unit_price) values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Native Rattan Basket', 'DEMO-SKU-002', 1, 1200.00),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Woven Abaca Bag', 'DEMO-SKU-001', 1, 850.00),
  ('51000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 'Handwoven Table Runner', 'DEMO-SKU-003', 1, 430.00),
  ('51000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', 'Bamboo Jewelry Set', 'DEMO-SKU-004', 2, 650.00),
  ('51000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000005', 'Native Buri Hat', 'DEMO-SKU-005', 1, 320.00)
on conflict (id) do nothing;

-- The inventory trigger updates products.stock_quantity from these ledger rows.
insert into public.inventory_movements
  (id, product_id, movement_type, quantity_delta, reason, reference_id)
select seed.id, seed.product_id, seed.movement_type, seed.quantity_delta, seed.reason, seed.reference_id
from (values
  ('60000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, 'restock', 13, 'DEMO: opening stock', null::uuid),
  ('60000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, 'sale', -1, 'DEMO: sample order fulfillment', '50000000-0000-4000-8000-000000000002'::uuid),
  ('60000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, 'restock', 8, 'DEMO: opening stock', null::uuid),
  ('60000000-0000-4000-8000-000000000004'::uuid, '20000000-0000-4000-8000-000000000003'::uuid, 'restock', 25, 'DEMO: opening stock', null::uuid),
  ('60000000-0000-4000-8000-000000000005'::uuid, '20000000-0000-4000-8000-000000000004'::uuid, 'restock', 2, 'DEMO: opening stock', null::uuid),
  ('60000000-0000-4000-8000-000000000006'::uuid, '20000000-0000-4000-8000-000000000005'::uuid, 'restock', 5, 'DEMO: opening stock', null::uuid)
) as seed(id, product_id, movement_type, quantity_delta, reason, reference_id)
where not exists (
  select 1 from public.inventory_movements existing where existing.id = seed.id
);

insert into public.payments (id, order_id, method, amount, reference, status) values
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Demo e-wallet', '1280.00', 'DEMO-PAY-1001', 'pending'),
  ('70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Demo bank transfer', '1360.00', 'DEMO-PAY-1002', 'verified'),
  ('70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 'Demo e-wallet', '1380.00', 'DEMO-PAY-1003', 'verified'),
  ('70000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', 'Demo cash on delivery', '400.00', 'DEMO-PAY-1004', 'verified')
on conflict (id) do nothing;

insert into public.return_requests
  (id, request_number, order_id, customer_id, reason, status)
values
  ('80000000-0000-4000-8000-000000000001', 'DEMO-RET-1001', '50000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'DEMO: sample return request for review', 'pending')
on conflict (id) do nothing;

insert into public.feedback
  (id, product_id, customer_id, order_id, rating, comment, moderation_status)
values
  ('90000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 5, 'DEMO: sample feedback; replace with a verified customer review.', 'visible')
on conflict (id) do nothing;

insert into public.promotions
  (id, name, description, discount_type, discount_value, starts_at, ends_at, status)
values
  ('a0000000-0000-4000-8000-000000000001', 'DEMO: Local Craft Welcome', 'Sample promotion only; not connected to checkout.', 'percentage', 10.00, now(), now() + interval '30 days', 'draft'),
  ('a0000000-0000-4000-8000-000000000002', 'DEMO: Heritage Finds', 'Sample fixed discount only; not connected to checkout.', 'fixed_amount', 100.00, now(), now() + interval '14 days', 'draft')
on conflict (id) do nothing;

insert into public.announcements (id, title, message, audience, status)
values
  ('b0000000-0000-4000-8000-000000000001', 'DEMO: Welcome', 'Sample draft announcement. No message has been sent.', 'customers', 'draft')
on conflict (id) do nothing;

commit;

select
  (select count(*) from public.products where sku like 'DEMO-SKU-%') as demo_products,
  (select count(*) from public.customers where email like '%.demo@example.com') as demo_customers,
  (select count(*) from public.orders where order_number like 'DEMO-ORD-%') as demo_orders,
  (select count(*) from public.inventory_movements where reason like 'DEMO:%') as demo_inventory_movements,
  (select count(*) from public.return_requests where request_number like 'DEMO-RET-%') as demo_returns,
  (select count(*) from public.audit_logs where metadata->'row'->>'sku' like 'DEMO-SKU-%') as demo_product_audit_rows;
