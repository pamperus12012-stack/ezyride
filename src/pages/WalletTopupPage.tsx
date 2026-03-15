import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseFunctionsClient } from '../lib/supabaseClient'

const presets = [100, 200, 500] as const

declare global {
  interface Window {
    Razorpay?: any
  }
}

function WalletTopupPage() {
  const navigate = useNavigate()
  const [amount, setAmount] = useState<number>(200)
  const [paying, setPaying] = useState(false)

  async function handleTopup() {
    if (paying) return
    setPaying(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setPaying(false)
      navigate('/login', { replace: true })
      return
    }

    const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined

    // If Razorpay is not configured, fall back to direct credit (dev/test only).
    if (!window.Razorpay || !keyId) {
      const { data: walletResult, error } = await supabaseFunctionsClient.functions.invoke(
        'wallet-apply-transaction',
        {
          body: {
            type: 'credit',
            amount,
            reason: 'Wallet top up (manual)',
          },
        },
      )

      setPaying(false)

      if (error || !walletResult?.ok) {
        alert('Unable to update wallet right now. Please try again.')
        return
      }

      navigate('/wallet', { replace: true })
      return
    }

    const amountPaise = amount * 100

    const {
      data: orderData,
      error: orderError,
    } = await supabaseFunctionsClient.functions.invoke('create-razorpay-order', {
      body: {
        amount_paise: amountPaise,
        currency: 'INR',
      },
    })

    if (orderError || !orderData?.order_id) {
      console.error('Wallet top-up create-razorpay-order error', {
        orderError,
        orderData,
      })
      setPaying(false)
      alert(
        `Unable to start payment right now. Please try again.\n\n${
          (orderError as any)?.message || orderData?.error || ''
        }`,
      )
      return
    }

    const orderId = orderData.order_id as string

    const options: Record<string, unknown> = {
      key: keyId,
      name: 'Ezyride',
      description: 'Wallet top up',
      order_id: orderId,
      prefill: { email: user.email ?? '' },
      theme: { color: '#1E40AF' },
      handler: async (response: {
        razorpay_order_id?: string
        razorpay_payment_id?: string
        razorpay_signature?: string
      }) => {
        if (
          response.razorpay_order_id &&
          response.razorpay_payment_id &&
          response.razorpay_signature
        ) {
          const { data: verifyData } = await supabaseFunctionsClient.functions.invoke(
            'verify-razorpay-payment',
            {
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            },
          )

          if (verifyData?.verified !== true) {
            alert(
              'Payment verification failed. Please contact support if you were charged.',
            )
            setPaying(false)
            return
          }
        }

        const { data: walletResult, error } =
          await supabaseFunctionsClient.functions.invoke('wallet-apply-transaction', {
            body: {
              type: 'credit',
              amount,
              reason: 'Wallet top up via Razorpay',
            },
          })

        if (error || !walletResult?.ok) {
          alert(
            'Payment succeeded but wallet update failed. Please contact support.',
          )
          setPaying(false)
          return
        }

        setPaying(false)
        navigate('/wallet', { replace: true })
      },
    }

    setPaying(false)
    const rzp = new window.Razorpay(options)
    rzp.open()
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      <header className="px-6 pt-8 pb-4 flex items-center justify-between">
        <button
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs"
          onClick={() => navigate(-1)}
        >
          Back
        </button>
        <div className="text-right">
          <p className="text-[11px] text-neutral/60 uppercase tracking-[0.18em]">
            Wallet
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Top up</h1>
        </div>
      </header>

      <main className="flex-1 px-6 pb-6 space-y-5">
        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm space-y-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral/70">
            Amount
          </p>

          <div className="grid grid-cols-3 gap-2">
            {presets.map((p) => (
              <button
                key={p}
                className={
                  p === amount
                    ? 'rounded-xl bg-white text-slate-950 border border-accent px-3 py-2 text-xs font-semibold'
                    : 'rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90'
                }
                onClick={() => setAmount(p)}
              >
                ₹{p}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-neutral/60">
            <span>Hourly rate</span>
            <span className="font-semibold text-white">₹40 / hour</span>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-slate-950/90 backdrop-blur-md px-6 py-3">
        <button
          onClick={handleTopup}
          disabled={paying}
          className="w-full rounded-2xl bg-white text-slate-950 border border-accent px-4 py-3 text-sm font-semibold shadow-md active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
        >
          {paying ? 'Updating…' : `Add ₹${amount} to wallet`}
        </button>
      </footer>
    </div>
  )
}

export default WalletTopupPage

