# Step-by-step: Get live Razorpay payments working

Follow these steps in order. You’ve already set **RAZORPAY_KEY_ID** and **RAZORPAY_SECRET** in Supabase (Project Settings → Edge Functions → Secrets). Next is deploying the functions and testing.

---

## Step 1: Install Node.js (if needed)

- If you already run `npm run dev` for Ezyride, you have Node.js. Skip this.
- Otherwise: download and install from https://nodejs.org (LTS).

---

## Step 2: Use Supabase CLI via npx (no global install)

**Do not run** `npm install -g supabase`. Instead, run every Supabase command as **npx supabase ...** from the project folder. For example:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_REF
npx supabase functions deploy create-razorpay-order
npx supabase functions deploy verify-razorpay-payment
```

Wait until it finishes. Check it’s installed:

```powershell
npx supabase --version
```

(Use npx for all steps below.)

---

## Step 3: Log in to Supabase

In the same terminal (from `C:\Users\BlackBox\projects\ezyride`):

```powershell
npx supabase login
```

- A browser window will open.
- Log in with your Supabase account and allow access.
- When it says you’re logged in, you can close the tab and go back to the terminal.

---

## Step 4: Go to your project folder

```powershell
cd C:\Users\BlackBox\projects\ezyride
```

---

## Step 5: Get your Supabase Project Reference ID

1. Open https://supabase.com/dashboard in your browser.
2. Click your **Ezyride project**.
3. Click the **gear icon** (Project Settings) in the left sidebar.
4. Under **General**, find **Reference ID**. It looks like `abcdefghijklmnop` (letters only).
5. Copy that value. You’ll use it in the next step.

---

## Step 6: Link this folder to your Supabase project

In the terminal (still in `C:\Users\BlackBox\projects\ezyride`), run:

```powershell
npx supabase link --project-ref PASTE_YOUR_REFERENCE_ID_HERE
```

Replace `PASTE_YOUR_REFERENCE_ID_HERE` with the Reference ID you copied (e.g. `supabase link --project-ref abcdefghijklmnop`).

- If it asks for your database password, use the one you set when you created the Supabase project (or reset it from the Dashboard under Database → Settings).
- When it says “Linked successfully” (or similar), you’re done with this step.

---

## Step 7: Deploy the first Edge Function

Still in the same folder, run:

```powershell
npx supabase functions deploy create-razorpay-order
```

- Wait until it finishes.
- You should see something like “Deployed function create-razorpay-order” or a success message.

---

## Step 8: Deploy the second Edge Function

Run:

```powershell
npx supabase functions deploy verify-razorpay-payment
```

Wait until it finishes. You should see a similar success message.

---

## Step 9: Check your frontend .env file

1. Open the file:  
   `C:\Users\BlackBox\projects\ezyride\.env`
2. Make sure it has this line (with your **live** Key ID from Razorpay):

   ```env
   VITE_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
   ```

3. Save the file.
4. **Important:** The `.env` file should **not** contain `RAZORPAY_SECRET`. Only the Key ID goes here.

---

## Step 10: If you use Vercel (deployed app)

1. Go to https://vercel.com and open your Ezyride project.
2. Go to **Settings** → **Environment Variables**.
3. Add (or update):
   - **Name:** `VITE_RAZORPAY_KEY_ID`
   - **Value:** your live Key ID (e.g. `rzp_live_xxxxxxxxxxxx`)
4. Save and **redeploy** the project (Deployments → … on latest → Redeploy).

---

## Step 11: Run the app locally and test

1. In the terminal, from `C:\Users\BlackBox\projects\ezyride`:

   ```powershell
   npm run dev
   ```

2. Open the URL it shows (e.g. http://localhost:5173) in your browser.
3. Log in (or register) with your `.srmrmp.edu.in` email.
4. Go to **Home** → **Rent now** → scan or pick a cycle → choose duration → **Pay now**.
5. On the payment page, click **Pay with Razorpay**.
6. Complete the payment with a **small real amount** (e.g. ₹1) to test.
7. After payment, you should see the **confirmation** screen and be able to click **Start riding**.

If you get “Payment verification failed”, the Edge Functions or secrets may not be set correctly—recheck Steps 1–8 and the secrets in Supabase.

---

## Step 12: You’re done

- **Local:** Live payments work when you run `npm run dev` and use the same `.env`.
- **Production:** After redeploying on Vercel (Step 10), live payments work on your live URL too.

---

## Quick checklist

- [ ] Step 1–2: Node.js and Supabase CLI installed  
- [ ] Step 3: `supabase login` done  
- [ ] Step 4: In folder `C:\Users\BlackBox\projects\ezyride`  
- [ ] Step 5: Supabase Reference ID copied  
- [ ] Step 6: `supabase link --project-ref YOUR_REF` done  
- [ ] Step 7: `supabase functions deploy create-razorpay-order` success  
- [ ] Step 8: `supabase functions deploy verify-razorpay-payment` success  
- [ ] Step 9: `.env` has `VITE_RAZORPAY_KEY_ID=rzp_live_...` only (no secret)  
- [ ] Step 10: (If Vercel) Env var set and project redeployed  
- [ ] Step 11: Test payment on dev and (if applicable) on live URL  

If any step fails, note the exact error message and the step number; you can use that to debug or ask for help.
