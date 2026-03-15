// Supabase Edge Function: create Razorpay order (server-side so amount cannot be tampered with).
// Requires secrets: RAZORPAY_KEY_ID, RAZORPAY_SECRET

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateOrderBody {
  amount_paise: number
  currency?: string
  receipt?: string
  cycle_name?: string
  hours?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const keyId = Deno.env.get('RAZORPAY_KEY_ID')
  const secret = Deno.env.get('RAZORPAY_SECRET')
  if (!keyId || !secret) {
    return new Response(
      JSON.stringify({ error: 'Razorpay credentials not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let body: CreateOrderBody
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const amount_paise = Number(body.amount_paise)
  if (!Number.isInteger(amount_paise) || amount_paise < 10) {
    return new Response(
      JSON.stringify({ error: 'amount_paise must be an integer >= 10' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const currency = body.currency ?? 'INR'
  const receipt = body.receipt ?? `ezyride_${Date.now()}`
  const notes: Record<string, string> = {}
  if (body.cycle_name) notes.cycle_name = String(body.cycle_name).slice(0, 256)
  if (body.hours != null) notes.hours = String(body.hours)

  const auth = btoa(`${keyId}:${secret}`)
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: amount_paise,
      currency,
      receipt,
      notes: Object.keys(notes).length ? notes : undefined,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: data.error?.description ?? 'Razorpay order creation failed' }),
      { status: res.status >= 400 && res.status < 500 ? res.status : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ order_id: data.id }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
