# Step 2 — Products, Inventory, and Native Heritage

This change replaces the separate Products, Inventory, and Heritage Showcase admin pages with one Products screen. Existing `/inventory` and `/heritage-showcase` links redirect to the matching section.

## Database setup

1. In Supabase, confirm you are in the AKP project and that the Step 1 reset is complete.
2. Open `supabase/sql/akp_step2_products_inventory_heritage.sql` in Supabase SQL Editor.
3. Review the script, then run it once. It is additive and transactional; it does not clear existing catalog or order data.
4. If the editor reports an error, stop and share the full error before retrying. Do not run only selected portions.
5. Refresh the web admin and open **Products**. The screen requires an active owner or staff session and the existing `product-images` bucket setup (`supabase/sql/akp_product_image_storage.sql`).

The script keeps the existing storefront product columns and protects the SKU, stock, reservation, featured, and publishing fields behind database logic. Product drafts start hidden with zero stock and a generated SKU. Pending orders reserve available stock; accepting an order commits the reservation and deducts physical stock. Cancelling a pending order releases the reservation. Cancelling an accepted order does not restock automatically.

## Admin workflow

- Create a draft with a product image and name. Add category, description, and price afterward.
- Record stock changes as Received, Damage, or Correction with a reason. Inventory history is append-only.
- Add a Native Heritage story and cover image when appropriate. Only an owner can make it required for publishing.
- Publish explicitly after the product has a name, primary image, active category, and price above zero. Archive products to hide them while retaining their records.
- Permanent product deletion is owner-only. It preserves SKU reservation and historical order and movement snapshots.

The admin keeps the existing catalog fields used by the customer app, including `image_url`, `craft_origin`, `is_featured`, and physical `stock_quantity`. The separate Native Heritage story and gallery are currently managed in the web admin; showing the new story text, cover, and available-stock number in the mobile storefront requires a later mobile-app update.

The admin backup flow now includes product images, heritage stories, and order reservations. Restoring a pre-Step-2 backup rebuilds reservations for its pending orders and rolls back if the saved stock cannot cover them. The permanent SKU registry and its counter are intentionally excluded from business-data restore so deleted SKUs remain unavailable for reuse.
