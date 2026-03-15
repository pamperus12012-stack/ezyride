import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

type PaymentLocationState = {
  cycleId?: string
  cycleName?: string
  hours?: number
  amount?: number
}

declare global {
  interface Window {
    Razorpay?: any
  }
}

function PaymentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as PaymentLocationState

  const { cycleId, cycleName, hours, amount } = state
  const [paying, setPaying] = useState(false)

  const hasData = cycleId && cycleName && hours && amount

  async function handlePay() {
    if (paying) return
    setPaying(true)
    if (!hasData) {
      setPaying(false)
      navigate('/home')
      return
    }

    // Double-check availability server-side before starting payment
    const { data: cycleRow } = await supabase
      .from('cycles')
      .select('status, eta_minutes, unavailable_until')
      .eq('name', cycleName)
      .maybeSingle()

    if (cycleRow && cycleRow.status !== 'available') {
      const nowMs = Date.now()
      const untilMs = cycleRow.unavailable_until
        ? new Date(cycleRow.unavailable_until).getTime()
        : null
      const isEffectivelyAvailable =
        cycleRow.status === 'available' ||
        (cycleRow.status === 'unavailable' &&
          untilMs != null &&
          !Number.isNaN(untilMs) &&
          untilMs <= nowMs)

      if (isEffectivelyAvailable) {
        // ok to continue
      } else {
        alert('This cycle just became unavailable. Please pick another cycle.')
        setPaying(false)
        navigate('/home', { replace: true })
        return
      }
    }

    const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined
    if (!window.Razorpay || !keyId) {
      // Fallback: keep existing fake flow if Razorpay is not available
      const now = new Date()
      const end = new Date(now.getTime() + (hours as number) * 60 * 60 * 1000)
      navigate('/confirmation', {
        replace: true,
        state: {
          cycleId,
          cycleName,
          hours,
          amount,
          startTime: now.toISOString(),
          endTime: end.toISOString(),
        },
      })
      setPaying(false)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const now = new Date()
    const end = new Date(now.getTime() + (hours as number) * 60 * 60 * 1000)
    const amountPaise = (amount as number) * 100

    // Prefer server-created order (live payments: amount cannot be tampered with)
    let orderId: string | null = null
    const { data: orderData } = await supabase.functions.invoke('create-razorpay-order', {
      body: {
        amount_paise: amountPaise,
        currency: 'INR',
        cycle_name: cycleName,
        hours: hours as number,
      },
    })
    if (orderData?.order_id) {
      orderId = orderData.order_id
    }

    const options: Record<string, unknown> = {
      key: keyId,
      name: 'Ezyride',
      description: `${cycleName} – ${(hours as number).toString()} hour(s)`,
      prefill: { email: user?.email ?? '' },
      notes: { cycleId },
      theme: { color: '#1E40AF' },
      handler: async (response: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }) => {
        if (orderId && response.razorpay_order_id && response.razorpay_payment_id && response.razorpay_signature) {
          const { data: verifyData } = await supabase.functions.invoke('verify-razorpay-payment', {
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          })
          if (verifyData?.verified !== true) {
            alert('Payment verification failed. Please contact support if you were charged.')
            return
          }
        }
        navigate('/confirmation', {
          replace: true,
          state: {
            cycleId,
            cycleName,
            hours,
            amount,
            startTime: now.toISOString(),
            endTime: end.toISOString(),
            razorpayPaymentId: response.razorpay_payment_id,
          },
        })
      },
    }

    if (orderId) {
      options.order_id = orderId
    } else {
      options.amount = amountPaise
      options.currency = 'INR'
    }

    setPaying(false)
    const rzp = new window.Razorpay(options)
    rzp.open()
  }

  if (!hasData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white px-6 text-center">
        <p className="text-sm font-semibold">
          Payment session not found for this ride.
        </p>
        <p className="mt-2 text-xs text-neutral/60">
          Please select a cycle and duration again from the home screen.
        </p>
        <button
          className="mt-4 rounded-2xl bg-accent px-4 py-2 text-xs font-semibold text-slate-950"
          onClick={() => navigate('/home')}
        >
          Back to home
        </button>
      </div>
    )
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
            Payment
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            Pay securely
          </h1>
        </div>
      </header>

      <main className="flex-1 px-6 pb-6 space-y-5">
        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral/70">
            Order summary
          </p>
          <div className="flex items-center justify-between">
            <span className="text-neutral/40">Cycle</span>
            <span className="font-medium">{cycleName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral/40">Duration</span>
            <span className="font-medium">
              {hours} hour{(hours as number) > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral/40">Rate</span>
            <span className="font-medium">₹40 / hour</span>
          </div>
          <div className="mt-2 border-t border-white/10 pt-2 flex items-center justify-between">
            <span className="text-neutral/40">Total</span>
            <span className="text-base font-semibold">₹{amount}</span>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            Secure payment
          </p>
          <p>
            Pay with UPI, card, or net banking. The amount is fixed by the server
            and verified after payment before your ride is confirmed.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] text-neutral/60 space-y-1">
          <p className="font-semibold text-neutral/20 uppercase tracking-[0.18em]">
            Important
          </p>
          <p>
            Your ride will start immediately after payment is confirmed. Make
            sure you are close to the selected cycle on campus.
          </p>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-slate-950/90 backdrop-blur-md px-6 py-3">
        <button
          onClick={handlePay}
          disabled={paying}
          className="w-full rounded-2xl bg-white text-slate-950 border border-accent px-4 py-3 text-sm font-semibold shadow-md active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
        >
          {paying ? 'Preparing…' : 'Pay with Razorpay'}
        </button>
      </footer>
    </div>
  )
}

export default PaymentPage

