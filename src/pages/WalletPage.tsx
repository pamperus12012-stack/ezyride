import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabaseClient'

type Wallet = {
  balance: number
  updated_at: string
}

type Tx = {
  id: string
  amount: number
  type: 'credit' | 'debit'
  reason: string | null
  created_at: string
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString()
}

function WalletPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [txs, setTxs] = useState<Tx[]>([])
  const [error, setError] = useState<string | null>(null)

  const balance = useMemo(() => Number(wallet?.balance ?? 0), [wallet])

  useEffect(() => {
    let mounted = true
    async function load() {
      setError(null)
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!mounted) return
      if (!user) {
        navigate('/login', { replace: true })
        return
      }

      const [{ data: w, error: wErr }, { data: t, error: tErr }] =
        await Promise.all([
          supabase
            .from('wallets')
            .select('balance, updated_at')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('wallet_transactions')
            .select('id, amount, type, reason, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
        ])

      if (!mounted) return

      if (wErr) setError('Unable to load wallet right now.')
      setWallet((w as Wallet | null) ?? null)

      if (tErr) setError((prev) => prev ?? 'Unable to load transactions right now.')
      setTxs((t as Tx[] | null) ?? [])

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
            Wallet
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Your balance
          </h1>
          <p className="mt-1 text-xs text-neutral/60">
            Top up and ride. ₹40 is deducted per hour while you ride.
          </p>
        </header>

        {error ? (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            {error}
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral/70">
            Balance
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            ₹{loading ? '—' : Number.isFinite(balance) ? balance.toFixed(0) : '—'}
          </p>
          <p className="mt-1 text-[11px] text-neutral/60">
            {wallet?.updated_at ? `Updated: ${formatDateTime(wallet.updated_at)}` : ''}
          </p>
          <button
            className="mt-3 w-full rounded-2xl bg-white text-slate-950 border border-accent px-4 py-2 text-xs font-semibold shadow-md active:scale-[0.98]"
            onClick={() => navigate('/wallet/topup')}
          >
            Top up wallet
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral/70">
            Recent transactions
          </p>
          {loading ? (
            <p className="mt-2 text-neutral/60">Loading…</p>
          ) : txs.length === 0 ? (
            <p className="mt-2 text-neutral/60">No transactions yet.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {txs.map((tx) => (
                <div
                  key={tx.id}
                  className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">
                      {tx.type === 'credit' ? 'Top up' : 'Ride charge'}
                    </span>
                    <span className={tx.amount >= 0 ? 'text-emerald-300' : 'text-amber-200'}>
                      {tx.amount >= 0 ? '+' : ''}
                      ₹{Number(tx.amount).toFixed(0)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-neutral/60">
                    {formatDateTime(tx.created_at)}
                    {tx.reason ? ` · ${tx.reason}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  )
}

export default WalletPage

