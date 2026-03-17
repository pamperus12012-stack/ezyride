import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabaseClient'

const ADMIN_UNLOCK_STORAGE_KEY = 'ezyride_admin_unlocked_v1'

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
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [locations, setLocations] = useState<CycleLocation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshingCycle, setRefreshingCycle] = useState<string | null>(null)
  const [hasPasswordAccess, setHasPasswordAccess] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_UNLOCK_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!hasPasswordAccess) return
    try {
      localStorage.setItem(ADMIN_UNLOCK_STORAGE_KEY, 'true')
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [hasPasswordAccess])

  const locationByCycleName = useMemo(() => {
    const map = new Map<string, CycleLocation>()
    for (const l of locations) map.set(l.cycle_name, l)
    return map
  }, [locations])

  async function refreshCycleLocation(cycleName: string) {
    setError(null)
    setRefreshingCycle(cycleName)
    const { data, error: locError } = await supabase
      .from('cycle_locations')
      .select('cycle_name, last_latitude, last_longitude, last_location_at')
      .eq('cycle_name', cycleName)
      .maybeSingle()

    if (locError) {
      setError(locError.message)
      setRefreshingCycle(null)
      return
    }

    setLocations((prev) => {
      const next = prev.filter((l) => l.cycle_name !== cycleName)
      if (data) next.push(data as CycleLocation)
      next.sort((a, b) => a.cycle_name.localeCompare(b.cycle_name))
      return next
    })
    setRefreshingCycle(null)
  }

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

        {!loading && !hasPasswordAccess ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral/60">
              Admin password required
            </p>
            <p className="text-[13px] text-neutral/70">
              Enter the admin password to unlock admin tools on this device.
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                setPasswordError(null)
                const expected =
                  import.meta.env.VITE_ADMIN_ACCESS_PASSWORD ?? 'ezyride-admin'
                if (passwordInput.trim() === expected) {
                  setHasPasswordAccess(true)
                  setPasswordInput('')
                } else {
                  setPasswordError('Incorrect admin password.')
                }
              }}
            >
              <input
                type="password"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Admin password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoComplete="off"
              />
              {passwordError ? (
                <p className="text-[11px] text-red-300">{passwordError}</p>
              ) : null}
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-green-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 hover:bg-green-400"
              >
                Unlock admin tools
              </button>
            </form>
          </section>
        ) : null}

        {!loading && hasPasswordAccess ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-neutral/60">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral/70">
              Admin access
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[13px] text-neutral/70">
                Admin tools are unlocked on this device.
              </p>
              <button
                type="button"
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral/80 hover:bg-white/10"
                onClick={() => {
                  try {
                    localStorage.removeItem(ADMIN_UNLOCK_STORAGE_KEY)
                  } catch {
                    // ignore
                  }
                  setHasPasswordAccess(false)
                }}
              >
                Lock
              </button>
            </div>
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
        ) : hasPasswordAccess ? (
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-green-300 hover:bg-white/10 disabled:opacity-60"
                        onClick={() => void refreshCycleLocation(c.name)}
                        disabled={refreshingCycle === c.name}
                        title="Refresh this cycle location"
                      >
                        {refreshingCycle === c.name ? 'Refreshing…' : 'Refresh'}
                      </button>
                      <span className="text-[11px] uppercase tracking-[0.18em] text-neutral/60">
                        {c.status}
                      </span>
                    </div>
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

