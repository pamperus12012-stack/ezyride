import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ScannerPage from './pages/ScannerPage'
import CycleDetailsPage from './pages/CycleDetailsPage'
import PaymentPage from './pages/PaymentPage'
import ConfirmationPage from './pages/ConfirmationPage'
import HistoryPage from './pages/HistoryPage'
import ProfilePage from './pages/ProfilePage'
import GalleryPage from './pages/GalleryPage'
import AboutPage from './pages/AboutPage'
import ContactPage from './pages/ContactPage'
import AdminPage from './pages/AdminPage'
import WalletPage from './pages/WalletPage'
import WalletTopupPage from './pages/WalletTopupPage'
import BlockedPage from './pages/BlockedPage'
import { supabase } from './lib/supabaseClient'

function ProtectedRoute({
  children,
  allowBlocked,
}: {
  children: ReactNode
  allowBlocked?: boolean
}) {
  const [checking, setChecking] = useState(true)
  const [isAuthed, setIsAuthed] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!isMounted) return
      setIsAuthed(!!session)

      // If authed, check if user is blocked (wallet limit exceeded)
      if (session?.user) {
        const { data: blockRow } = await supabase
          .from('user_blocks')
          .select('id, blocked_until')
          .eq('user_id', session.user.id)
          .eq('block_type', 'wallet_limit_exceeded')
          .maybeSingle()

        if (!isMounted) return
        const blocked =
          !!blockRow &&
          (blockRow.blocked_until == null ||
            new Date(blockRow.blocked_until).getTime() > Date.now())
        setIsBlocked(blocked)
      } else {
        setIsBlocked(false)
      }

      setChecking(false)
    }

    check()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setIsAuthed(!!session)
      // best-effort refresh block status next tick
      if (session?.user) {
        void (async () => {
          const { data: blockRow } = await supabase
            .from('user_blocks')
            .select('id, blocked_until')
            .eq('user_id', session.user.id)
            .eq('block_type', 'wallet_limit_exceeded')
            .maybeSingle()
          if (!isMounted) return
          const blocked =
            !!blockRow &&
            (blockRow.blocked_until == null ||
              new Date(blockRow.blocked_until).getTime() > Date.now())
          setIsBlocked(blocked)
        })()
      } else {
        setIsBlocked(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white text-sm">
        Checking session…
      </div>
    )
  }

  if (!isAuthed) {
    return <Navigate to="/login" replace />
  }

  if (isBlocked && !allowBlocked) {
    return <Navigate to="/blocked" replace />
  }

  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/wallet"
          element={
            <ProtectedRoute allowBlocked>
              <WalletPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/wallet/topup"
          element={
            <ProtectedRoute allowBlocked>
              <WalletTopupPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/blocked"
          element={
            <ProtectedRoute allowBlocked>
              <BlockedPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scanner"
          element={
            <ProtectedRoute>
              <ScannerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cycle/:id"
          element={
            <ProtectedRoute>
              <CycleDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment"
          element={
            <ProtectedRoute>
              <PaymentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/confirmation"
          element={
            <ProtectedRoute>
              <ConfirmationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/gallery"
          element={
            <ProtectedRoute>
              <GalleryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute>
              <AboutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contact"
          element={
            <ProtectedRoute>
              <ContactPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App



