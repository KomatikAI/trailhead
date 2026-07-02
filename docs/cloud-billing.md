# Trailhead Cloud — Billing Architecture & Launch Record

**Status:** LIVE in production as of 2026-07-02 (billing sprint, PRs #311/#312/#314/#315/#317, promoted via #316/#318).
**Site:** https://trailhead.komatik.xyz · **Business brief:** komatik monorepo `docs/strategy/REVENUE_FOCUS_2026-07.md`.

## What's live

- **Free (OSS Action)** — local risk-only gate, no key. The check summary carries a one-line
  Cloud upsell (suppressible via `disable-cloud-upsell: true`), UTM-tagged per state
  (`cloud-upsell` / `quota-upsell` / `suspended-upsell`) to measure upgrade-prompt clickthrough.
- **Pro $39/mo** (5,000 evals/mo) and **Team $399/mo** (50,000 evals/mo + org rollup + SSO) —
  self-serve Stripe checkout on /pricing. Prices are launch hypotheses; revisit ~day 45.

## Architecture (decided 2026-07-02)

- **One Vercel project** (`prj_luHxPat0mEXawGfCxXdpLEsB41Vr`, root directory `site/`): Next.js
  marketing pages + `/api/billing/*` routes + the Cloud Hono app mounted at `/api/cloud/[[...route]]`
  via `hono/vercel`. `cloud/src/server.ts` remains for self-hosters/dev.
  - **Install command** must be `npm --prefix ../cloud install && npm install` — the
    `trailhead-cloud` package's `prepare` build needs its own devDependencies (`tsc`) or the
    Vercel install dies with exit 127.
  - `trailhead-cloud` exports **built `dist/`** (not TS sources): Turbopack cannot resolve
    `.js`-suffixed TS imports through a `file:` dependency.
  - Ignored Build Step: `git diff --quiet HEAD^ HEAD -- . ../cloud`.
- **Postgres**: dedicated Supabase project `trailhead-cloud` (`mehoxxjfntubqwbqybht`, KomatikAI org,
  us-east-1). Code is plain `pg` over `DATABASE_URL` (transaction-mode pooler
  `aws-0-us-east-1.pooler.supabase.com:6543`); migrations use the direct `:5432` URL via
  `cloud/scripts/migrate.ts` (`schema_migrations` ledger; `-- migrate:skip` marks legacy
  Supabase-editor SQL). `001_billing_core.sql` is the canonical billing DDL.
- **Auth model v1**: possession-of-key. API keys are stored **sha256-hashed** (never plaintext);
  the dashboard keeps the key in sessionStorage only. No login system; billing management is the
  Stripe Customer Portal. (CodeQL alerts #21/#22 dismissed with rationale.)
- **Brand**: dark-first GitHub flavor with **Trail Green `#22C55E`** accents per the komatik
  `packages/design-tokens/tokens.json` (Trace owns the blue family — do not use blue accents here).

## Billing flows

1. `POST /api/billing/checkout` {plan, email} → Stripe Checkout (live prices via
   `STRIPE_PRICE_PRO`/`STRIPE_PRICE_TEAM`).
2. `POST /api/billing/webhook` (endpoint `we_1TorGJENMm46CBR4u1hklAAy`; events:
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`):
   - checkout completed → org + settings + subscription + first API key in one transaction, plus an
     AES-256-GCM one-time `key_claims` row (72 h TTL) revealed exactly once at `/welcome`.
   - subscription status → plan/status/period sync; `past_due|unpaid|canceled|incomplete_expired`
     suspends the org's keys (ingest 402s), `active|trialing` unsuspends.
   - **Idempotency**: insert-first ledger (`stripe_webhook_events`) with **rollback on handler
     failure** — without the rollback, Stripe's retry short-circuits as a duplicate and a transient
     failure permanently drops a paid customer's provisioning.
3. `GET /api/billing/reconcile` (Bearer `CRON_SECRET`, daily Vercel cron) — Stripe↔store diff
   repair (`upsertSubscriptionFromStripe` resolves orgs by customer id, recreating a lost-webhook
   org), expired-claim purge. Nothing in billing is fire-and-forget.
4. Quota v1: soft over-quota is still stored (200 + `X-Trailhead-Quota-Exceeded: true`) until
   **3× the tier limit** → hard 429. Suspended → 402. Cloud availability never affects the gate
   decision in the Action.

## Operations

- **Secrets**: Stash project `trailhead` — `TRAILHEAD_DATABASE_URL(_DIRECT)`, `TRAILHEAD_DB_PASSWORD`,
  `TRAILHEAD_CLAIM_SECRET`, `TRAILHEAD_CRON_SECRET`, `TRAILHEAD_STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_TRAILHEAD_PRO/_TEAM`. Env matrix + Vercel/Stripe runbook: `site/README.md`.
- **Deploys**: production tracks **`main`**; promotion flow is `dev → staging → main`
  (see BRANCHING-style promote PRs #316/#318). Feature branches and `dev` get preview URLs.
- Stripe products (live mode, Komatik account): Pro `prod_UoTSrR66JfSZxK` /
  `price_1ToqVBENMm46CBR4nDjMLKfU`; Team `prod_UoTS22apNXd7gT` / `price_1ToqVBENMm46CBR4C4SGckYq`.

## Open items

- First paid checkout end-to-end (webhook → org/key → `/welcome` claim → eval ingest) — validates
  the whole loop with a real card.
- Marketplace listing copy refresh (brief §5.6) and the agent-guard content push (brief §6).
- `staging`/`main` required-approval count blocks solo-maintainer promotions — set approvals to 0
  or add a bypass (BRANCHING-doc pattern) so promotions merge on green CI.
- v2 auth (server-side sessions) replaces possession-of-key for the dashboard; revisit the
  sessionStorage dismissal then.
- Brief-path `delivered_at` semantics: a failed BOM generation still marks the purchase delivered
  (legacy behavior, preserved); now that the reconciler exists, consider letting it retry instead.
