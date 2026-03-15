import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

type AppShellProps = {
  children: ReactNode
}

function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!mounted || !user) return

      const { data } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mounted) return
      setIsAdmin(!!data)
    }

    void checkAdmin()

    return () => {
      mounted = false
    }
  }, [])

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
        <button
          className="h-10 w-10 rounded-full border border-white/10 flex flex-col items-center justify-center gap-[3px] bg-white/5"
          onClick={() => setMenuOpen(true)}
        >
          <span className="h-[2px] w-4 rounded-full bg-white" />
          <span className="h-[2px] w-3 rounded-full bg-white" />
          <span className="h-[2px] w-5 rounded-full bg-white" />
        </button>
      </header>

      <div className="flex-1 flex flex-col">{children}</div>

      {menuOpen && (
        <>
          <button
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 max-w-[80%] bg-slate-900 shadow-2xl px-5 py-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral/60">
                  Menu
                </p>
                <p className="text-sm font-semibold">Ezyride</p>
              </div>
              <button
                className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center text-sm"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-1 text-sm">
              <button
                className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/home')
                }}
              >
                Home
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/history')
                }}
              >
                History
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/wallet')
                }}
              >
                Wallet
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/profile')
                }}
              >
                Profile
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/gallery')
                }}
              >
                Gallery
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/about')
                }}
              >
                About
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/contact')
                }}
              >
                Contact us
              </button>
              <button
                className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                onClick={async () => {
                  setMenuOpen(false)
                  const shareUrl = window.location.origin
                  if ((navigator as any).share) {
                    try {
                      await (navigator as any).share({
                        title: 'Ezyride',
                        text: 'Rent electric cycles on SRM RMP campus with Ezyride.',
                        url: shareUrl,
                      })
                    } catch {
                      // user cancelled share
                    }
                  } else if (navigator.clipboard) {
                    try {
                      await navigator.clipboard.writeText(shareUrl)
                      alert('App link copied to clipboard.')
                    } catch {
                      alert('Share this link: ' + shareUrl)
                    }
                  } else {
                    alert('Share this link: ' + shareUrl)
                  }
                }}
              >
                Share app
              </button>
              {isAdmin && (
                <button
                  className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/admin')
                  }}
                >
                  Admin
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default AppShell

