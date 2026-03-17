import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import AppShell from '../components/AppShell'

function ProfilePage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setEmail(user?.email ?? null)
      setLoading(false)
    }
    load()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    localStorage.removeItem('ezyride_active_rental')
    navigate('/login', { replace: true })
  }

  return (
    <AppShell>
      <main className="flex-1 px-6 pb-8 space-y-4 pt-2">
        <header className="pb-2">
          <p className="text-xs text-neutral/70 uppercase tracking-[0.25em]">
            Account
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Your profile
          </h1>
          <p className="mt-1 text-xs text-neutral/60">
            Manage your campus account and sign out of Ezyride.
          </p>
        </header>
        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral/70">
            Basic info
          </p>
          <p className="mt-2 text-xs text-neutral/60">
            {loading
              ? 'Loading account…'
              : email
                ? `Signed in as ${email}`
                : 'No account information available.'}
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-neutral/60 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral/70">
            Admin
          </p>
          <p>Open admin tools (requires the admin password).</p>
          <button
            onClick={() => navigate('/admin')}
            className="mt-2 w-full rounded-2xl bg-white/10 text-white border border-white/15 px-4 py-2 text-xs font-semibold shadow-md active:scale-[0.98]"
          >
            Admin tools
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-neutral/60 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral/70">
            Session
          </p>
          <p>You can safely sign out if you are using a shared device.</p>
          <button
            onClick={handleLogout}
            className="mt-2 w-full rounded-2xl bg-white text-slate-950 border border-accent px-4 py-2 text-xs font-semibold shadow-md active:scale-[0.98]"
          >
            Log out
          </button>
        </section>
      </main>
    </AppShell>
  )
}

export default ProfilePage

