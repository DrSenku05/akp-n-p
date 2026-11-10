# GCash payment settings handoff

The admin Settings page uses a singleton `public.store_payment_settings` record with these columns:

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | boolean primary key, constrained to `true` | One store-wide settings record |
| `account_name` | text | GCash account's registered name |
| `account_number` | text | GCash account/mobile number |
| `qr_url` | text, nullable | Public URL for the uploaded QR image |
| `qr_path` | text, nullable | Storage object path, e.g. `payment/gcash-<uuid>-qr.png` |
| `enabled` | boolean, default `false` | Whether the customer app should offer GCash |
| `updated_at` | timestamptz | Last change time |

Enable RLS. The public API endpoint reads only the enabled row; grant `anon` SELECT with an RLS policy that limits it to `enabled = true`. Allow active admins to read; restrict insert/update to active owners. The admin API is `GET/PUT /api/admin/payment-settings`; the customer app can read `GET /api/public/payment-settings`, whose response is `{ "gcash": { "accountName", "accountNumber", "qrUrl" } }` when enabled, otherwise `{ "gcash": null }`.

Run `supabase/sql/akp_gcash_payment_storage.sql` to create the public-read QR bucket with owner-only management. The image is public because customers must scan it; do not place secrets or payment credentials beyond the account display name/number in this record. Payment verification remains manual.
