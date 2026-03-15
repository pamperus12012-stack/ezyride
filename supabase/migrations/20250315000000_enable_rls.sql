-- Ezyride RLS (Row Level Security) migration
-- Run this in Supabase SQL Editor or via Supabase CLI (supabase db push)
-- Ensures: users see only their rentals; cycles readable by all authenticated; admin check scoped to own row.

-- =============================================================================
-- cycles: all authenticated users can read; authenticated can update (for rental flow)
-- =============================================================================
ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cycles_select_authenticated"
  ON public.cycles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "cycles_update_authenticated"
  ON public.cycles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- rentals: users see only their own rows; can insert only with their own email
-- =============================================================================
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rentals_select_own"
  ON public.rentals FOR SELECT
  TO authenticated
  USING (user_email = (auth.jwt() ->> 'email'));

CREATE POLICY "rentals_insert_own"
  ON public.rentals FOR INSERT
  TO authenticated
  WITH CHECK (user_email = (auth.jwt() ->> 'email'));

-- =============================================================================
-- admin_users: users can only check if they are in the list (read own row)
-- =============================================================================
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_users_select_own"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- cycle_locations (if it exists as a table): allow read for authenticated;
-- upsert used by active-rental location updates - restrict to authenticated
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cycle_locations'
  ) THEN
    EXECUTE 'ALTER TABLE public.cycle_locations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "cycle_locations_select" ON public.cycle_locations';
    EXECUTE 'CREATE POLICY "cycle_locations_select" ON public.cycle_locations FOR SELECT TO authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS "cycle_locations_upsert" ON public.cycle_locations';
    EXECUTE 'CREATE POLICY "cycle_locations_upsert" ON public.cycle_locations FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;
