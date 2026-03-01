import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import AppShell from '../components/AppShell'

type Cycle = {
  id: string
  name: string
  status: 'available' | 'unavailable' | 'maintenance'
  eta_minutes: number | null
  unavailable_until?: string | null
}

type ActiveRental = {
  cycleId?: string
  cycleName?: string
  hours?: number
  amount?: number
  startTime?: string
  endTime?: string
}

function HomePage() {
  const navigate = useNavigate()
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeRental, setActiveRental] = useState<ActiveRental | null>(null)
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null)
  const [, setClock] = useState(0)

  useEffect(() => {
    async function loadCycles() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('cycles')
        .select('id, name, status, eta_minutes, unavailable_until')
        .order('name', { ascending: true })

      if (error) {
        setError('Unable to load live availability right now.')
      } else if (data) {
        setCycles(data as Cycle[])
      }

      setLoading(false)
    }

    void loadCycles()

    const channel = supabase
      .channel('public:cycles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cycles' },
        () => {
          // when any cycle row changes, refresh the list
          void loadCycles()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // re-render once a minute so "Back in X min" counts down live
  useEffect(() => {
    const id = window.setInterval(() => setClock((n) => n + 1), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    // Load active rental from local storage on mount
    try {
      const stored = localStorage.getItem('ezyride_active_rental')
      if (stored) {
        const parsed = JSON.parse(stored) as ActiveRental
        setActiveRental(parsed)
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  useEffect(() => {
    if (!activeRental || !activeRental.endTime) {
      setRemainingMinutes(null)
      return
    }

    const rental = activeRental as ActiveRental & { endTime: string }

    async function markCycleAvailable() {
      if (!rental.cycleName) return
      try {
        await supabase
          .from('cycles')
          .update({ status: 'available', eta_minutes: null })
          .eq('name', rental.cycleName)
      } catch {
        // ignore best-effort failure
      }
    }

    function updateRemaining() {
      const end = new Date(rental.endTime as string).getTime()
      const now = Date.now()
      const diffMs = end - now
      if (diffMs <= 0) {
        setRemainingMinutes(0)
        setActiveRental(null)
        localStorage.removeItem('ezyride_active_rental')
        void markCycleAvailable()
        return
      }
      const minutes = Math.ceil(diffMs / (60 * 1000))
      setRemainingMinutes(minutes)
    }

    updateRemaining()
    const id = window.setInterval(updateRemaining, 30 * 1000)
    return () => window.clearInterval(id)
  }, [activeRental])

  const totalCycles = cycles.length
  const nowMs = Date.now()

  function effectiveCycleStatus(cycle: Cycle): Cycle['status'] {
    if (cycle.status !== 'unavailable') return cycle.status
    if (!cycle.unavailable_until) return cycle.status
    const untilMs = new Date(cycle.unavailable_until).getTime()
    if (Number.isNaN(untilMs)) return cycle.status
    return untilMs <= nowMs ? 'available' : 'unavailable'
  }

  function effectiveEtaMinutes(cycle: Cycle): number | null {
    if (effectiveCycleStatus(cycle) !== 'unavailable') return null
    if (cycle.unavailable_until) {
      const untilMs = new Date(cycle.unavailable_until).getTime()
      if (!Number.isNaN(untilMs)) {
        const diff = untilMs - nowMs
        if (diff <= 0) return 0
        return Math.ceil(diff / (60 * 1000))
      }
    }
    return cycle.eta_minutes ?? null
  }

  const availableCycles = cycles.filter((c) => effectiveCycleStatus(c) === 'available').length

  return (
    <AppShell>
      <main className="flex-1 px-6 pb-20">
        <section className="mt-2 space-y-5">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-secondary p-5 shadow-xl">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-white/20" />
            <div className="absolute -right-20 bottom-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />

            <p className="text-xs uppercase tracking-[0.2em] text-white/70">
              SRM RMP campus
            </p>
            <h2 className="mt-2 text-2xl font-semibold leading-snug">
              Ride electric,
              <br />
              arrive in minutes.
            </h2>
            <p className="mt-2 text-sm text-white/80">
              Scan, pay, and start riding eco-friendly cycles across campus.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <button
                className="flex-1 rounded-2xl bg-white text-slate-950 border border-accent px-4 py-3 text-sm font-semibold shadow-md active:scale-[0.98]"
                onClick={() => navigate('/scanner')}
              >
                Rent now
              </button>
              <div className="rounded-2xl bg-white/15 px-3 py-2 text-xs">
                <p className="text-[10px] uppercase tracking-wide text-white/70">
                  Starting at
                </p>
                <p className="font-semibold">₹40 / hour</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral/70">
                  Availability
                </p>
                {loading ? (
                  <p className="mt-1 text-xs text-neutral/60">Loading…</p>
                ) : error ? (
                  <p className="mt-1 text-xs text-amber-300">
                    {error}{' '}
                    <span className="block text-[10px] text-neutral/60">
                      Showing design only. Try again later.
                    </span>
                  </p>
                ) : totalCycles > 0 ? (
                  <p className="mt-1 text-lg font-semibold">
                    {availableCycles} of {totalCycles} cycles free
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-neutral/60">
                    No cycles configured yet. Add them in Supabase.
                  </p>
                )}
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {cycles.length > 0 ? (
                cycles.map((cycle) => {
                  const status = effectiveCycleStatus(cycle)
                  const isAvailable = status === 'available'
                  const eta = effectiveEtaMinutes(cycle)
                  const isUsersActiveCycle =
                    (activeRental?.cycleName && activeRental.cycleName === cycle.name) ||
                    (activeRental?.cycleId && activeRental.cycleId === cycle.id)

                  const statusLabel = isUsersActiveCycle
                    ? 'In use by you'
                    : isAvailable
                      ? 'Available'
                      : cycle.status === 'maintenance'
                        ? 'Maintenance'
                        : 'In use'

                  const description = isUsersActiveCycle
                    ? remainingMinutes != null
                      ? `Your ride: ${remainingMinutes} min left`
                      : 'Your ride is active'
                    : isAvailable
                      ? 'Tap to scan & start'
                      : eta != null
                        ? `Back in ${eta} min`
                        : 'Currently not available'

                  return (
                    <div
                      key={cycle.id}
                      className="rounded-2xl border border-white/5 bg-white/5 px-3 py-3 text-xs"
                    >
                      <p className="text-[11px] text-neutral/70">
                        {cycle.name}
                      </p>
                      <p className="mt-1 font-semibold">
                        {statusLabel}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral/60">
                        {description}
                      </p>
                    </div>
                  )
                })
              ) : (
                <>
                  <div className="rounded-2xl border border-white/5 bg-white/5 px-3 py-3 text-xs opacity-60">
                    <p className="text-[11px] text-neutral/70">Cycle 1</p>
                    <p className="mt-1 font-semibold">Available</p>
                    <p className="mt-1 text-[11px] text-neutral/60">
                      Example card shown until data is added.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-white/5 px-3 py-3 text-xs opacity-40" />
                  <div className="rounded-2xl border border-white/5 bg-white/5 px-3 py-3 text-xs opacity-20" />
                </>
              )}
            </div>
          </div>

          {activeRental && remainingMinutes !== null ? (
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-50">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em]">
                Active rental
              </p>
              <p className="mt-1 text-[13px]">
                {activeRental.cycleName ?? 'Cycle'} ·{' '}
                <span className="font-semibold">
                  {remainingMinutes} min remaining
                </span>
              </p>
              <p className="mt-1 text-[11px] text-emerald-200/80">
                Return the cycle before your timer ends to avoid extra charges.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em]">
                No active rental
              </p>
              <p className="mt-1 text-[13px]">
                Once you start a ride, your timer and cycle details will appear
                here.
              </p>
            </div>
          )}
        </section>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-white/5 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-around px-4 py-2.5 text-[11px]">
          <button
            className="flex flex-col items-center gap-1 text-accent"
            onClick={() => navigate('/home')}
          >
            <span className="h-5 w-5 rounded-full border border-accent flex items-center justify-center text-[10px]">
              H
            </span>
            <span>Home</span>
          </button>
        </div>
      </nav>
    </AppShell>
  )
}

export default HomePage