## 1. PROJECT OVERVIEW

Ezyride is a campus-focused electric cycle rental platform targeting SRM RMP students. It is built as a mobile-first Progressive Web App (PWA) and is also wrapped as an Android Trusted Web Activity (TWA) APK for near-native usage.

**Problem it solves**

- Limited and inefficient short-distance transport options inside campus.
- Manual rental processes that are hard to track (cash, paper logs, no analytics).
- No unified way to enforce “one user per cycle at a time” or to understand fleet usage.

**Core goals**

- Provide a **simple QR-based rental** flow for students.
- Enforce **domain-restricted access** (`*.srmrmp.edu.in`) with email verification.
- Offer a **clear, mobile-friendly UI** that feels like a native app.
- Allow admins to monitor **cycle availability, usage history, and payments**.

**Key features (current state)**

- Email+password authentication via Supabase with email verification.
- Domain-restricted registration for `*.srmrmp.edu.in`.
- Mobile-first PWA with home-screen install support (Android/iOS).
- QR code scanning (browser camera) for cycle identification.
- Cycle availability view backed by Supabase `cycles` table.
- Active rental timer and “in use” status propagation to all users.
- **Razorpay payments:** Live payments supported via server-side order creation (Supabase Edge Function) and signature verification (Edge Function). Frontend uses only Key ID (e.g. in Vercel); Secret is stored only in Supabase. Test-mode keys also work with fallback client-side flow.
- Rental history stored per user (`rentals` table); RLS ensures users see only their own rentals.
- Double-booking mitigation: cycle is claimed with `UPDATE ... WHERE status = 'available'` before inserting rental; timer expiry clears `unavailable_until` when marking cycle available.
- Android APK wrapper via Trusted Web Activity (Bubblewrap-generated).

**Proposed production features (documented for patent; not yet implemented):** Wallet system with negative-balance rules and tiered blocking; NFC-based return detection (cycle NFC + stand reader); hardware GPS tracking on cycles; fully autonomous deployment with no user intervention for returns. See Section 13.

> NOTE: OTP-based verification and push notifications are part of the PRD but are **not implemented** yet. Verification currently uses Supabase’s built-in email link flow.

**Current working state (summary of modifications)**

- **Auth & data:** Supabase email/password, domain-restricted registration; RLS migration applied for `cycles`, `rentals`, `admin_users` (and `cycle_locations` if present). Run `supabase/migrations/20250315000000_enable_rls.sql` if not yet applied.
- **Payments:** Live Razorpay via Edge Functions `create-razorpay-order` and `verify-razorpay-payment`. Key ID in frontend/Vercel only; Secret in Supabase secrets only. Deploy with `npx supabase functions deploy create-razorpay-order` and `verify-razorpay-payment`. See `docs/LIVE_PAYMENTS_SETUP.md` and `docs/STEP_BY_STEP_LIVE_PAYMENTS.md`.
- **Rental flow:** Confirmation claims cycle with `UPDATE ... WHERE status = 'available'` before inserting rental (double-booking mitigation). Timer expiry clears `unavailable_until` when marking cycle available.
- **Build:** `vite.config.ts` has `build.chunkSizeWarningLimit: 1000`.
- **Wallet (implemented):** Users top up wallet via Razorpay; wallet balance is credited on verified payment. While riding, ₹40/hour is debited from wallet. Wallet can go down to **₹-40**; attempting to go below **₹-40** blocks the user in `user_blocks` and the app routes them to `/blocked` until they top up.

---

## 2. SYSTEM ARCHITECTURE

> **Proposed production features (documented for patent application; not yet implemented):** Wallet system with negative-balance rules and blocking; NFC-based return detection via parking-stand readers; hardware GPS tracking on cycles; fully autonomous operation with no ongoing user intervention. See Section 13 for full specification.

At a high level, Ezyride is a **SPA (single-page application)** built in React/Vite, talking to **Supabase** for auth, data, and (for live payments) Edge Functions. Payment flow uses Supabase Edge Functions for server-side Razorpay order creation and signature verification when deployed and configured.

### 2.1 Frontend

- **Technology:** React 18 + TypeScript, Vite, Tailwind CSS.
- **Responsibilities:**
  - Render all screens (`/login`, `/register`, `/home`, `/scanner`, `/cycle/:id`, `/payment`, `/confirmation`, `/history`, `/profile`, `/gallery`, `/about`, `/contact`, `/admin`).
  - Manage client-side routing via `react-router-dom`.
  - Manage authentication state via Supabase JS client (`supabase.auth`).
  - Implement rental flow, QR scanning, payment UI, and PWA behavior.
  - For active rentals, maintain a local `activeRental` state (and `localStorage` backup) to drive timer. Cycle location is updated by hardware GPS only (see Section 13); the app does not request or use the user’s device location.

### 2.2 Backend (as used now)

- **Supabase backend**
  - **Auth:** Email+password auth, confirmation emails (magic-link style).
  - **Database:** Hosted Postgres with the following key tables:
    - `cycles` (fleet inventory + availability + live ETA/location).
    - `rentals` (per-user rental history).
    - (future) `payments` (linking Razorpay order/payment IDs).
  - **Realtime:** Supabase Realtime used to keep the Home availability section in sync across users (subscriptions on `cycles`).
  - **RLS:** Row Level Security is enabled via `supabase/migrations/20250315000000_enable_rls.sql`. Users see only their own `rentals` rows; `cycles` are readable and updatable by authenticated users for the rental flow; `admin_users` is readable only for the current user (to check admin status). Run the migration in the Supabase SQL Editor or via `supabase db push` if using Supabase CLI.
  - **Edge Functions (payments):**
    - `create-razorpay-order` – Creates a Razorpay order server-side (amount in paise); requires Supabase secrets `RAZORPAY_KEY_ID` and `RAZORPAY_SECRET`. Returns `order_id` so the frontend cannot tamper with amount.
    - `verify-razorpay-payment` – Verifies Razorpay payment signature using `RAZORPAY_SECRET`; frontend only proceeds to confirmation after verification succeeds.
  - **Wallet (Edge Function):**
    - `wallet-apply-transaction` – Credits/debits wallet atomically and enforces the negative balance limit (₹-40). If a debit would go below ₹-40, user is blocked (`user_blocks`).
  - Other app operations use direct Supabase JS client calls from the frontend.

### 2.3 External services

- **Razorpay (test and live)**
  - **Frontend (Key ID only):** Uses `VITE_RAZORPAY_KEY_ID` from environment (e.g. in `.env` and Vercel). Only the Key ID is ever in the frontend; the Secret must never be in the client or Vercel.
  - **Server (Supabase Edge Functions):** When deployed and secrets set (`RAZORPAY_KEY_ID`, `RAZORPAY_SECRET` in Supabase Project Settings → Edge Functions → Secrets):
    - Frontend calls `create-razorpay-order` with `amount_paise`, `currency`, `cycle_name`, `hours`; receives `order_id`.
    - Frontend opens Razorpay Checkout with that `order_id` (amount fixed by server).
    - On payment success, frontend calls `verify-razorpay-payment` with `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`; only if verification succeeds does the app navigate to Confirmation.
  - **Fallback:** If Edge Functions are not deployed or fail, the app opens Razorpay with a client-side amount (no verification); suitable for testing only.
  - **Optional (not yet implemented):** Razorpay webhook for `payment.captured` to record payments server-side regardless of client.

- **QR Scanning**
  - Uses `@zxing/browser` and `@zxing/library` to access camera and decode QR codes.
  - Expected QR payload format is simple identifiers like `CYCLE_1`, `CYCLE_2`, `CYCLE_3`.
  - After decode, app navigates to `/cycle/:id` with the corresponding cycle.

### 2.4 Deployment / hosting

- **Frontend hosting:** Vercel (Vite static build).
  - Build: `npm run build` → `dist`.
  - SPA routing: `vercel.json` rewrite `/(.*) -> /` so React Router handles routes.
  - Env vars configured in Vercel (Key ID only; never put Razorpay Secret here):
    - `VITE_SUPABASE_URL`
    - `VITE_SUPABASE_ANON_KEY`
    - `VITE_RAZORPAY_KEY_ID` (Razorpay Key ID; Secret is only in Supabase Edge Function secrets)
  - Production URL (current): `https://ezyride-neon.vercel.app` (subject to change).

- **PWA behavior:**
  - `public/manifest.webmanifest` defines icons, name, theme colors, start URL `/`.
  - A minimal service worker is present; for reliability the app is kept simple so clients always get the latest build on load.

- **Android APK (TWA):**
  - Generated via Bubblewrap CLI.
  - App ID: `app.vercel.ezyride_neon.twa`.
  - Uses a keystore at `C:\Users\BlackBox\projects\android.keystore`.
  - Digital Asset Links:
    - `public/.well-known/assetlinks.json` links `ezyride-neon.vercel.app` to the TWA app so Chrome runs it as a trusted full-screen web activity.

---

## 3. TECH STACK

### 3.1 Languages

- **TypeScript** – For type safety, better IDE support and safer refactoring in the React codebase.
- **SQL (PostgreSQL dialect)** – For database schema and queries in Supabase.

### 3.2 Frameworks & libraries

- **React 18** – SPA framework for component-based UI and hooks.
- **Vite** – Fast dev server and build tool optimized for modern ESM and React.
- **Tailwind CSS v4** – Utility-first CSS for consistent design, fast iteration, and easy theme application (brand colors, typography).
- **React Router DOM** – Client-side routing matching the PRD’s screen flows and URLs.
- **Supabase JS (`@supabase/supabase-js`)** – Official client for Supabase auth and Postgres.
- **@zxing/browser / @zxing/library** – QR code scanning from the browser camera.
- **Razorpay JS** – For initializing and opening the Razorpay checkout widget on the payment page.

### 3.3 Database / backend

- **Supabase (Postgres)** – Provides a fully managed Postgres with auth, realtime, and a strong DX, avoiding writing and hosting a custom backend at this stage.

### 3.4 Tooling & hosting

- **Node.js + npm** – For dependency management and builds.
- **Git + GitHub** – Version control and repo hosting.
- **Vercel** – Static hosting and CI for the React app, with environment variables for Supabase and Razorpay.
- **Android Studio + Bubblewrap CLI** – For generating and building the Trusted Web Activity APK.

**Why this stack**

- Minimizes backend infrastructure (Supabase) while giving relational data and auth.
- React/Vite/Tailwind combination enables fast iteration on mobile-first UI.
- TWA allows using the **same codebase** as both web PWA and Android APK.

---

## 4. PROJECT STRUCTURE

> NOTE: This reflects the current intended structure; verify against the repo as it evolves.

- `/src`
  - `main.tsx` – React/Vite entrypoint; renders `<App />`.
  - `App.tsx` – Root component configuring React Router, protected routes, and shared layout.
  - `/pages`
    - `LoginPage.tsx` – Email/password login with Supabase; redirects to `/home` on success.
    - `RegisterPage.tsx` – Domain-restricted registration; calls `supabase.auth.signUp`.
    - `HomePage.tsx` – Main dashboard: hero, availability, active rental card, bottom install button.
    - `ScannerPage.tsx` – QR scanner view using `@zxing/browser` to detect `CYCLE_X` codes.
    - `CycleDetailsPage.tsx` – Duration selector, price calculation (`₹40/hr`), transition to payment.
    - `PaymentPage.tsx` – Order summary; calls Edge Function to create Razorpay order, opens checkout with `order_id`, then verifies payment via Edge Function before navigating to confirmation. Falls back to client-side amount if functions unavailable.
    - `ConfirmationPage.tsx` – Rental confirmation; on “Start riding” claims cycle (`UPDATE cycles WHERE status = 'available'`), then inserts `rentals` row and saves `activeRental` to localStorage.
    - `HistoryPage.tsx` – Per-user rental history from Supabase `rentals`.
    - `ProfilePage.tsx` – Shows current user email, logout; later can show stats.
    - `GalleryPage.tsx` – Static/dynamic image grid of cycles.
    - `AboutPage.tsx` – About/mission text.
    - `ContactPage.tsx` – Contact information and simple contact form UI.
    - `AdminPage.tsx` (planned/partial) – Admin-only view of cycles and locations.
  - `/components` (if present) – Reusable UI elements (buttons, cards, bottom nav, header, etc.).
  - `/hooks` – (Reserved for shared logic; cycle location is provided by hardware GPS, not user device.)
  - `/lib`
    - `supabaseClient.ts` – Initializes Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
  - `/styles` or `index.css` – Tailwind v4 setup and global styles.

- `/public`
  - `index.html` – HTML shell with `theme-color` and manifest link.
  - `manifest.webmanifest` – PWA metadata, icons, colors, start URL.
  - `/icons`
    - `icon-192.png`
    - `icon-512.png`
    - (optional) `icon-512-mono.png`
  - `.well-known/assetlinks.json` – Digital Asset Links config for the Android TWA.

- `/docs`
  - `PROJECT_TECHNICAL_DOCUMENTATION.md` – This single project documentation file (working state, modifications, and specs).
  - `LIVE_PAYMENTS_SETUP.md` – Live Razorpay setup: env, Supabase secrets, deploy Edge Functions, Vercel (Key ID only).
  - `STEP_BY_STEP_LIVE_PAYMENTS.md` – Step-by-step guide: npx Supabase CLI, link project, deploy functions, test payment.

- `/supabase/functions`
  - `create-razorpay-order/index.ts` – Edge Function: creates Razorpay order (amount in paise); needs `RAZORPAY_KEY_ID`, `RAZORPAY_SECRET`.
  - `verify-razorpay-payment/index.ts` – Edge Function: verifies payment signature; needs `RAZORPAY_SECRET`.
  - `wallet-apply-transaction/index.ts` – Edge Function: credit/debit wallet, enforce ₹-40 minimum, block users in `user_blocks`; needs `SUPABASE_SERVICE_ROLE_KEY`.

- `/supabase/migrations`
  - `20250315000000_enable_rls.sql` – RLS policies for `cycles`, `rentals`, `admin_users`, and (if present) `cycle_locations`. Run in Supabase SQL Editor or via Supabase CLI.
  - `20260315000001_wallet_system.sql` – Wallet schema + RLS: `wallets`, `wallet_transactions`, `user_blocks` (read-own policies).

- `vercel.json` – SPA rewrites for client-side routing.
- `vite.config.ts` – Vite config; `build.chunkSizeWarningLimit: 1000` to avoid chunk size warnings.
- `.env` (local, not committed) – Frontend env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RAZORPAY_KEY_ID` only (never Razorpay Secret).

---

## 5. DEVELOPMENT STAGES

This is a high-level chronological outline of how the project has been built so far.

### Stage 1 – Project Initialization

- **Objective:** Set up a modern React+TS+Vite project with Tailwind and basic theming.
- **Implementation:**
  - `npm create vite@latest ezyride -- --template react-ts`.
  - Installed Tailwind v4 (`tailwindcss`, `@tailwindcss/postcss`) and configured PostCSS.
  - Set brand colors (Electric Blue `#1E40AF`, Fresh Green `#10B981`, Orange `#F59E0B`, Neutral Gray `#6B7280`).
- **Files created/modified:**
  - `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`.
  - `src/main.tsx`, `src/index.css`, initial `src/App.tsx`.
- **Decisions:**
  - Use **Tailwind v4** imports (`@tailwindcss/postcss`) instead of older v3 syntax.
  - Build for **mobile-first** layout with dark background.
- **Challenges & solutions:**
  - Hit Tailwind v4 PostCSS plugin errors → switched to `@tailwindcss/postcss` per docs.

### Stage 2 – Routing & Shell

- **Objective:** Introduce multi-page navigation and a consistent app shell.
- **Implementation:**
  - Installed `react-router-dom`.
  - Configured routes (`/login`, `/register`, `/home` initially).
  - Moved Ezyride hero UI into `HomePage` and added `LoginPage`.
- **Files:**
  - `App.tsx` – Router + basic route definitions.
  - `pages/LoginPage.tsx`, `pages/HomePage.tsx`, `pages/RegisterPage.tsx`.
- **Decisions:**
  - Root `/` redirects to `/login` for unauthenticated users.

### Stage 3 – Supabase Authentication

- **Objective:** Replace dummy login with real email+password auth and domain restriction.
- **Implementation:**
  - Created Supabase project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
  - `lib/supabaseClient.ts` using `createClient`.
  - `LoginPage` uses `supabase.auth.signInWithPassword`.
  - `RegisterPage` uses `supabase.auth.signUp` and enforces `.srmrmp.edu.in` domain using `.endsWith('.srmrmp.edu.in')`.
  - Enabled Supabase **email confirmation** (magic links).
- **Files:**
  - `src/lib/supabaseClient.ts`.
  - `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx`.
- **Decisions:**
  - Dropped custom OTP plan in favor of Supabase’s built-in email verification (simpler, avoids SendGrid issues).
  - Removed `/verify-otp` route and UI.

### Stage 4 – Protected Routes & Session Handling

- **Objective:** Ensure only authenticated users can access core app pages.
- **Implementation:**
  - Added `ProtectedRoute` wrapper in `App.tsx` that:
    - Calls `supabase.auth.getSession()`.
    - Renders a “Checking session…” state while loading.
    - Redirects to `/login` if no session is found.
  - Wrapped routes like `/home`, `/scanner`, `/cycle/:id`, `/payment`, `/confirmation`, `/history`, `/profile`, `/gallery`, `/about`, `/contact`.
  - `ProfilePage` now includes `supabase.auth.signOut()` and clears local `activeRental`.
- **Decisions:**
  - Use **Supabase’s own session persistence** (localStorage) instead of custom “remember me”.

### Stage 5 – Rental Flow UI (Scanner → Cycle → Payment → Confirmation)

- **Objective:** Implement the full rental flow UI matching the PRD.
- **Implementation:**
  - Built `ScannerPage` with QR frame + demo buttons.
  - `CycleDetailsPage` for a single cycle with:
    - Duration slider.
    - Dynamic price calculation (`hours * 40`).
  - `PaymentPage` with order summary and placeholder pay button.
  - `ConfirmationPage` with summary and “Start riding · Go to home” button.
  - `HomePage` shows:
    - Hero card with “Rent now” button → `/scanner`.
    - Availability section with static data initially.
    - An “Active rental” card with timer backed by `localStorage`.
- **Challenges & solutions:**
  - QR scanner kept navigating back while on Payment page → ensured scanner is fully **stopped** in `ScannerPage` cleanup when leaving the page.

### Stage 6 – Supabase Cycles & Rentals Integration

- **Objective:** Back availability and history with real database tables.
- **Implementation:**
  - Created `cycles` table in Supabase:
    - `id`, `name`, `status`, `eta_minutes`, `unavailable_until`, `created_at`.
  - `HomePage` loads `cycles` via Supabase and subscribes to changes.
  - Created `rentals` table:
    - `id`, `user_email`, `cycle_name`, `start_time`, `end_time`, `total_amount`, `created_at`.
  - On Confirmation, a `rentals` row is inserted for the current user.
  - `HistoryPage` reads rentals filtered by current user email.
- **Decisions:**
  - Use `user_email` in `rentals` instead of user id for simplicity (can be normalized later).

### Stage 7 – Razorpay Test Integration

- **Objective:** Replace fake payment button with real Razorpay test checkout.
- **Implementation:**
  - Added `VITE_RAZORPAY_KEY_ID` env var.
  - `PaymentPage`:
    - Loads Razorpay checkout script.
    - On click, opens Razorpay with test key, amount, and basic order info.
    - On success, navigates to Confirmation and stores `razorpay_payment_id` in state (optional).
- **Limitations (planned to improve):**
  - No backend order creation or signature verification yet.
  - Amount is still derived client-side; this should be validated server-side later.

### Stage 8 – PWA & Deployment

- **Objective:** Make app installable and deploy to a public URL.
- **Implementation:**
  - Created `manifest.webmanifest` with icons, name, start URL `/`, `display: standalone`.
  - Added `<meta name="theme-color" content="#1E40AF" />` to `index.html`.
  - Deployed via Vercel:
    - Configured env vars.
    - Added `vercel.json` rewrites for SPA behavior.
  - Simplified service worker usage to avoid aggressive caching causing stale builds.

### Stage 9 – QR Scanner (Camera)

- **Objective:** Replace fake scanner with real camera-based QR scanning.
- **Implementation:**
  - Installed `@zxing/browser` and `@zxing/library`.
  - `ScannerPage`:
    - Requests camera permission.
    - Starts continuous decode with bounding frame.
    - Interprets QR values like `CYCLE_1`, `CYCLE_2`, `CYCLE_3`.
    - Navigates to `/cycle/:id` and stops scanner on unmount.

### Stage 10 – Android TWA APK

- **Objective:** Ship an installable APK that opens the PWA full-screen.
- **Implementation:**
  - Installed Bubblewrap CLI.
  - Ran `bubblewrap init` against `https://ezyride-neon.vercel.app/manifest.webmanifest`.
  - Generated app with ID `app.vercel.ezyride_neon.twa`.
  - Fixed Java/Gradle issues:
    - Switched Bubblewrap to use its own 64-bit JDK (`.bubblewrap/jdk`).
    - Reduced memory/disabled problematic defaults for the Gradle daemon.
  - Created keystore `C:\Users\BlackBox\projects\android.keystore`.
  - Added `public/.well-known/assetlinks.json` with SHA-256 fingerprint and package ID.
  - Built `app-release-signed.apk` and `app-release-bundle.aab`.

### Stage 11 – Availability Refresh & Install Buttons

- **Objective:** Make availability feel live and polish install experience.
- **Implementation:**
  - `HomePage` auto-refreshes cycles every 60 seconds and provides a manual refresh button near the “Live” badge.
  - Bottom bar “Home” button replaced with:
    - **Android/desktop (supporting `beforeinstallprompt`):** “Install app” button that triggers custom install prompt once and hides after install.
    - **iOS Safari:** “How to install on iPhone” button that explains Share → Add to Home Screen steps.

### Stage 12 – RLS, Double-Booking Mitigation, Timer Reset

- **Objective:** Secure data access and reduce double-booking; keep DB consistent when rental timer expires.
- **Implementation:**
  - Added `supabase/migrations/20250315000000_enable_rls.sql`: RLS policies for `cycles` (authenticated read/update), `rentals` (user sees/inserts own rows only), `admin_users` (user sees own row only), and `cycle_locations` if present. Apply via Supabase SQL Editor or `supabase db push`.
  - **ConfirmationPage:** On “Start riding”, first updates `cycles` with `WHERE name = ? AND status = 'available'`; if no row updated, shows “cycle was taken” and does not insert rental. Only after successful claim are `rentals` inserted and `activeRental` stored.
  - **HomePage:** When active rental timer reaches zero, cycle is marked available with `status = 'available'`, `eta_minutes = null`, `unavailable_until = null`.
- **Files:** `ConfirmationPage.tsx`, `HomePage.tsx`, `supabase/migrations/20250315000000_enable_rls.sql`, `supabase/README.md`.

### Stage 13 – Live Razorpay (Edge Functions + Verification)

- **Objective:** Support live payments with server-side order creation and signature verification; keep Secret out of frontend.
- **Implementation:**
  - **Edge Functions:** `supabase/functions/create-razorpay-order/index.ts` (creates order via Razorpay API; needs `RAZORPAY_KEY_ID`, `RAZORPAY_SECRET` in Supabase secrets); `supabase/functions/verify-razorpay-payment/index.ts` (verifies HMAC-SHA256 signature; needs `RAZORPAY_SECRET`).
  - **PaymentPage:** Invokes `create-razorpay-order` with `amount_paise`, `currency`, `cycle_name`, `hours`; opens Razorpay with `order_id` when available. On success, invokes `verify-razorpay-payment` with order_id, payment_id, signature; only on `verified: true` navigates to confirmation. Fallback: if no order_id, uses client-side amount (no verification). Added “Preparing…” / paying state.
  - **Secrets:** Razorpay Key ID only in frontend (`.env`, Vercel as `VITE_RAZORPAY_KEY_ID`). Razorpay Secret only in Supabase (Project Settings → Edge Functions → Secrets).
  - **Docs:** `docs/LIVE_PAYMENTS_SETUP.md`, `docs/STEP_BY_STEP_LIVE_PAYMENTS.md` (npx Supabase CLI, link, deploy functions).
- **Deploy:** `npx supabase functions deploy create-razorpay-order`, `npx supabase functions deploy verify-razorpay-payment` from project root.

### Stage 14 – Build and Docs

- **Objective:** Avoid Vite chunk size warning; centralise documentation.
- **Implementation:** `vite.config.ts`: `build.chunkSizeWarningLimit: 1000`. All working state and modifications documented in this single file (`PROJECT_TECHNICAL_DOCUMENTATION.md`).

### Stage 15 – Wallet System (Top up, Hourly Debits, Blocking)

- **Objective:** Add a wallet that is credited by payments and debited while riding; allow negative balance up to ₹-40; block user access if they attempt to exceed the limit.
- **Implementation:**
  - Added wallet tables + RLS migration `supabase/migrations/20260315000001_wallet_system.sql`:
    - `wallets` (balance per user)
    - `wallet_transactions` (audit trail for credits/debits)
    - `user_blocks` (block record when wallet limit exceeded)
  - Added Edge Function `wallet-apply-transaction`:
    - `type: 'credit' | 'debit'`, `amount` (rupees), `reason`
    - debits are rejected and user is blocked if resulting balance would be below ₹-40
    - credits can auto-unblock once the balance is back to ≥ ₹-40
  - Added UI/routes:
    - `/wallet` shows balance and recent transactions; `/wallet/topup` performs Razorpay top up and credits wallet on verified payment.
    - `/blocked` shows blocked message and sends user to wallet top up.
    - `ProtectedRoute` redirects blocked users to `/blocked` (wallet pages are allowed so they can recover).
  - Rental integration:
    - On “Start riding”, app claims the cycle, then debits the first hour (₹40).
    - While ride is active, every full hour elapsed (up to the planned duration) triggers another ₹40 debit.
- **Files:** `src/pages/WalletPage.tsx`, `src/pages/WalletTopupPage.tsx`, `src/pages/BlockedPage.tsx`, `src/App.tsx`, `src/pages/HomePage.tsx`, `src/pages/ConfirmationPage.tsx`, `supabase/functions/wallet-apply-transaction/index.ts`.

---

## 6. FEATURE DOCUMENTATION

This section will be expanded as features stabilize. For now, primary flows are documented briefly.

### 6.1 Authentication

- **Purpose:** Restrict access to campus users and create a persistent user account.
- **User Workflow:**
  - User opens `/login` or `/register`.
  - On `/register`, enters `.srmrmp.edu.in` email + password, agrees to terms.
  - Supabase sends a verification email link; user clicks it.
  - User then logs in via `/login`.
- **Backend Logic:**
  - `supabase.auth.signUp` creates a user and sends email confirmation.
  - `supabase.auth.signInWithPassword` validates credentials.
  - Supabase stores session tokens in localStorage; `supabase.auth.getSession` used in ProtectedRoute.
- **Data Flow:**
  - Frontend → Supabase Auth REST → Supabase DB.
- **Files Responsible:**
  - `lib/supabaseClient.ts`
  - `pages/LoginPage.tsx`
  - `pages/RegisterPage.tsx`
  - `App.tsx` (ProtectedRoute).

### 6.2 Rental Flow (Home → Scanner → Cycle → Payment → Confirmation)

- **Purpose:** Allow a user to rent a single cycle with a clear, timed session and payment.
- **User Workflow:**
  1. From `/home`, tap **Rent now**.
  2. Scanner opens (`/scanner`), user scans QR on the cycle or taps a demo button.
  3. Cycle details page (`/cycle/:id`) shows name, duration slider, price.
  4. User taps **Pay now** → Payment page.
  5. User taps **Pay with Razorpay**. Frontend requests server order (Edge Function); Razorpay checkout opens with that order (or client amount if fallback). User completes payment.
  6. Frontend verifies payment (Edge Function); only then navigates to Confirmation. User taps **Start riding**.
  7. Redirect back to `/home` with active rental card and timer.
- **Backend Logic:**
  - **Payment:** Edge Functions `create-razorpay-order` (amount in paise) and `verify-razorpay-payment` (signature check). Key ID in frontend only; Secret in Supabase only.
  - **On Start riding (ConfirmationPage):**
    - Update `cycles` with `status = 'unavailable'`, `unavailable_until = endTime` only where `status = 'available'` (claim); if no row updated, show “cycle taken” and do not insert rental.
    - If claim succeeded: insert `rentals` row, save `activeRental` to localStorage, navigate to `/home`.
  - **Timer expiry (HomePage):** When active rental time reaches zero, update `cycles` to `status = 'available'`, `eta_minutes = null`, `unavailable_until = null` for that cycle; clear local `activeRental`.
  - Home subscribes to `cycles` changes to reflect occupancy for all users.
- **Data Flow:** Frontend state + Supabase (DB and Edge Functions) + Razorpay Checkout. RLS restricts rentals to current user.
- **Files Responsible:** `pages/HomePage.tsx`, `pages/ScannerPage.tsx`, `pages/CycleDetailsPage.tsx`, `pages/PaymentPage.tsx`, `pages/ConfirmationPage.tsx`, `pages/HistoryPage.tsx`, `supabase/functions/create-razorpay-order/index.ts`, `supabase/functions/verify-razorpay-payment/index.ts`.

### 6.3 PWA & Install

- **Purpose:** Allow users to install the app on their devices and run it full-screen.
- **User Workflow:**
  - On Android/desktop, see an **Install app** button at the bottom of Home (if eligible).
  - On tap, native install prompt opens; after accept, button disappears.
  - On iOS, see a “How to install on iPhone” button with instructions.
- **Backend Logic:** None; all handled in frontend + browser.
- **Files Responsible:**
  - `public/manifest.webmanifest`
  - `public/icons/*`
  - `public/.well-known/assetlinks.json`
  - `index.html`
  - `pages/HomePage.tsx` (install button logic).

### 6.4 Live Payments Setup (Configuration)

- **Purpose:** Document where and how to configure Razorpay for live payments.
- **Frontend:** `.env` and Vercel env: `VITE_RAZORPAY_KEY_ID` = Razorpay **Key ID** only. Never put the Secret in frontend or Vercel.
- **Supabase:** Project Settings → Edge Functions → Secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_SECRET` (both required for create-order; verify needs only Secret).
- **Deploy Edge Functions:** From project root, `npx supabase login`, `npx supabase link --project-ref <ref>`, then `npx supabase functions deploy create-razorpay-order`, `npx supabase functions deploy verify-razorpay-payment`. Do not use `npm install -g supabase`; use `npx supabase` (CLI is project devDependency).
- **References:** `docs/LIVE_PAYMENTS_SETUP.md`, `docs/STEP_BY_STEP_LIVE_PAYMENTS.md`.

---

## 7. DATABASE DESIGN

### 7.1 `cycles` table

**Purpose:** Represent each physical cycle and its current availability/location state.

**Fields (current):**

- `id` (uuid, primary key, default `gen_random_uuid()`)
- `name` (text, not null; e.g. `"Cycle 1"`)
- `status` (text, not null; enum-like constraint: `'available' | 'unavailable' | 'maintenance'`)
- `eta_minutes` (integer, nullable) – legacy field; can be replaced by `unavailable_until` logic.
- `unavailable_until` (timestamptz, nullable) – when the cycle is expected to be free.
- `last_latitude` (double precision, nullable) – last known location from hardware GPS tracker on the cycle (see Section 13); not from user device.
- `last_longitude` (double precision, nullable).
- `last_location_at` (timestamptz, nullable).
- `created_at` (timestamptz, default `now()`).

**Indexes:**

- Primary key on `id`.
- (Recommended future) Index on `name` for quick lookups and uniqueness.
- (Recommended future) Index on `status` + `unavailable_until` for availability queries.

### 7.2 `rentals` table

**Purpose:** Store each rental event per user per cycle.

**Fields:**

- `id` (uuid, primary key, default `gen_random_uuid()`)
- `user_email` (text, not null) – Supabase-authenticated user’s email.
- `cycle_name` (text, not null) – denormalized, for simplicity.
- `start_time` (timestamptz, not null)
- `end_time` (timestamptz, not null)
- `total_amount` (integer, not null) – amount paid in rupees.
- `created_at` (timestamptz, default `now()`)

**Indexes:**

- Primary key on `id`.
- (Recommended) Index on `user_email`, `created_at` for history queries.

**RLS:** Apply `supabase/migrations/20250315000000_enable_rls.sql` in Supabase SQL Editor (or `supabase db push`) so users see only their own rows and policies are active.

### 7.3 Example queries

- **Get all available cycles:**

```sql
select *
from public.cycles
where status = 'available'
  and (unavailable_until is null or unavailable_until < now());
```

- **Get current user’s rental history (ordered by most recent):**

```sql
select *
from public.rentals
where user_email = 'user@example.srmrmp.edu.in'
order by start_time desc;
```

- **Admin: cycles that should be auto-reset because end time passed:**

```sql
update public.cycles
set status = 'available',
    eta_minutes = null,
    unavailable_until = null
where status = 'unavailable'
  and unavailable_until is not null
  and unavailable_until < now();
```

### 7.4 Proposed tables (for patent / production features; not yet implemented)

**`wallets`** (user wallet balances):

- `user_email` (text, PK) – links to authenticated user
- `balance` (numeric, not null, default 0) – can go negative up to policy limit (-₹40)
- `updated_at` (timestamptz, default `now()`)

**`wallet_transactions`** (audit trail):

- `id` (uuid, PK)
- `user_email` (text, not null)
- `amount` (numeric, not null) – positive for credit, negative for debit
- `type` (text) – e.g. `credit`, `debit`, `extension`, `refund`
- `rental_id` (uuid, nullable, FK → `rentals`)
- `created_at` (timestamptz, default `now()`)

**`user_blocks`** (blocking enforcement):

- `id` (uuid, PK)
- `user_email` (text, not null)
- `block_type` (text) – `temporary_3day` | `permanent`
- `blocked_until` (timestamptz, nullable) – null if permanent
- `reason` (text) – e.g. "Wallet balance exceeded -₹40"
- `offence_count` (integer) – number of times user has exceeded limit
- `created_at` (timestamptz, default `now()`)

**`parking_stands`** (for NFC return mapping; optional):

- `id` (uuid, PK)
- `name` (text) – e.g. "Stand A", "Block 2"
- `location_description` (text, nullable)

**`nfc_return_events`** (audit of NFC detections; optional):

- `id` (uuid, PK)
- `cycle_id` (uuid, FK → `cycles`)
- `stand_id` (uuid, FK → `parking_stands`)
- `detected_at` (timestamptz, default `now()`)

---

## 8. API DOCUMENTATION

The app uses:

- **Supabase Auth** via `@supabase/supabase-js`.
- **Supabase Postgres** via `supabase.from(...).select/insert/update`.
- **Supabase Edge Functions** (invoked via `supabase.functions.invoke('function-name', { body })`):
  - **create-razorpay-order**  
    - **Purpose:** Create a Razorpay order server-side so amount cannot be tampered with.  
    - **Body:** `{ amount_paise: number, currency?: string, receipt?: string, cycle_name?: string, hours?: number }`.  
    - **Response:** `{ order_id: string }` or `{ error: string }`.  
    - **Secrets:** `RAZORPAY_KEY_ID`, `RAZORPAY_SECRET`.
  - **verify-razorpay-payment**  
    - **Purpose:** Verify Razorpay payment signature before confirming rental.  
    - **Body:** `{ razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string }`.  
    - **Response:** `{ verified: true }` or `{ verified: false, error?: string }`.  
    - **Secrets:** `RAZORPAY_SECRET`.
- **Razorpay Checkout** via Razorpay’s frontend JS SDK (opened with Key ID and, when available, server-returned `order_id`).

Planned future additions:

- Razorpay **webhook** (e.g. `payment.captured`) to record payments server-side; optional `payments` table linked to `rentals`.
- OTP/email flows if required beyond Supabase’s built-in verification.

---

## 9. WORKING FLOW (END-TO-END)

1. **User opens app**
   - Via browser at `https://ezyride-neon.vercel.app` or via installed PWA / APK.
2. **Auth guard**
   - `ProtectedRoute` checks `supabase.auth.getSession()`.
   - If no session, user is redirected to `/login`.
3. **Registration (first time only)**
   - On `/register`, user enters `.srmrmp.edu.in` email + password.
   - `supabase.auth.signUp` creates user and sends email verification link.
   - User clicks the link, then logs in.
4. **Home screen**
   - On `/home`, app:
     - Loads `cycles` from Supabase.
     - Subscribes to `cycles` realtime updates.
     - Starts availability auto-refresh every minute.
     - Reads any existing `activeRental` (for that device) to show timer.
5. **Start rental**
   - User taps **Rent now** → `/scanner`.
   - Scanner activates camera; user scans QR with text like `CYCLE_1`.
   - App parses it and goes to `/cycle/1` (or similar).
6. **Cycle details & pricing**
   - User chooses rental duration.
   - App calculates total amount (`₹40 * hours`) and shows it.
   - On **Pay now**, navigates to `/payment` with cycle + duration + amount.
7. **Payment**
   - `/payment` calls Edge Function `create-razorpay-order` (when deployed) to get `order_id`, then opens Razorpay Checkout with that order (or with client amount as fallback).
   - User pays (test or live). On success, frontend calls `verify-razorpay-payment` with order_id, payment_id, signature; only if `verified: true` does it navigate to `/confirmation` with payment id, cycle, times.
8. **Confirmation & activation**
   - `/confirmation` shows summary.
   - On **Start riding**, app:
     - Updates `cycles` with `status = 'unavailable'`, `unavailable_until = endTime` only where `status = 'available'` (claim). If no row updated, shows “cycle taken” and does not proceed.
     - If claim succeeded: inserts `rentals` row, saves `activeRental` in localStorage, navigates to `/home`.
9. **Active rental monitoring**
   - `/home` shows:
     - Green “Active rental” card with timer (~minutes left).
     - Availability section where that cycle is “In use by you” for current user, and “In use / back in X min” for others.
   - Cycle location is updated by hardware GPS on the cycle (Section 13); the app does not request or use the user’s location.
10. **Rental end**
    - When timer hits 0:
      - App clears local `activeRental`.
      - App updates Supabase to reset cycle to `status = 'available'`, `eta_minutes = null`, `unavailable_until = null`.
      - Home UI reverts to “No active rental”.
11. **History & profile**
    - `/history` shows rentals for logged-in user.
    - `/profile` shows user email and logout.
12. **Admin (future)**
    - `/admin` page (when complete) will list all cycles and last known locations using `last_latitude/longitude`.

**Proposed hardware-driven flow (Section 13):** With wallet, NFC return detection, and hardware GPS: (a) rentals/extensions paid from wallet; (b) cycle availability updates automatically when NFC reader detects cycle parked in stand—no timer or user action; (c) cycle location updated by onboard GPS tracker; (d) system operates without ongoing user intervention for core rental/return logic.

---

## 10. CHANGELOG (HIGH-LEVEL)

> Dates approximate; focus is on logical change order.

- **[Stage 1–2]** Initial Vite + React + Tailwind setup and routing.
- **[Stage 3]** Supabase auth added (signUp/signIn), `.env` wired.
- **[Stage 4]** Protected routes + logout; profile page shows email.
- **[Stage 5]** Rental flow pages scaffolded; active rental timer added using local state + `localStorage`.
- **[Stage 6]** `cycles` and `rentals` tables created in Supabase; Home and History wired to backend.
- **[Stage 7]** Razorpay test checkout integrated in Payment page.
- **[Stage 8]** PWA manifest, icons, service worker, and Vercel deployment set up.
- **[Stage 9]** QR scanner replaced with `@zxing/browser` implementation.
- **[Stage 10]** Bubblewrap TWA project generated; `app-release-signed.apk` and `.aab` built; Digital Asset Links configured.
- **[Stage 11]** Availability auto-refresh and manual refresh button added; bottom “Home” button replaced with install-related buttons.
- **[RLS & safety]** RLS migration added (`supabase/migrations/20250315000000_enable_rls.sql`) for `cycles`, `rentals`, `admin_users`, and `cycle_locations`. Confirmation flow now claims cycle with `UPDATE ... WHERE status = 'available'` to reduce double-booking; rental is inserted only after successful claim. Timer expiry on Home now clears `unavailable_until` when marking a cycle available.
- **[Live Razorpay]** Edge Functions `create-razorpay-order` and `verify-razorpay-payment` added; PaymentPage uses server order and verification when deployed. Razorpay Key ID only in frontend/Vercel; Secret only in Supabase. Docs: `LIVE_PAYMENTS_SETUP.md`, `STEP_BY_STEP_LIVE_PAYMENTS.md`. Supabase CLI used via `npx supabase` (no global install).
- **[Build]** `vite.config.ts`: `build.chunkSizeWarningLimit: 1000` to avoid chunk size warning.
- **[Documentation]** All working state and modifications documented in this single file; Stages 12–14 added; Section 6.4 (Live payments setup), Section 8 (Edge Function API). Section 13 and proposed DB tables (`wallets`, `wallet_transactions`, `user_blocks`, etc.) remain as patent/production spec.
- **[Planned]** Admin map view for cycle locations (from hardware GPS data); Razorpay webhook for `payment.captured`.

For more granular change history, refer to Git commit log in the `ezyride` repository.

---

## 11. KNOWN LIMITATIONS

- **Payments:**
  - **Live payments are supported:** Server-side order creation and signature verification via Supabase Edge Functions; Key ID only in frontend/Vercel, Secret only in Supabase. If Edge Functions are not deployed or secrets missing, the app falls back to client-side amount (no verification)—suitable for testing only.
  - Razorpay **webhook** (e.g. `payment.captured`) is not yet implemented; adding it would give a server-authoritative record of payments.

- **Concurrency / locking:**
  - The app uses optimistic locking: on “Start riding”, the cycle is updated only when `status = 'available'`; if no row is updated, the user is told the cycle was taken and no rental is recorded. This reduces double-booking. A strict DB-level transaction (e.g. advisory lock or RPC) could be added for stronger guarantees.

- **Auth & privacy:**
  - Email verification uses Supabase magic links only; there is no custom OTP flow.
  - Location data is intended to come from hardware GPS on cycles only; the app does not collect or request the user’s device location.

- **Offline behavior:**
  - Service worker is minimal; the app is not designed for fully offline booking.

- **Admin tools:**
  - A full admin UI is still in progress; Supabase dashboard is the primary admin console.

---

## 12. FUTURE IMPROVEMENTS

- **Patent/production features (see Section 13 for full spec)**
  - Wallet system with negative balance (-₹40 max), extension from wallet, and tiered blocking (3-day then permanent).
  - NFC-based return detection: NFC tag on cycle, reader in stand, auto-update availability on physical return.
  - Hardware GPS tracker on each cycle (replace user-phone location) for security and admin map.
  - Autonomous deployment: no user intervention needed for returns; hardware events drive availability.

- **Payments & backend security**
  - **Done:** Server-side Razorpay order creation and payment signature verification (Edge Functions). Key ID in frontend only; Secret in Supabase only.
  - **Remaining:** Razorpay webhook (`payment.captured`) to record payments server-side; optional `payments` table linked to `rentals`; server-side validation of rental duration/price in create-order if desired.

- **Location tracking & admin**
  - Cycle location from hardware GPS only (no user device location).
  - Build `/admin` page with:
    - Live map view (e.g. embedding Google Maps) for cycles with recent `last_latitude/longitude`.
    - Manual overrides for cycle status (available / maintenance / blocked).

- **Real-time & notifications**
  - Add real-time subscriptions on `rentals` for admin monitoring.
  - Implement Web Push notifications (where supported) for:
    - 10-minute-before-end warnings.
    - Rental extension prompts.

- **Security & RLS**
  - Base RLS is in place (see `supabase/migrations/20250315000000_enable_rls.sql`). Fine-tune as needed (e.g. restrict `cycles` UPDATE to specific roles if desired).
  - Harden inputs, add rate-limiting in backend functions.

- **UX / UI polish**
  - Better error states for scanner/camera and payment failures.
  - More accessible forms and keyboard navigation.
  - Replace placeholder images with real cycle photos.

- **Scalability**
  - Move selected business logic into reusable service modules.
  - Introduce basic monitoring/logging (e.g., Sentry on frontend, logs in Edge Functions).

---

## 13. PROPOSED FEATURES FOR PATENT / PRODUCTION DEPLOYMENT

The following features are specified for patent application and future implementation. They are designed to make the Ezyride system **fully deployable in production with minimal or no ongoing user intervention**—availability, returns, and location are driven by hardware events rather than manual app actions.

### 13.1 Wallet System

**Purpose:** Allow users to pay for rentals using an in-app wallet balance, support rental extensions during an active ride, and enforce credit limits with automatic blocking rules.

**Design specification:**

- Each user has a **wallet balance** (stored in a `wallets` table, keyed by `user_email`).
- Wallet can be **topped up** via Razorpay (or other gateway); credits are stored in the database.
- **Rental payment:** When a user starts a ride, the system deducts the rental amount from the wallet. If the wallet has insufficient funds:
  - The system allows the balance to go **negative (minus)** up to a configurable limit of **₹40**.
  - If the required deduction would push the balance below **-₹40**, the rental is **blocked** and the user cannot start a new ride.
- **Rental extension:** While a ride is active, the user can request an extension. The extension cost is deducted from the wallet. Same rule applies: extension is allowed if the resulting balance stays ≥ **-₹40**; otherwise, extension is denied.
- **Blocking rules (tiered enforcement):**
  - **First and second offence:** If a user’s wallet balance exceeds -₹40 (i.e., goes below -₹40), the user is **blocked from renting for 3 days**. A `user_blocks` (or equivalent) table stores the block start time and reason.
  - **Third offence:** If the same user exceeds the -₹40 limit **three times** (across their account lifetime or a defined window), the user is **permanently blocked** from accessing cycles. A flag such as `is_permanently_blocked` is set on the user/wallet record.
- **Recovery:** After the 3-day block expires, the user may rent again but must clear their negative balance (or bring it above -₹40) before starting a new ride, depending on policy. Permanent blocks require admin intervention to reverse.

**Data model (proposed):**

- `wallets`: `user_email` (PK), `balance` (numeric, can be negative), `updated_at`
- `wallet_transactions`: `id`, `user_email`, `amount`, `type` (credit/debit/extension), `rental_id`, `created_at`
- `user_blocks`: `id`, `user_email`, `block_type` (temporary_3day | permanent), `blocked_until` (null if permanent), `reason`, `offence_count`, `created_at`

**Files responsible (when implemented):** Payment/rental flow pages, new Wallet/Profile sub-pages, Supabase Edge Functions for balance updates and block checks.

---

### 13.2 NFC-Based Return Detection

**Purpose:** Automatically detect when a cycle is returned to a parking stand, so that availability is updated **immediately** based on physical placement—not on a pre-set rental duration or user action in the app.

**Design specification:**

- Each **cycle** is fitted with an **NFC tag** (or equivalent hardware identifier) that uniquely identifies that cycle (e.g., linked to `cycles.id` or `cycles.name`).
- Each **parking stand** (or designated return zone) is equipped with an **NFC reader** (or similar contactless reader) that:
  - Scans/detects the NFC tag when a cycle is placed in the stand.
  - Sends an event to a backend API (e.g., via a local gateway, IoT device, or direct HTTP to Supabase Edge Function) with:
    - Cycle identifier (from the NFC payload)
    - Stand identifier
    - Timestamp
- **Backend logic:** When a valid “cycle returned” event is received:
  - Update the `cycles` table: set `status = 'available'`, clear `unavailable_until`, optionally clear `eta_minutes`.
  - If there is an active rental for that cycle, mark the rental as **completed** and set the actual `end_time` to the current time (ride ended early by physical return).
  - Update the user dashboard and Home availability in real time via Supabase Realtime (or polling).

**Benefits:**

- No dependence on the user to tap “End ride” or wait for a timer.
- Cycle becomes available as soon as it is physically returned, improving fleet turnover.
- Reduces disputes about “I returned it but the app didn’t register it.”

**Data flow:**

1. User parks cycle in stand → NFC reader detects tag.
2. Reader/gateway sends `{ cycle_id, stand_id, timestamp }` to backend.
3. Backend validates, updates `cycles` and `rentals`.
4. All clients see updated availability via realtime subscription.

**Hardware components (proposed):**

- NFC tag per cycle (passive, durable, weather-resistant).
- NFC reader per stand (e.g., Raspberry Pi + NFC module, or commercial IoT reader) with network connectivity.

---

### 13.3 Hardware GPS Tracking (Replacing User-Device Location)

**Purpose:** Track the physical location of each cycle for **security and fleet management**, without relying on the rider’s phone GPS. This ensures accurate location data even if the user closes the app, has poor signal, or attempts to obscure their position.

**Design specification:**

- Each **cycle** is fitted with a **GPS tracker** (hardware module with cellular or LoRa connectivity) that:
  - Periodically reports its latitude, longitude, and timestamp to a backend endpoint.
  - Can be queried or configured for reporting interval (e.g., every 30–60 seconds during active rental, or less frequently when idle).
- **Backend:** Receives GPS updates and stores them in the `cycles` table:
  - `last_latitude`, `last_longitude`, `last_location_at` (overwrite on each update).
  - Optionally, a `cycle_location_history` table for historical trail/audit.
- **Admin dashboard:** Displays the last known position of each cycle on a map (e.g., Google Maps embed or similar). Used for:
  - Security (locate missing or misplaced cycles).
  - Fleet optimization (know where cycles are concentrated).
  - Dispute resolution (verify where a cycle was at a given time).

**Benefits over user-phone location:**

- Independent of user app state or permissions.
- Cannot be spoofed or disabled by the user.
- Continuous tracking even when the app is closed.
- Hardware can be ruggedized and mounted on the cycle frame.

**Integration:**

- GPS tracker vendor API or custom gateway receives positions and forwards to Supabase Edge Function or direct DB write (with authentication).
- `cycles` table already has `last_latitude`, `last_longitude`, `last_location_at` columns for this purpose.

---

### 13.4 Deployment Readiness and Autonomous Operation

**Design goal:** Once the above features (wallet, NFC return, hardware GPS) are implemented, the system is intended to operate **without ongoing user intervention** for core rental and return flows.

**Autonomous behaviors:**

| Aspect | Current (Timer-Based) | Proposed (Hardware-Driven) |
|--------|------------------------|----------------------------|
| **Cycle availability** | Depends on rental timer expiry; user or scheduled job resets. | NFC reader detects physical return → instant `available`. |
| **Location updates** | Optional: user phone GPS. | Hardware GPS tracker → continuous, automatic. |
| **Rental end** | User must wait for timer or rely on backend cron. | NFC detection of return → rental marked completed. |
| **Payment** | One-time Razorpay at start. | Wallet deduction; extension possible from wallet; no card swipe during ride. |

**User intervention required (minimal):**

- **Initial setup:** Admin configures NFC readers, GPS trackers, and stand mappings (one-time).
- **Wallet top-up:** User adds funds when balance is low (via app, same as any wallet).
- **Block appeals:** Admin may review and unblock permanently blocked users (manual).
- **Maintenance:** Cycle status can be set to `maintenance` by admin when a cycle is out of service.

**Conclusion:** With wallet, NFC return detection, and hardware GPS in place, the system can be deployed and will:
- Accept rentals and extensions via wallet balance.
- Detect returns automatically via NFC.
- Track cycle locations via hardware GPS.
- Enforce blocking rules without manual checks.

No user is required to manually “end” a ride or “confirm” a return for the system to correctly reflect availability—the physical act of parking triggers the update.

---

### 13.5 Summary for Patent Application

- **Wallet system:** In-app wallet with negative-balance allowance (up to ₹40), rental extension from wallet, and tiered blocking (3-day block on first two offences, permanent block on third offence when balance exceeds -₹40).
- **NFC return detection:** NFC tag on each cycle, reader in parking stand, automatic availability update and rental completion on physical return.
- **Hardware GPS:** GPS tracker on each cycle reporting to backend; location stored in database for admin security view; no dependence on user device.
- **Autonomous deployment:** System operates with minimal user intervention; returns and availability driven by hardware events; suitable for unattended campus deployment.

This documentation is intended to be updated continuously as the codebase and architecture evolve.

