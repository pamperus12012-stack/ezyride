// Supabase Edge Function: wallet-apply-transaction
// - Credits wallet on successful top-up payment
// - Debits wallet during rental usage (₹40/hour)
// - Enforces negative limit: balance cannot go below -40; if it would, user is blocked
//
// Secrets required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Notes:
// - Razorpay Secret/verification happens in separate functions. This function just updates wallet safely.
// - Uses the caller's JWT (Authorization header) to identify the user, but writes with service role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Body = {
  type: 'credit' | 'debit'
  amount: number // rupees (can be decimal, but app uses integers)
  reason?: string
}

const MIN_BALANCE = -40

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  // Name cannot start with SUPABASE_ in Supabase secrets, so we use SUPA_SERVICE_ROLE_KEY
  const serviceKey = Deno.env.get('SUPA_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Supabase env not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const type = body.type
  const amount = Number(body.amount)
  if (type !== 'credit' && type !== 'debit') {
    return new Response(JSON.stringify({ error: 'Invalid type' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return new Response(JSON.stringify({ error: 'amount must be > 0' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // service role for DB writes, but use caller JWT for auth.getUser()
  const supabase = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userId = user.id
  const userEmail = user.email ?? null

  // If currently blocked, allow credit to potentially recover; disallow debit while blocked.
  const { data: blockRow } = await supabase
    .from('user_blocks')
    .select('id, blocked_until')
    .eq('user_id', userId)
    .eq('block_type', 'wallet_limit_exceeded')
    .maybeSingle()

  const nowIso = new Date().toISOString()
  const isBlocked =
    !!blockRow &&
    (blockRow.blocked_until == null ||
      new Date(blockRow.blocked_until).getTime() > Date.now())

  if (isBlocked && type === 'debit') {
    return new Response(JSON.stringify({ error: 'User is blocked', blocked: true }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Load/create wallet
  let { data: wallet } = await supabase
    .from('wallets')
    .select('user_id, user_email, balance')
    .eq('user_id', userId)
    .maybeSingle()

  if (!wallet) {
    const { data: inserted, error: insertErr } = await supabase
      .from('wallets')
      .insert({ user_id: userId, user_email: userEmail, balance: 0 })
      .select('user_id, user_email, balance')
      .maybeSingle()
    if (insertErr) {
      return new Response(JSON.stringify({ error: 'Failed to create wallet' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    wallet = inserted
  }

  const currentBalance = Number(wallet.balance ?? 0)
  const delta = type === 'credit' ? amount : -amount
  const nextBalance = currentBalance + delta

  // If debit would exceed negative limit -> block user and reject transaction
  if (type === 'debit' && nextBalance < MIN_BALANCE) {
    await supabase.from('user_blocks').upsert({
      user_id: userId,
      user_email: userEmail,
      block_type: 'wallet_limit_exceeded',
      blocked_until: null,
      reason: `Wallet balance would go below ₹${MIN_BALANCE} (attempted debit ₹${amount}).`,
      created_at: nowIso,
    })

    return new Response(
      JSON.stringify({
        error: 'Wallet limit exceeded. Account blocked.',
        blocked: true,
        balance: currentBalance,
        min_balance: MIN_BALANCE,
      }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Apply update + transaction record
  const { error: updErr } = await supabase
    .from('wallets')
    .update({ balance: nextBalance, updated_at: nowIso, user_email: userEmail })
    .eq('user_id', userId)

  if (updErr) {
    return new Response(JSON.stringify({ error: 'Failed to update wallet' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  await supabase.from('wallet_transactions').insert({
    user_id: userId,
    user_email: userEmail,
    amount: delta,
    type,
    reason: body.reason ?? null,
    created_at: nowIso,
  })

  // Auto-unblock if credited back to a safe balance
  if (type === 'credit' && nextBalance >= MIN_BALANCE && isBlocked) {
    await supabase
      .from('user_blocks')
      .delete()
      .eq('user_id', userId)
      .eq('block_type', 'wallet_limit_exceeded')
  }

  return new Response(
    JSON.stringify({ ok: true, balance: nextBalance, blocked: false }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})

