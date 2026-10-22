# Evaluation storage

Trailhead can persist gate evaluations for trend dashboards, DORA correlation, and deploy outcome tracking.

## Which option should I use?

| If you want…                                                                  | Use                                                       |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| Fastest setup, hosted dashboard, org billing, no infra to run                 | **Trailhead Cloud** (`trailhead-api-key`)                 |
| Full control of data residency, custom schema, existing Supabase/Vercel store | **Bring-your-own-store** (`evaluation-store-url`)         |
| No persistence (gate only, no trends)                                         | Omit both — evaluations stay in the PR comment/check only |

Both paths are **fail-open**: store POST failures never block merges. When persistence fails, the GitHub Check includes: `Evaluation not persisted — dashboard incomplete.`

## Trailhead Cloud (v4.1+)

The simplest path — one API key, no store URL configuration.

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    trailhead-api-key: ${{ secrets.TRAILHEAD_API_KEY }}
```

When `trailhead-api-key` is set:

| Setting       | Value                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Store URL     | `https://trailhead.komatik.xyz/api/cloud/v1/evaluations` (override base with `TRAILHEAD_CLOUD_API_BASE`) |
| Auth          | Bearer token = your API key                                                                              |
| Deploy events | `https://trailhead.komatik.xyz/api/cloud/v1/deploy-events`                                               |
| Idempotency   | `Idempotency-Key: <evaluation.id>` on every POST                                                         |

Repos are **auto-registered** on first evaluation. Open the hosted dashboard at `https://trailhead.komatik.xyz/dashboard`. See [cloud/openapi.yaml](../cloud/openapi.yaml) for the full API.

### Local Cloud API

```bash
cd cloud
export TRAILHEAD_CLOUD_API_KEYS="komatik:Komatik:thk_dev_key"
npm ci && npm run dev
```

Point workflows at `http://localhost:3101` via:

```yaml
env:
  TRAILHEAD_CLOUD_API_BASE: http://localhost:3101
```

## Bring-your-own-store (OSS / self-hosted)

For full control, POST evaluations to your own endpoint:

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    evaluation-store-url: https://myapp.com/api/trailhead/store
    evaluation-store-secret: ${{ secrets.TRAILHEAD_STORE_SECRET }}
```

The Action sends:

- `POST` with full `GateEvaluation` JSON body
- `Authorization: Bearer <evaluation-store-secret>` when secret is configured
- `Idempotency-Key: <evaluation.id>` (recommended for your store to dedupe retries)
- Exponential backoff on 429/502/503/504 and transient network errors
- Retry count configurable via `evaluation-store-retries` action input (default **3**)

Deploy outcomes use a sibling endpoint: replace `/store` with `/deploy-event` on the same base path.

### Komatik fleet store (`komatik.ai`)

The Komatik platform hosts the shared evaluation store for fleet satellites:

- **POST** `https://komatik.ai/api/trailhead/store`
- **GET** `https://komatik.ai/api/trailhead/evaluations?repo_id=&pr_number=` — prior evals for loop bookkeeping (v4.3.1+ action)

Legacy alias `/api/deployguard/store` remains until all active consumers migrate. Full contract: [komatik-hosted-store.md](./komatik-hosted-store.md).

Loop fields (`loop_round`, `fixes_resolved`, `fixes_introduced`, …) require the Komatik store route **and** schema migration — not Trailhead Cloud's `cloud/migrations/002`.

Analytics fields (v4.5.1+ Action, Komatik migration Jun 2026): `gate_mode`, `submission_checks`, `verdict`, `trust_profile`, `ci`, `context`. Empty columns usually mean the consumer Action predates the producer release — see [komatik-hosted-store.md](./komatik-hosted-store.md).

**B4 agents soak:** Measure flip-readiness on `submission_checks` with per-PR dedupe — [agents-submission-soak.md](./agents-submission-soak.md).

### Supabase fallback

If the primary store URL fails (e.g. Vercel bot protection returns HTML), Trailhead falls back to direct Supabase REST when configured:

```yaml
env:
  SUPABASE_URL: https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

This is **fail-open** — storage failures never block merges.

## Comparison

|               | Trailhead Cloud                            | BYOS                                                                 |
| ------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| Setup         | API key only                               | URL + secret (+ optional Supabase fallback)                          |
| Dashboard     | Hosted (v4.1 E12)                          | Roll your own (see `app/public/dashboard.html` for Supabase example) |
| Deploy events | `/v1/deploy-events`                        | `/deploy-event` on your store base                                   |
| Rate limits   | 120 req/min/org with `RateLimit-*` headers | Your infrastructure                                                  |
| Idempotency   | Built-in via `Idempotency-Key`             | Implement in your store                                              |

## Correlating deployment outcomes

Copy [the tracker example](../examples/github-actions/trailhead-deploy-tracker.yml)
and [its standalone script](../scripts/record-deploy-correlation.mjs) into the
consumer's reviewed default branch. The provider must publish a successful
GitHub `deployment_status` event with the full deployed SHA, a production flag
and the expected environment (default `Production`; configurable with
`TRAILHEAD_PRODUCTION_ENVIRONMENT`). A branch push is not deployment evidence.
This example uses the BYOS table and its existing `deploy_outcome`/`deployed_at`
columns, not the Cloud ingest API. Credentials remain consumer-managed.

The primary match is repository plus exact full `commit_sha`, using the latest
evaluation at or before the deployment event. Explicit blocked/false-readiness
rows are never marked successful and never cause fallback to an older row.
Legacy null readiness is accepted only with an allow/warn gate decision.
Conditional updates preserve a later recorded deployment outcome or newly
blocked evaluation. Store errors warn without blocking the deployment.

`TRAILHEAD_DEPLOY_MATCH_WINDOW_HOURS` optionally permits a 0–24 hour fallback
when there is no exact match (0/unset disables it). The window is anchored to the
deployment event, not the time a delayed workflow runs. More than one candidate
is ambiguous and produces no write. Even a unique time-window match is a
heuristic: prefer recording the gate SHA with deployment metadata. Do not use
fallback correlation as proof of release eligibility or a successful canary.

## Notification CI summary

Both legacy webhook payloads and `trailhead.webhook.v1` events include `ci` and
`releaseReady` when those fields exist in the evaluation. `ci` is the evaluation's
summary with checks, required-check failure/pending/missing counts and
`allRequiredPassed`. Slack-compatible text includes passed-check count, blocking
failure/pending counts and release readiness. Risk-only historical evaluations
without CI remain valid; an absent summary is not reported as passing CI.

## Related

- [Trailhead v4 roadmap](./roadmap-v4.md)
- [Migration v3 → v4](./migration-v3-to-v4.md)
- [Branch protection setup](./branch-protection-setup.md)
- [Komatik hosted store](./komatik-hosted-store.md) — fleet `komatik.ai` endpoint
