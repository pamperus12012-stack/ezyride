// Supabase Edge Function: verify Razorpay payment signature (never trust client-only payment success).
// Requires secret: RAZORPAY_SECRET

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VerifyBody {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

async function verifySignature(secret: string, orderId: string, paymentId: string, signature: string): Promise<boolean> {
  const body = `${orderId}|${paymentId}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body)
  )
  const expectedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return expectedHex === signature
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const secret = Deno.env.get('RAZORPAY_SECRET')
  if (!secret) {
    return new Response(
      JSON.stringify({ error: 'Razorpay secret not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let body: VerifyBody
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return new Response(
      JSON.stringify({ error: 'Missing razorpay_order_id, razorpay_payment_id or razorpay_signature' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const valid = await verifySignature(secret, razorpay_order_id, razorpay_payment_id, razorpay_signature)
  if (!valid) {
    return new Response(
      JSON.stringify({ verified: false, error: 'Invalid signature' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ verified: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
