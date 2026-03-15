import { useLocation, useNavigate } from 'react-router-dom'
import { supabase, supabaseFunctionsClient } from '../lib/supabaseClient'

type ConfirmationLocationState = {
  cycleId?: string
  cycleName?: string
  hours?: number
  amount?: number
  startTime?: string
  endTime?: string
}

function formatTime(iso?: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ConfirmationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as ConfirmationLocationState

  const { cycleId, cycleName, hours, amount, startTime, endTime } = state

  const hasData = cycleName && hours && amount && startTime && endTime

  if (!hasData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white px-6 text-center">
        <p className="text-sm font-semibold">Rental details not found.</p>
        <p className="mt-2 text-xs text-neutral/60">
          Your payment simulation might have been skipped. Start a new ride from
          the home screen.
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

  async function handleStartRiding() {
    // 1. Claim the cycle first (update only if status=available) to prevent double-booking
    let cycleClaimed = false
    try {
      if (cycleName && endTime) {
        const { data: updatedRows, error: updateError } = await supabase
          .from('cycles')
          .update({
            status: 'unavailable',
            unavailable_until: endTime,
          })
          .eq('name', cycleName)
          .eq('status', 'available')
          .select('id')

        if (updateError || !updatedRows?.length) {
          cycleClaimed = true
        }
      }
    } catch {
      cycleClaimed = true
    }

    if (cycleClaimed) {
      alert(
        'This cycle was just taken by someone else. Your payment was successful; please contact support if you were charged, or pick another cycle from home.',
      )
      navigate('/home')
      return
    }

    // 2. Charge first hour from wallet (₹40). Wallet can go down to -₹40.
    const hourlyRate = 40
    let chargedHours = 0
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('no_user')
      }

      const { data: walletResult } = await supabaseFunctionsClient.functions.invoke(
        'wallet-apply-transaction',
        {
          body: {
            type: 'debit',
            amount: hourlyRate,
            reason: `Ride started: ${cycleName} (hour 1)`,
            user_id: user.id,
            user_email: user.email,
          },
        },
      )

      if (!walletResult?.ok) {
        throw new Error('wallet_debit_failed')
      }
      chargedHours = 1
    } catch {
      // revert cycle claim (best-effort)
      try {
        if (cycleName) {
          await supabase
            .from('cycles')
            .update({ status: 'available', eta_minutes: null, unavailable_until: null })
            .eq('name', cycleName)
        }
      } catch {
        // ignore
      }

      alert('Wallet charge failed (or limit exceeded). Please top up your wallet.')
      navigate('/wallet')
      return
    }

    // 3. Save rental in Supabase history (only after cycle was successfully claimed and wallet was charged)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user && startTime && endTime && amount) {
        await supabase.from('rentals').insert({
          user_email: user.email,
          cycle_name: cycleName,
          start_time: startTime,
          end_time: endTime,
          total_amount: amount,
        })
      }
    } catch {
      // ignore errors for now; UI will still continue
    }

    // 4. Store active rental locally so home screen can show timer
    try {
      const payload = {
        cycleId,
        cycleName,
        hours,
        amount,
        startTime,
        endTime,
        chargedHours,
      }
      localStorage.setItem('ezyride_active_rental', JSON.stringify(payload))
    } catch {
      // ignore storage errors for now
    }

    navigate('/home')
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      <main className="flex-1 px-6 pt-16 pb-8 flex flex-col items-center">
        <div className="h-20 w-20 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-400/60 shadow-lg">
          <span className="text-3xl">✓</span>
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-center">
          Rental confirmed
        </h1>
        <p className="mt-2 text-xs text-neutral/60 text-center max-w-xs">
          Your payment has been processed and your electric cycle is now ready
          to ride on campus.
        </p>

        <section className="mt-6 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm space-y-1.5">
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
            <span className="text-neutral/40">Start time</span>
            <span className="font-medium">{formatTime(startTime)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral/40">End time</span>
            <span className="font-medium">{formatTime(endTime)}</span>
          </div>
          <div className="mt-2 border-t border-white/10 pt-2 flex items-center justify-between">
            <span className="text-neutral/40">Amount paid</span>
            <span className="text-base font-semibold">₹{amount}</span>
          </div>
        </section>

        <section className="mt-4 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] text-neutral/60 space-y-1">
          <p className="font-semibold text-neutral/20 uppercase tracking-[0.18em]">
            Next steps
          </p>
          <p>
            Unlock the cycle using the instructions at the stand, start your
            ride, and return it before the end time to avoid extra charges.
          </p>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-slate-950/90 backdrop-blur-md px-6 py-3">
        <button
          onClick={handleStartRiding}
          className="w-full rounded-2xl bg-white text-slate-950 border border-accent px-4 py-3 text-sm font-semibold shadow-md active:scale-[0.98]"
        >
          Start riding · Go to home
        </button>
      </footer>
    </div>
  )
}

export default ConfirmationPage

