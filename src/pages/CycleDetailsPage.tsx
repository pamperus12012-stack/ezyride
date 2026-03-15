import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type LocationState = {
  cycleName?: string
}

function CycleDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as LocationState

  const [hours, setHours] = useState(1)
  const [availabilityNote, setAvailabilityNote] = useState<string | null>(null)
  const [canRent, setCanRent] = useState(true)

  const cycleName = useMemo(() => {
    if (state.cycleName) return state.cycleName
    if (id) return `Cycle ${id}`
    return 'Cycle'
  }, [id, state.cycleName])

  const hourlyRate = 40
  const totalAmount = hours * hourlyRate

  useEffect(() => {
    async function checkAvailability() {
      if (!id) return
      setAvailabilityNote(null)
      setCanRent(true)

      const { data, error } = await supabase
        .from('cycles')
        .select('status, eta_minutes, unavailable_until, name')
        .eq('name', cycleName)
        .maybeSingle()

      if (error) {
        return
      }

      if (!data) {
        setAvailabilityNote('This cycle is not configured yet.')
        setCanRent(false)
        return
      }

      const nowMs = Date.now()
      const untilMs = data.unavailable_until
        ? new Date(data.unavailable_until).getTime()
        : null

      const isEffectivelyAvailable =
        data.status === 'available' ||
        (data.status === 'unavailable' &&
          untilMs != null &&
          !Number.isNaN(untilMs) &&
          untilMs <= nowMs)

      if (!isEffectivelyAvailable) {
        let note = 'Currently in use'
        if (untilMs != null && !Number.isNaN(untilMs)) {
          const diff = untilMs - nowMs
          const mins = diff > 0 ? Math.ceil(diff / (60 * 1000)) : 0
          note = `Back in ${mins} min`
        } else if (typeof data.eta_minutes === 'number') {
          note = `Back in ${data.eta_minutes} min`
        }
        setAvailabilityNote(note)
        setCanRent(false)
      }
    }

    void checkAvailability()
  }, [cycleName, id])

  function handlePayNow() {
    if (!canRent) {
      alert('This cycle is currently in use. Please pick another cycle.')
      return
    }
    // Wallet-only flow: ensure at least ₹40 available before proceeding
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login', { replace: true })
        return
      }

      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle()

      const balance = Number(wallet?.balance ?? 0)
      if (!Number.isFinite(balance) || balance < 40) {
        alert(
          'You need at least ₹40 in your wallet to start a ride. Please top up your wallet first.',
        )
        navigate('/wallet')
        return
      }

      const now = new Date()
      const end = new Date(now.getTime() + hours * 60 * 60 * 1000)

      navigate('/confirmation', {
        replace: false,
        state: {
          cycleId: id,
          cycleName,
          hours,
          amount: totalAmount,
          startTime: now.toISOString(),
          endTime: end.toISOString(),
        },
      })
    })()
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
            Cycle selected
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            {cycleName}
          </h1>
        </div>
      </header>

      <main className="flex-1 px-6 pb-6 space-y-5">
        <section className="rounded-3xl bg-gradient-to-br from-primary/80 via-primary to-secondary/80 p-4 shadow-xl">
          <div className="h-28 rounded-2xl bg-black/20 mb-3 flex items-center justify-center text-xs text-white/70 border border-white/10">
            Cycle image / gallery placeholder
          </div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">
            Specs
          </p>
          <p className="mt-1 text-xs text-white/80">
            Electric assist, campus‑approved speed limit, front & rear lights,
            suitable for everyday campus rides.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-neutral/70">
                Duration
              </p>
              <p className="mt-1 text-sm text-neutral/10">
                Choose how long you want to ride.
              </p>
            </div>
            <p className="text-sm font-semibold">
              {hours} hour{hours > 1 ? 's' : ''}
            </p>
          </div>

          <input
            type="range"
            min={1}
            max={6}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="w-full accent-accent"
          />

          <div className="flex items-center justify-between text-xs text-neutral/60">
            <span>Minimum 1 hour, up to 6 hours per ride.</span>
            <span className="text-neutral/40">₹{hourlyRate} / hour</span>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Estimated total</span>
            <span className="text-base font-semibold">₹{totalAmount}</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral/60">
            Price is calculated as ₹40 × selected hours. Final amount will be
            confirmed on the payment screen.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] text-neutral/60 space-y-1">
          <p className="font-semibold text-neutral/20 uppercase tracking-[0.18em]">
            Terms of rental
          </p>
          <p>
            Return the cycle to an official Ezyride stand before your time ends
            to avoid extra charges. Damage or loss may incur additional fees as
            per campus policy.
          </p>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-slate-950/90 backdrop-blur-md px-6 py-3">
        {availabilityNote && !canRent && (
          <p className="mb-2 text-[11px] text-amber-200 text-center">
            {availabilityNote}. Please choose a different cycle.
          </p>
        )}
        <button
          onClick={handlePayNow}
          disabled={!canRent}
          className="w-full rounded-2xl bg-white text-slate-950 border border-accent px-4 py-3 text-sm font-semibold shadow-md active:scale-[0.98] disabled:opacity-60"
        >
          Pay now · ₹{totalAmount}
        </button>
      </footer>
    </div>
  )
}

export default CycleDetailsPage

