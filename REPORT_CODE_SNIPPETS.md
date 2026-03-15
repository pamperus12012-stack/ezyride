# EzyRide – Important Code Snippets for Project Report

This document lists key code snippets from the EzyRide app that you can reference in your project report. Each section includes the file path, a short description, and the relevant code.

---

## 1. Tech Stack & Backend Setup

**File:** `src/lib/supabaseClient.ts`  
**Purpose:** Supabase client initialization for auth and database (cycles, rentals, cycle_locations, admin_users).

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Dependencies (from `package.json`):** React 19, React Router 7, Supabase JS, @zxing/browser (QR), Vite, TypeScript, Tailwind CSS.

---

## 2. Protected Routes & Session Check

**File:** `src/App.tsx`  
**Purpose:** Protects authenticated routes; redirects to login if no session and listens to auth state changes.

```tsx
function ProtectedRoute({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [isAuthed, setIsAuthed] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!isMounted) return
      setIsAuthed(!!session)
      setChecking(false)
    }

    check()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setIsAuthed(!!session)
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

  return children
}
```

---

## 3. QR Code Scanner for Cycle Selection

**File:** `src/pages/ScannerPage.tsx`  
**Purpose:** Uses device camera and ZXing to scan QR codes; expects format `CYCLE_<id>` and navigates to cycle details.

```tsx
const codeReader = new BrowserMultiFormatReader()
// ...
controls = await codeReader.decodeFromVideoDevice(
  undefined,
  videoRef.current ?? undefined,
  (result, error) => {
    if (result) {
      const text = result.getText()
      // Expect values like CYCLE_1, CYCLE_2, CYCLE_3
      if (text.startsWith('CYCLE_')) {
        const id = text.split('_')[1]
        navigate(`/cycle/${id}`, {
          replace: true,
          state: { cycleName: `Cycle ${id}` },
        })
      }
    }
  },
)
```

---

## 4. Real-Time Cycle Availability (Supabase Realtime + Polling)

**File:** `src/pages/HomePage.tsx`  
**Purpose:** Fetches cycles from Supabase, subscribes to Postgres changes for live updates, and refreshes every 60 seconds.

```tsx
async function loadCycles() {
  setError(null)
  const { data, error: fetchError } = await supabase
    .from('cycles')
    .select('id, name, status, eta_minutes, unavailable_until')
    .order('name', { ascending: true })

  if (fetchError) {
    setError('Unable to load live availability right now.')
  } else if (data) {
    setCycles(data as Cycle[])
  }
}

// In useEffect:
const channel = supabase
  .channel('public:cycles')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'cycles' },
    () => void loadCycles(),
  )
  .subscribe()

const intervalId = window.setInterval(() => void loadCycles(), 60 * 1000)
```

---

## 5. Active Rental Timer & Auto-Release

**File:** `src/pages/HomePage.tsx`  
**Purpose:** Reads active rental from localStorage, counts down remaining time, and when time expires marks the cycle available again in Supabase and clears local state.

```tsx
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

// markCycleAvailable() updates cycles table: status = 'available', eta_minutes = null
```

---

## 6. Live Location Tracking During Rental

**File:** `src/hooks/useActiveRentalLocation.ts`  
**Purpose:** When user has an active rental, uses Geolocation API to watch position and upserts `cycle_locations` in Supabase (throttled to once per 15 seconds).

```typescript
const id = navigator.geolocation.watchPosition(
  async (pos) => {
    const now = Date.now()
    if (now - lastSentAtRef.current < 15_000) return
    lastSentAtRef.current = now

    const { latitude, longitude } = pos.coords

    const { error } = await supabase
      .from('cycle_locations')
      .upsert({
        cycle_name: activeRental.cycleName,
        last_latitude: latitude,
        last_longitude: longitude,
        last_location_at: new Date().toISOString(),
      })
    // ...
  },
  (err) => { /* ... */ },
  { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 }
)
```

---

## 7. Payment Integration (Razorpay)

**File:** `src/pages/PaymentPage.tsx`  
**Purpose:** Re-checks cycle availability, then opens Razorpay checkout (or falls back to demo flow). Amount in paise, handler navigates to confirmation with payment ID.

```tsx
// Server-side availability check before payment
const { data: cycleRow } = await supabase
  .from('cycles')
  .select('status, eta_minutes, unavailable_until')
  .eq('name', cycleName)
  .maybeSingle()

// Razorpay options
const options = {
  key: keyId,
  amount: (amount as number) * 100, // Razorpay expects paise
  currency: 'INR',
  name: 'Ezyride',
  description: `${cycleName} – ${(hours as number).toString()} hour(s)`,
  handler: (response: any) => {
    navigate('/confirmation', {
      replace: true,
      state: {
        cycleId, cycleName, hours, amount,
        startTime: now.toISOString(),
        endTime: end.toISOString(),
        razorpayPaymentId: response.razorpay_payment_id,
      },
    })
  },
  prefill: { email: user?.email ?? '' },
  notes: { cycleId },
  theme: { color: '#1E40AF' },
}
const rzp = new window.Razorpay(options)
rzp.open()
```

---

## 8. Post-Payment: Persist Rental & Mark Cycle Unavailable

**File:** `src/pages/ConfirmationPage.tsx`  
**Purpose:** On “Start riding”: insert into `rentals`, update `cycles` (status + unavailable_until), store active rental in localStorage for home screen timer.

```tsx
async function handleStartRiding() {
  // Save rental in Supabase history
  await supabase.from('rentals').insert({
    user_email: user.email,
    cycle_name: cycleName,
    start_time: startTime,
    end_time: endTime,
    total_amount: amount,
  })

  // Mark cycle unavailable until end time
  await supabase
    .from('cycles')
    .update({
      status: 'unavailable',
      unavailable_until: endTime,
    })
    .eq('name', cycleName)

  // Local state for timer on home
  localStorage.setItem('ezyride_active_rental', JSON.stringify({
    cycleId, cycleName, hours, amount, startTime, endTime,
  }))

  navigate('/home')
}
```

---

## 9. Admin Check & Live Cycle Locations

**File:** `src/pages/AdminPage.tsx`  
**Purpose:** Verifies admin via `admin_users` table; fetches cycles and `cycle_locations`; shows status, unavailable_until, and “Open in Google Maps” link.

```tsx
// Admin authorization check
const { data: adminRow, error: adminError } = await supabase
  .from('admin_users')
  .select('user_id')
  .eq('user_id', user.id)
  .maybeSingle()

if (adminError || !adminRow) {
  setIsAdmin(false)
  return
}

// Load cycles and locations in parallel
const [{ data: cyclesData }, { data: locData }] = await Promise.all([
  supabase.from('cycles').select('id, name, status, unavailable_until').order('name', { ascending: true }),
  supabase.from('cycle_locations').select('cycle_name, last_latitude, last_longitude, last_location_at').order('cycle_name', { ascending: true }),
])

// Google Maps link for each cycle with location
const mapsUrl = `https://www.google.com/maps?q=${loc.last_latitude},${loc.last_longitude}`
```

---

## 10. PWA: Service Worker & Install Prompt

**File:** `src/main.tsx`  
**Purpose:** Registers service worker for PWA installability.

```tsx
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
```

**File:** `src/pages/HomePage.tsx`  
**Purpose:** Captures `beforeinstallprompt` for Android and shows “Install app”; on iOS shows “Add to Home Screen” instructions.

```tsx
useEffect(() => {
  function handleBeforeInstallPrompt(e: Event) {
    e.preventDefault()
    setDeferredPrompt(e as BeforeInstallPromptEvent)
  }
  function handleAppInstalled() {
    setInstalled(true)
    setDeferredPrompt(null)
  }
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
  // cleanup...
}, [])

// Android: show install button when deferredPrompt exists
// iOS: show hint to use Safari → Share → Add to Home Screen
```

---

## 11. Cycle Availability Logic (Effective Status & ETA)

**File:** `src/pages/HomePage.tsx`  
**Purpose:** Treats a cycle as available again when `unavailable_until` has passed; computes “Back in X min” from `unavailable_until` or `eta_minutes`.

```tsx
function effectiveCycleStatus(cycle: Cycle): Cycle['status'] {
  if (cycle.status !== 'unavailable') return cycle.status
  if (!cycle.unavailable_until) return cycle.status
  const untilMs = new Date(cycle.unavailable_until).getTime()
  return untilMs <= nowMs ? 'available' : 'unavailable'
}

function effectiveEtaMinutes(cycle: Cycle): number | null {
  if (effectiveCycleStatus(cycle) !== 'unavailable') return null
  if (cycle.unavailable_until) {
    const diff = untilMs - nowMs
    if (diff <= 0) return 0
    return Math.ceil(diff / (60 * 1000))
  }
  return cycle.eta_minutes ?? null
}
```

---

## 12. Login with Supabase Auth

**File:** `src/pages/LoginPage.tsx`  
**Purpose:** Email/password sign-in and handling of “email not confirmed” error.

```tsx
const { error: signInError } = await supabase.auth.signInWithPassword({
  email,
  password,
})

if (signInError) {
  if (signInError.message.toLowerCase().includes('email not confirmed')) {
    setError('Please confirm your email first. Check your inbox for the verification link from Ezyride / Supabase.')
  } else {
    setError(signInError.message)
  }
  return
}
navigate('/home')
```

---

## Summary Table for Report

| Feature              | File(s)                    | Key tech / API                          |
|----------------------|----------------------------|-----------------------------------------|
| Backend & Auth       | `supabaseClient.ts`, Login | Supabase Client, signInWithPassword     |
| Route protection     | `App.tsx`                  | getSession, onAuthStateChange           |
| QR scan              | `ScannerPage.tsx`          | @zxing BrowserMultiFormatReader         |
| Live availability    | `HomePage.tsx`             | Supabase Realtime, postgres_changes     |
| Rental timer         | `HomePage.tsx`             | localStorage, setInterval, cycles update|
| Live location        | `useActiveRentalLocation.ts`| Geolocation watchPosition, cycle_locations upsert |
| Payment              | `PaymentPage.tsx`          | Razorpay (INR, paise)                   |
| Post-payment flow    | `ConfirmationPage.tsx`     | rentals insert, cycles update, localStorage |
| Admin & maps         | `AdminPage.tsx`            | admin_users, cycle_locations, Google Maps URL |
| PWA                  | `main.tsx`, `HomePage.tsx` | Service worker, beforeinstallprompt     |

Use these snippets in your report to illustrate **authentication**, **real-time data**, **QR scanning**, **payment integration**, **location tracking**, **admin dashboard**, and **PWA** behaviour. Adjust line references if your files change.
