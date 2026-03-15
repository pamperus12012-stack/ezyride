import { useActiveRentalLocation } from '../hooks/useActiveRentalLocation'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import AppShell from '../components/AppShell'

type Rental = {
  id: string
  cycle_name: string
  start_time: string
  end_time: string
  total_amount: number
  created_at: string
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function formatTimeRange(startIso: string, endIso: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const s = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const e = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${s} – ${e}`
}

function HistoryPage() {
  const [rentals, setRentals] = useState<Rental[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadHistory() {
      setLoading(true)
      setError(null)

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
          setError('Please log in to view your ride history.')
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('rentals')
          .select('id, cycle_name, start_time, end_time, total_amount, created_at')
          .eq('user_email', user.email)
          .order('created_at', { ascending: false })

        if (error) {
          setError('Unable to load ride history right now.')
        } else if (data) {
          setRentals(data as Rental[])
        }
      } catch {
        setError('Unable to load ride history right now.')
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [])

  return (
    <AppShell>
      <main className="flex-1 px-6 pb-8">
        <header className="pt-2 pb-3">
          <p className="text-xs text-neutral/70 uppercase tracking-[0.25em]">
            Ride history
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Past rentals
          </h1>
          <p className="mt-1 text-xs text-neutral/60">
            View your previous Ezyride trips and amounts paid.
          </p>
        </header>
        {loading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-neutral/60">
            Loading your rides…
          </div>
        ) : error ? (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            {error}
          </div>
        ) : rentals.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-neutral/60">
            No rides to show yet. Complete a rental and it will appear here.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rentals.map((rental) => (
              <div
                key={rental.id}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-neutral/20"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">
                    {rental.cycle_name}
                  </p>
                  <p className="text-[11px] text-neutral/60">
                    {formatDate(rental.created_at)}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-neutral/50">
                  {formatTimeRange(rental.start_time, rental.end_time)}
                </p>
                <p className="mt-2 text-[11px] text-neutral/40">
                  Amount paid:{' '}
                  <span className="font-semibold text-white">
                    ₹{rental.total_amount}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  )
}

export default HistoryPage

