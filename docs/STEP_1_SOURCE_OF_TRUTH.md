# Step 1: Source of Truth and Reset Readiness

**Scope:** `akp-native-products` web admin only. This documents the web-admin
checkout and prepares SQL for the shared Supabase project. No database reset
was run and no mobile project was changed.

## What the checkout confirms

- The web admin connects to Supabase for Auth and uses PostgreSQL for its
  server-side database work. Local and deployed admin instances are configured
  through environment variables; this repository does not establish separate
  dev and production projects.
- SQL is maintained as manually applied scripts under `supabase/sql/`.
  They are additive/feature scripts with ordering comments, not a complete,
  verified migration history. `prisma/schema.prisma` describes only legacy
  `user` and `contacts` tables, so it is not the AKP schema authority.
- The owner-only backup flow is implemented in the admin and covers the fixed
  business table list in `lib/admin-database-backups.ts`. It does not establish
  recovery of all database objects, Auth users, Storage objects, or complete
  project configuration. A successful application backup is not proof that
  the Super Admin can be recovered.
- Product records require a unique non-null SKU in the checked-in base schema;
  the product UI/API also generates codes for new products. Existing live
  product rows and uniqueness still need verification in Supabase.

## What must be checked in the live Supabase project

The SQL Editor is the configured schema-management workflow, but repository
files cannot prove the current cloud schema or data. Run
[`akp_step1_source_of_truth_preflight.sql`](../supabase/sql/akp_step1_source_of_truth_preflight.sql)
in the Supabase Dashboard SQL Editor and save/review the results. Confirm the
owner row is exactly one active `owner`, inspect all foreign keys and Auth-user
links, and compare the catalog against every relevant file under
`supabase/sql/`. The file is read-only.

Also verify in the Supabase Dashboard that:

1. This is the intended shared project and both local and deployed admin
   environment variables point to it; do not print or commit secret values.
2. A backup has been restored successfully in an isolated project. The tested
   admin backup is data-only: it does not restore Auth accounts and does not
   prove recovery of all functions, triggers, policies, Storage, or project
   configuration.
3. The Super Admin can authenticate and has a linked active `public.admin_users`
   row. SQL checks identity and role but cannot perform a login test.
4. Storage buckets/files and required store/payment/inventory settings are
   accounted for. The reset script intentionally preserves Storage and settings.

## Controlled reset procedure

The agreed reset is destructive because local and deployed apps share the same
database. Do not proceed until the preflight is reviewed and the backup has been
tested outside production.

1. Run and retain the read-only preflight results.
2. Reconcile the reset table list in
   [`akp_step1_reset_application_data.sql`](../supabase/sql/akp_step1_reset_application_data.sql)
   with the live FK inventory. It intentionally uses `TRUNCATE ... RESTRICT`;
   an unlisted dependency aborts the transaction without widening the scope.
3. In the reviewed SQL file, change `execute_reset` from `false` to `true`,
   then run the complete file once in the SQL Editor. It clears the listed
   application records, preserves all Auth users and settings, checks the
   Super Admin invariant, and commits atomically. If any statement fails,
   PostgreSQL rolls back the transaction.
4. Review the returned counts. Then in Supabase Dashboard > Authentication >
   Users, delete the five non-Super-Admin users by matching their IDs against
   the reviewed preflight: `akpstaff@akp.local`, `driver@akp.local`,
   `lagartoalvin05@gmail.com`, `owner@akp.local`, and
   `prosperoaliyah28@gmail.com`. Keep
   `1f2a1b81-1366-4aae-a729-f09a191ecf99` (`akpnatives@gmail.com`).
5. Rerun the preflight, verify only the Super Admin remains and is still an
   active owner, then manually test Super Admin login plus local and deployed
   admin connectivity.

The script will not clean unlisted tables. If `TRUNCATE ... RESTRICT` finds a
foreign-key dependency, stop and update the reviewed table scope after
identifying whether that table contains application data or required config.
Do not use `CASCADE` as a shortcut.

## Status

Live checks supplied on 2026-11-16 confirm `akpnatives@gmail.com` is an active
owner (`1f2a1b81-1366-4aae-a729-f09a191ecf99`). Exact public-table counts show
4 admin users, 5,283 audit rows, 16 orders, 26 products, 16 payments, 20
inventory movements, and the other counts listed below. The reset target list
currently covers 5,394 rows across its explicitly truncated application and
audit tables; deletion of other Auth users will also cascade to their
`admin_users` and `user_presence` rows. Auth-linked customer/driver rows are
truncated as application data.

The user confirmed that the existing data-only backup was restored successfully
in an isolated project; Auth accounts are not part of that restore. The reset
SQL preserves Auth users; non-owner accounts are deleted separately through
the Supabase Dashboard. The live
database has one `database_backups` metadata row. Shared-project URL identity,
database-object recovery, and post-reset login remain unverified. No reset has
been executed. Step 2 remains out of scope.
