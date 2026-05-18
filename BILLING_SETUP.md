# CreateX Billing System — Setup Guide

## Step 1: Run the Supabase SQL Migration

1. Go to https://app.supabase.com/project/ikbdhxobdjlwirydhxym/sql
2. Open the file `supabase-setup.sql` from this folder
3. Paste the entire contents and click **Run**

This creates 7 tables + 5 RPC functions + indexes + RLS policies.

---

## Step 2: Deploy the Supabase Edge Functions

Install Supabase CLI first: https://supabase.com/docs/guides/cli

```bash
# In the C:\Users\swiss\ folder:
npx supabase login
npx supabase link --project-ref ikbdhxobdjlwirydhxym

# Set environment variables (replace with real keys):
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# Deploy all functions:
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy create-checkout
npx supabase functions deploy customer-portal
npx supabase functions deploy stripe-setup --no-verify-jwt
```

---

## Step 3: Configure Stripe Webhook

1. Go to https://dashboard.stripe.com/webhooks
2. Click **Add endpoint**
3. URL: `https://ikbdhxobdjlwirydhxym.supabase.co/functions/v1/stripe-webhook`
4. Select events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `payment_intent.payment_failed`
5. Copy the **Signing secret** → run:
   ```bash
   npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_XXXXX
   ```

---

## Step 4: Create Stripe Products (automated)

Run the setup function once with your service role key:

```bash
curl -X POST \
  https://ikbdhxobdjlwirydhxym.supabase.co/functions/v1/stripe-setup \
  -H "Authorization: Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY"
```

This creates all 10 Stripe products (3 subscriptions + 4 credit packs + 3 auto top-ups)
and saves the price IDs to your database automatically.

Alternatively, paste the Stripe price IDs manually in the Admin Panel → Stripe Products section.

---

## Step 5: Add Publishable Key to pricing.html / billing.html

Find the `STRIPE_PUBLISHABLE_KEY` placeholder in `pricing.html` and `billing.html`:

```js
const STRIPE_PK = 'pk_live_YOUR_PUBLISHABLE_KEY';
```

Get your publishable key from:
https://dashboard.stripe.com/apikeys

---

## Step 6: Set Your Admin Account

In the Supabase SQL editor, run:

```sql
-- Replace with your actual user ID from auth.users
INSERT INTO user_credits (user_id, plan, balance)
VALUES ('YOUR-USER-ID-HERE', 'admin', 9999)
ON CONFLICT (user_id) DO UPDATE SET plan = 'admin';
```

Then open `/admin-billing.html` and enter your Supabase Service Role Key to unlock write access.

---

## Stripe Price IDs (fallback — fill manually if needed)

If the stripe-setup function doesn't work, create products manually in the Stripe dashboard
and paste the price IDs in the admin panel at `/admin-billing.html` → **Stripe Products Registry**.

| Key           | Type          | Price   | Credits |
|---------------|---------------|---------|---------|
| sub_starter   | subscription  | $19/mo  | 150     |
| sub_pro       | subscription  | $39/mo  | 400     |
| sub_business  | subscription  | $79/mo  | 1,000   |
| pack_100      | one-time      | $10     | 100     |
| pack_300      | one-time      | $25     | 300     |
| pack_700      | one-time      | $50     | 700     |
| pack_1500     | one-time      | $99     | 1,500   |
| topup_1500    | one-time      | $99     | 1,500   |
| topup_5000    | one-time      | $299    | 5,000   |
| topup_12000   | one-time      | $599    | 12,000  |

---

## Credit System Architecture

```
User clicks "Generate" in any module
    ↓
credits.js: Credits.check('service') → enough credits?
    ↓ NO → showBlockedUI() → redirect to billing.html
    ↓ YES
credits.js: Credits.deduct('service', estimatedCost)
    → calls Supabase RPC deduct_credits()
    → atomically deducts, logs api_usage_log, logs credit_transaction
    ↓
HelveX AI call runs
    ↓
credits.js: Credits.reconcile(logId, realCost, inputTokens, outputTokens)
    → calls Supabase RPC update_real_api_cost()
    → reconciles estimate vs actual
    → charges extra credits if real cost > estimated
    → logs final profit_multiple
```

## Profit Protection Rules

- Every request is charged at **2.5x estimated API cost** (target markup)
- Minimum markup allowed: **2.0x** (safety floor)
- Service minimums prevent micro-transactions from being unprofitable
- If actual API cost > estimated → extra credits auto-deducted (if available)
- Admin dashboard shows real-time profit multiples per request, per service, per user
- Requests below 2.0x are flagged in red in the admin panel
