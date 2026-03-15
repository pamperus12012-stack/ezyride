-- Ezyride Wallet System (schema + RLS)
-- Run in Supabase SQL Editor (recommended) or via Supabase CLI.

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_user_id_created_at_idx
  ON public.wallet_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  block_type text NOT NULL CHECK (block_type IN ('wallet_limit_exceeded')),
  blocked_until timestamptz NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, block_type)
);

CREATE INDEX IF NOT EXISTS user_blocks_user_id_idx ON public.user_blocks (user_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- wallets: user can read their own wallet; writes are done via Edge Functions (service role)
DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
CREATE POLICY "wallets_select_own"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- wallet_transactions: user can read their own transactions; writes via Edge Functions
DROP POLICY IF EXISTS "wallet_transactions_select_own" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_select_own"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- user_blocks: user can read their own block status; writes via Edge Functions/admin
DROP POLICY IF EXISTS "user_blocks_select_own" ON public.user_blocks;
CREATE POLICY "user_blocks_select_own"
  ON public.user_blocks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

