import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

type Cycle = {
  id: string
  name: string
  status: 'available' | 'unavailable' | 'maintenance'
  eta_minutes: number | null
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

  useEffect(() => {
    async function loadCycles() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('cycles')
        .select('id, name, status, eta_minutes')
        .order('name', { ascending: true })

      if (error) {
        setError('Unable to load live availability right now.')
      } else if (data) {
        setCycles(data as Cycle[])
      }

      setLoading(false)
    }

    loadCycles()
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

    const rental = activeRental
    function updateRemaining() {
      const end = new Date(rental.endTime as string).getTime()
      const now = Date.now()
      const diffMs = end - now
      if (diffMs <= 0) {
        setRemainingMinutes(0)
        setActiveRental(null)
        localStorage.removeItem('ezyride_active_rental')
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
  const availableCycles = cycles.filter((c) => c.status === 'available').length

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
            <span className="font-bold text-lg">E</span>
          </div>
          <div>
            <p className="text-xs text-neutral/80 uppercase tracking-wide">
              Electric Cycle Rental
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Ezyride</h1>
          </div>
        </div>
        <button className="h-10 w-10 rounded-full border border-white/10 flex flex-col items-center justify-center gap-[3px] bg-white/5">
          <span className="h-[2px] w-4 rounded-full bg-white" />
          <span className="h-[2px] w-3 rounded-full bg-white" />
          <span className="h-[2px] w-5 rounded-full bg-white" />
        </button>
      </header>

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
                  const isAvailable = cycle.status === 'available'
                  return (
                    <div
                      key={cycle.id}
                      className="rounded-2xl border border-white/5 bg-white/5 px-3 py-3 text-xs"
                    >
                      <p className="text-[11px] text-neutral/70">
                        {cycle.name}
                      </p>
                      <p className="mt-1 font-semibold">
                        {isAvailable
                          ? 'Available'
                          : cycle.status === 'maintenance'
                            ? 'Maintenance'
                            : 'In use'}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral/60">
                        {isAvailable
                          ? 'Tap to scan & start'
                          : cycle.eta_minutes != null
                            ? `Back in ${cycle.eta_minutes} min`
                            : 'Currently not available'}
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
          <button
            className="flex flex-col items-center gap-1 text-neutral/70"
            onClick={() => navigate('/scanner')}
          >
            <span className="h-5 w-5 rounded-full border border-white/20 flex items-center justify-center text-[10px]">
              QR
            </span>
            <span>Scanner</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 text-neutral/70"
            onClick={() => navigate('/history')}
          >
            <span className="h-5 w-5 rounded-full border border-white/20 flex items-center justify-center text-[10px]">
              ⏱
            </span>
            <span>History</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 text-neutral/70"
            onClick={() => navigate('/profile')}
          >
            <span className="h-5 w-5 rounded-full border border-white/20 flex items-center justify-center text-[10px]">
              U
            </span>
            <span>Profile</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

export default HomePage