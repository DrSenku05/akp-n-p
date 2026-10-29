begin;

insert into public.product_categories (name, description)
values ('Native Materials', 'Actual AKP demo inventory from the handwritten stock list.')
on conflict (name) do nothing;

with category as (
  select id from public.product_categories where name = 'Native Materials'
), actual_items (sku, name, description, base_stock, reorder_level, unit_label) as (
  values
    ('AKP-ACT-001', '#1 Can', 'Actual demo inventory item.', 5, 6, 'kit'),
    ('AKP-ACT-002', 'Tadtad', 'Actual demo inventory item.', 2, 6, 'bundles'),
    ('AKP-ACT-003', 'Bamboo Slice', 'Actual demo inventory item.', 10, 12, 'bundles'),
    ('AKP-ACT-004', 'Bagakay Plain', 'Actual demo inventory item.', 10, 12, 'pieces'),
    ('AKP-ACT-005', 'Bamboo Pole (Punta)', 'Actual demo inventory item.', 5, 6, 'pieces'),
    ('AKP-ACT-006', '#3 Can', 'Actual demo inventory item.', 25, 15, 'kits'),
    ('AKP-ACT-007', 'Uling', 'Actual demo inventory item.', 11, 12, 'sacks'),
    ('AKP-ACT-008', 'Clay Burner', 'Actual demo inventory item.', 1, 6, 'piece'),
    ('AKP-ACT-009', 'Ritas', 'Actual demo inventory item.', 70, 30, 'bundles'),
    ('AKP-ACT-010', 'African Plain', 'Actual demo inventory item.', 15, 12, 'pieces'),
    ('AKP-ACT-011', 'African Decor', 'Actual demo inventory item.', 2, 6, 'pieces'),
    ('AKP-ACT-012', 'Rattan Tip', 'Actual demo inventory item.', 11, 12, 'bundles'),
    ('AKP-ACT-013', 'Sadot', 'Actual demo inventory item.', 1, 6, 'piece'),
    ('AKP-ACT-014', 'Pusog', 'Actual demo inventory item.', 8, 12, 'pieces'),
    ('AKP-ACT-015', '#25 Can', 'Actual demo inventory item.', 14, 12, 'kits'),
    ('AKP-ACT-016', 'Kullungan', 'Actual demo inventory item.', 1, 6, 'piece'),
    ('AKP-ACT-017', 'Pugaran', 'Actual demo inventory item.', 6, 9, 'pieces'),
    ('AKP-ACT-018', 'Clay Calan (Kalan)', 'Actual demo inventory item.', 1, 6, 'piece'),
    ('AKP-ACT-019', 'Nito Basket', 'Actual demo inventory item.', 1, 6, 'piece')
)
insert into public.products
  (sku, name, description, category_id, price, stock_quantity, reorder_level, craft_origin, is_featured, visibility)
select
  item.sku,
  item.name,
  item.description,
  category.id,
  0,
  item.base_stock * 3,
  item.reorder_level,
  'Philippines · actual demo inventory',
  false,
  'published'
from actual_items item
cross join category
on conflict (sku) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  stock_quantity = excluded.stock_quantity,
  reorder_level = excluded.reorder_level,
  craft_origin = excluded.craft_origin,
  visibility = excluded.visibility,
  updated_at = now();

drop trigger if exists inventory_movements_are_immutable on public.inventory_movements;

delete from public.inventory_movements
where product_id in (
  select id from public.products where sku like 'DEMO-SKU-%'
);

delete from public.products
where sku like 'DEMO-SKU-%';

create trigger inventory_movements_are_immutable
  before update or delete on public.inventory_movements
  for each row execute function app_private.reject_inventory_movement_mutation();

commit;

select sku, name, stock_quantity, reorder_level
from public.products
where sku like 'AKP-ACT-%'
order by sku;
