# Supabase

This folder contains database migrations for Ezyride.

## Applying migrations

### Option 1: Supabase Dashboard (SQL Editor)

1. Open your [Supabase project](https://supabase.com/dashboard) → **SQL Editor**.
2. Copy the contents of `migrations/20250315000000_enable_rls.sql`.
3. Paste and run the script.

### Option 2: Supabase CLI

If you use [Supabase CLI](https://supabase.com/docs/guides/cli) and have linked your project:

```bash
supabase db push
```

Or run the migration file directly:

```bash
supabase db execute -f supabase/migrations/20250315000000_enable_rls.sql
```

## What the RLS migration does

- **cycles:** Authenticated users can read all rows and update any row (needed for marking cycles available/unavailable during rental flow).
- **rentals:** Users can only select and insert rows where `user_email` matches their auth email.
- **admin_users:** Users can only select the row where `user_id` matches their auth uid (used to show/hide Admin in the app).
- **cycle_locations** (if the table exists): Authenticated read and upsert for location updates from the app.

After applying, ensure your tables `cycles`, `rentals`, and `admin_users` exist. The script enables RLS and creates the policies; it does not create the tables.
