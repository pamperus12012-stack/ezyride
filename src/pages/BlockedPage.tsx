import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabaseClient'

type Wallet = { balance: number }

function BlockedPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!mounted) return
      if (!user) {
        navigate('/login', { replace: true })
        return
      }

      const { data } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mounted) return
      setBalance((data as Wallet | null)?.balance ?? null)
      setLoading(false)
    }
    void load()
    return () => {
      mounted = false
    }
  }, [navigate])

  return (
    <AppShell>
      <main className="flex-1 px-6 pb-8 space-y-4 pt-2">
        <header className="pb-2">
          <p className="text-xs text-neutral/70 uppercase tracking-[0.25em]">
            Access blocked
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Wallet limit exceeded
          </h1>
          <p className="mt-1 text-xs text-neutral/60">
            Your wallet went beyond the allowed negative limit (₹-40). Top up to
            regain access.
          </p>
        </header>

        <section className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-xs text-red-100 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em]">
            Status
          </p>
          <p>
            {loading
              ? 'Checking your wallet…'
              : balance == null
                ? 'Wallet not found yet.'
                : `Current balance: ₹${Number(balance).toFixed(0)}`}
          </p>
        </section>

        <button
          className="w-full rounded-2xl bg-white text-slate-950 border border-accent px-4 py-3 text-sm font-semibold shadow-md active:scale-[0.98]"
          onClick={() => navigate('/wallet')}
        >
          Go to wallet · Top up
        </button>

        <button
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 active:scale-[0.98]"
          onClick={async () => {
            await supabase.auth.signOut()
            localStorage.removeItem('ezyride_active_rental')
            navigate('/login', { replace: true })
          }}
        >
          Log out
        </button>
      </main>
    </AppShell>
  )
}

export default BlockedPage

