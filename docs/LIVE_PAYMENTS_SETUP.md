# Live Razorpay Payments Setup

To accept **live** (real) payments with Ezyride, you need:

1. **Live keys** from [Razorpay Dashboard](https://dashboard.razorpay.com/) (Settings → API Keys). Use **Live mode** keys, not Test.
2. **Frontend:** only the **Key ID** (public).
3. **Backend:** the **Secret** must stay on the server (Supabase Edge Functions). Never put the Secret in `.env` that is used by the frontend or commit it to the repo.

---

## 1. Frontend (.env)

In your **local** `.env` and in **Vercel** (or your host) environment variables, set:

```env
VITE_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
```

Use your **live** Key ID here. The frontend only needs the Key ID to open the Razorpay checkout; the amount is fixed by the server-created order.

- Do **not** put `RAZORPAY_SECRET` in `.env` if that file is used by Vite (it would be exposed in the client bundle).

---

## 2. Supabase Edge Functions and secrets

The app uses two Edge Functions for secure live payments:

- **create-razorpay-order** – creates an order on Razorpay (amount in paise). So the amount cannot be changed by the client.
- **verify-razorpay-payment** – verifies the payment signature after checkout. So we only confirm the rental after Razorpay has confirmed the payment.

Both need your **Razorpay Secret**. The create-order function also needs the Key ID (to call Razorpay’s API).

### Set secrets in Supabase

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Project Settings** → **Edge Functions** (or **Secrets**).
2. Add these secrets (use your **live** values):

| Secret name         | Value              | Used by                    |
|---------------------|--------------------|----------------------------|
| `RAZORPAY_KEY_ID`   | Your live Key ID   | `create-razorpay-order`    |
| `RAZORPAY_SECRET`   | Your live Secret   | Both functions             |

Via Supabase CLI:

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxxx
supabase secrets set RAZORPAY_SECRET=your_live_secret
```

---

## 3. Deploy the Edge Functions

Deploy the two functions so Supabase can run them:

```bash
cd C:\Users\BlackBox\projects\ezyride
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
```

If you haven’t linked the project:

```bash
supabase link --project-ref your-project-ref
```

Then set the secrets (see above) and deploy again.

---

## 4. Flow summary

1. User taps **Pay with Razorpay** → frontend calls **create-razorpay-order** with `amount_paise`, `currency`, `cycle_name`, `hours`.
2. Edge Function creates an order on Razorpay and returns `order_id`.
3. Frontend opens Razorpay checkout with that `order_id` (amount is fixed by the order).
4. User pays in the Razorpay modal.
5. Razorpay returns `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature` to the frontend.
6. Frontend calls **verify-razorpay-payment** with those three values.
7. Edge Function verifies the signature with your Secret. If valid, frontend goes to confirmation and the user can start the ride.

If the Edge Functions are not deployed or secrets are missing, the app falls back to opening Razorpay with a client-side amount (no server order and no verification). That is fine for testing but **not safe for live money**; for live payments you must deploy the functions and set the secrets.

---

## 5. Optional: webhook for extra safety

For production you can add a Razorpay **webhook** that receives `payment.captured`. Your backend (e.g. another Edge Function) verifies the webhook signature and then updates your DB (e.g. mark payment as captured, or create the rental). That way you have a server-authoritative record even if the user closes the app before the verify step. See [Razorpay Webhooks](https://razorpay.com/docs/webhooks/).

---

## Checklist

- [ ] Live Key ID in `.env` as `VITE_RAZORPAY_KEY_ID` (and in Vercel env)
- [ ] Live Secret **only** in Supabase secrets (`RAZORPAY_SECRET`), not in frontend env
- [ ] `RAZORPAY_KEY_ID` in Supabase secrets for create-order
- [ ] Edge Functions deployed: `create-razorpay-order`, `verify-razorpay-payment`
- [ ] Test a small live payment and confirm verification and rental flow
