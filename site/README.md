# Trailhead Cloud — `site/`

The Next.js (App Router, TypeScript) app that deploys to **Vercel** at
**`trailhead.komatik.xyz`**. It serves:

- Stripe **billing** routes (`/api/billing/*`) — checkout, webhook, key claim, portal, reconcile.
- The **Cloud API** (Hono app from `../cloud`) mounted at **`/api/cloud/[[...route]]`** via the `hono/vercel` adapter.
- Marketing, pricing, one-time key delivery, and the embedded Cloud dashboard.

Auth model v1: **possession-of-key = auth**. No login system. The first API key is
issued on payment and revealed once at `/welcome` (the claim flow); billing is
self-managed through the Stripe Customer Portal.

---

## Environment matrix

| Var                      | Required   | Where                                              | Purpose                                                                                                                 |
| ------------------------ | ---------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`      | yes        | Vercel (prod: `sk_live_`, preview/dev: `sk_test_`) | Stripe SDK. `assertStripeMode` refuses a live key outside prod and a test key in prod.                                  |
| `STRIPE_WEBHOOK_SECRET`  | yes        | Vercel                                             | Verifies `POST /api/billing/webhook` signatures.                                                                        |
| `STRIPE_PRICE_PRO`       | yes        | Vercel                                             | Recurring Price id for Pro ($39/mo).                                                                                    |
| `STRIPE_PRICE_TEAM`      | yes        | Vercel                                             | Recurring Price id for Team ($399/mo).                                                                                  |
| `DATABASE_URL`           | yes (prod) | Vercel                                             | Postgres (dedicated Supabase project). Unset → in-memory store locally; production refuses to start billing without it. |
| `TRAILHEAD_CLAIM_SECRET` | yes        | Vercel                                             | AES-256-GCM key that encrypts the one-time key claim. `openssl rand -hex 32`.                                           |
| `CRON_SECRET`            | yes        | Vercel                                             | Bearer secret for the daily reconcile cron. `openssl rand -hex 32`.                                                     |
| `NEXT_PUBLIC_SITE_URL`   | yes        | Vercel                                             | Public origin for Stripe success/cancel + portal return URLs. Prod = `https://trailhead.komatik.xyz`.                   |

See `.env.example`. Local dev: `cp .env.example .env.local` and fill in test-mode values.

---

## Route map

| Method | Path                             | Auth                        | Notes                                                                                                                                                                            |
| ------ | -------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/billing/checkout`          | public (IP rate-limited)    | `{ plan: 'pro'\|'team', email }` → Stripe Checkout Session (mode=subscription).                                                                                                  |
| POST   | `/api/billing/webhook`           | Stripe signature            | Atomic, session-idempotent Checkout fulfillment; ledger records successful effects. Handles completed Checkout, asynchronous payment success, and subscription updates/deletion. |
| GET    | `/api/billing/claim?session_id=` | one-time token (session id) | Atomic one-time API-key reveal. 410 if already claimed/expired.                                                                                                                  |
| POST   | `/api/billing/portal`            | Bearer API key              | Stripe Customer Portal session for the key's org.                                                                                                                                |
| GET    | `/api/billing/reconcile`         | Bearer `CRON_SECRET`        | Daily Vercel cron. Diffs Stripe ↔ `subscriptions`, repairs drift, purges expired claims.                                                                                         |
| ANY    | `/api/cloud/[[...route]]`        | Bearer API key (`/v1/*`)    | The mounted Cloud API. e.g. `POST /api/cloud/v1/evaluations`, `GET /api/cloud/health`.                                                                                           |

---

## Store wiring

The billing routes and the mounted Cloud API share **one** store, selected in
`lib/cloudStore.ts`: `createPgStore(new pg.Pool({ connectionString }))` when
`DATABASE_URL` is set, else `createMemoryStore()` for local development. Production
requires persistent storage. `BillingStore` is an alias for the real `CloudStore`
interface; there is no ambient stub.

`trailhead-cloud` is a `file:../cloud` dependency with built ESM exports. Install
and build `cloud/` before running the site. Checkout creates the org, subscription,
API key and encrypted claim in one transaction. A retry for the same session
cannot create another key or reopen a revealed claim. Unpaid delayed-payment
sessions wait for `checkout.session.async_payment_succeeded`.

The dashboard's **Manage billing** button accepts an existing Cloud key, including
a suspended key so customers can recover payment. SSO configuration is a preview;
it does not implement SSO sign-in. A lost API key requires a working secondary key
or support recovery; the Stripe portal does not issue Cloud keys.

---

## Vercel project setup

1. **Import the repo** into Vercel; set **Root Directory = `site`**.
2. Framework preset: **Next.js** (auto). Build command / output default.
3. **Domain**: add `trailhead.komatik.xyz` to the project.
4. **Environment variables**: add every row from the matrix above for
   Production (and test-mode equivalents for Preview).
5. **Cron**: `vercel.json` already declares the daily reconcile cron
   (`0 7 * * *` → `/api/billing/reconcile`). Vercel picks it up on deploy; the
   route authorizes via `Authorization: Bearer $CRON_SECRET`, so set
   `CRON_SECRET` before the first cron fires.
6. Deploy. Smoke test: `GET https://trailhead.komatik.xyz/api/cloud/health` →
   `{"status":"ok"}`.

---

## Stripe setup (operator runbook)

Do this once per mode (test, then live). **Do not commit any ids or keys** —
they go in Vercel env only.

1. **Products + Prices** (Dashboard → Products, or `stripe` CLI):
   - Product "Trailhead Pro" → recurring **Price $39.00 / month (USD)** → copy the
     `price_…` id into `STRIPE_PRICE_PRO`.
   - Product "Trailhead Team" → recurring **Price $399.00 / month (USD)** → copy into
     `STRIPE_PRICE_TEAM`.
   ```bash
   stripe products create --name "Trailhead Pro"
   stripe prices create --product <prod_id> --unit-amount 3900 --currency usd \
     --recurring interval=month
   stripe products create --name "Trailhead Team"
   stripe prices create --product <prod_id> --unit-amount 39900 --currency usd \
     --recurring interval=month
   ```
2. **Secret key**: copy `sk_test_…` (test) / `sk_live_…` (prod) into
   `STRIPE_SECRET_KEY` on the matching Vercel environment.
3. **Webhook endpoint**: Dashboard → Developers → Webhooks → Add endpoint:
   - URL: `https://trailhead.komatik.xyz/api/billing/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`,
     `customer.subscription.deleted`.
   - Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`.
4. **Customer Portal**: Dashboard → Settings → Billing → Customer portal → enable
   (allow plan switch between the Pro/Team prices, cancellation).
5. **Local webhook testing**: `stripe listen --forward-to localhost:3200/api/billing/webhook`
   and use the printed `whsec_…` as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

---

## Develop / test

```bash
 npm ci
 npm ci --prefix cloud
 npm ci --prefix site
 cd site
npm run dev        # http://localhost:3200
npm run lint
npm run typecheck  # generate Next route types, then tsc --noEmit
npm run test       # vitest (webhook logic, claim one-time semantics, checkout validation, crypto)
npm run build
```

Run the install commands from the repository root. Use Node 24 to match CI.
Root dependencies provide ESLint; Cloud's install runs its build automatically.
For real database contract tests, point `TEST_DATABASE_URL` at a **disposable test
database** and run `npm test --prefix cloud`; the suite resets its test tables.
CI supplies an isolated PostgreSQL service. Local UI development works without
Stripe credentials, but paid Checkout and portal flows require test-mode keys.

Keep Production and Preview Stripe keys, prices and webhook secrets scoped
separately. Before promotion, verify a test Checkout, webhook, one-time claim,
authenticated ingestion, portal cancellation/reactivation and reconcile run.
