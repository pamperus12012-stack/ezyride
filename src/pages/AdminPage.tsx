import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabaseClient'

type Cycle = {
  id: string
  name: string
  status: string
  unavailable_until?: string | null
}

type CycleLocation = {
  cycle_name: string
  last_latitude: number | null
  last_longitude: number | null
  last_location_at: string | null
}

function AdminPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [locations, setLocations] = useState<CycleLocation[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      setError(null)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!mounted) return

      if (userError || !user) {
        navigate('/login', { replace: true })
        return
      }

      const { data: adminRow, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mounted) return

      if (adminError || !adminRow) {
        setIsAdmin(false)
        setLoading(false)
        return
      }

      setIsAdmin(true)

      const [{ data: cyclesData, error: cyclesError }, { data: locData, error: locError }] =
        await Promise.all([
          supabase.from('cycles').select('id, name, status, unavailable_until').order('name', { ascending: true }),
          supabase
            .from('cycle_locations')
            .select('cycle_name, last_latitude, last_longitude, last_location_at')
            .order('cycle_name', { ascending: true }),
        ])

      if (!mounted) return

      if (cyclesError) {
        setError(cyclesError.message)
      } else {
        setCycles((cyclesData ?? []) as Cycle[])
      }

      if (locError) {
        setError((prev) => prev ?? locError.message)
      } else {
        setLocations((locData ?? []) as CycleLocation[])
      }

      setLoading(false)
    }

    void load()

    return () => {
      mounted = false
    }
  }, [navigate])

  const locationByCycleName = useMemo(() => {
    const map = new Map<string, CycleLocation>()
    for (const l of locations) map.set(l.cycle_name, l)
    return map
  }, [locations])

  return (
    <AppShell>
      <main className="flex-1 px-6 pb-8 space-y-4 pt-2">
        <header className="pb-2">
          <p className="text-xs text-neutral/70 uppercase tracking-[0.25em]">
            Admin
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Live cycle status
          </h1>
          <p className="mt-1 text-xs text-neutral/60">
            Only admins can view live locations.
          </p>
        </header>

        {!isAdmin && !loading ? (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]">
              Not authorized
            </p>
            <p className="mt-1 text-[13px]">
              Your account is not marked as an admin in Supabase.
            </p>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-xs text-red-100">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]">
              Error
            </p>
            <p className="mt-1 text-[13px]">{error}</p>
          </section>
        ) : null}

        {loading ? (
          <p className="text-xs text-neutral/60">Loading…</p>
        ) : isAdmin ? (
          <div className="space-y-3">
            {cycles.map((c) => {
              const loc = locationByCycleName.get(c.name)
              const hasLoc =
                loc?.last_latitude != null && loc?.last_longitude != null
              const mapsUrl = hasLoc
                ? `https://www.google.com/maps?q=${loc!.last_latitude},${loc!.last_longitude}`
                : null

              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm space-y-1"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-neutral/60">
                      {c.status}
                    </span>
                  </div>

                  {c.unavailable_until ? (
                    <p className="text-[11px] text-neutral/60">
                      Busy until:{' '}
                      {new Date(c.unavailable_until).toLocaleString()}
                    </p>
                  ) : null}

                  {hasLoc ? (
                    <>
                      <p className="text-[11px] text-neutral/60">
                        Lat: {loc!.last_latitude!.toFixed(5)} · Lng:{' '}
                        {loc!.last_longitude!.toFixed(5)}
                      </p>
                      <p className="text-[11px] text-neutral/60">
                        Updated:{' '}
                        {loc!.last_location_at
                          ? new Date(loc!.last_location_at).toLocaleString()
                          : '—'}
                      </p>
                      <a
                        href={mapsUrl!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[11px] text-accent underline underline-offset-2"
                      >
                        Open in Google Maps
                      </a>
                    </>
                  ) : (
                    <p className="text-[11px] text-neutral/60">
                      No location yet.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </main>
    </AppShell>
  )
}

export default AdminPage

