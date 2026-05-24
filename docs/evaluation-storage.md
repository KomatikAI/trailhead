# Evaluation storage

Trailhead can persist gate evaluations for trend dashboards, DORA correlation, and deploy outcome tracking. Choose **Trailhead Cloud** (managed) or **bring-your-own-store** (self-hosted).

## Trailhead Cloud (v4.1+)

The simplest path — one API key, no store URL configuration.

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    trailhead-api-key: ${{ secrets.TRAILHEAD_API_KEY }}
```

When `trailhead-api-key` is set:

| Setting       | Value                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| Store URL     | `https://api.trailhead.dev/v1/evaluations` (override base with `TRAILHEAD_CLOUD_API_BASE`) |
| Auth          | Bearer token = your API key                                                                |
| Deploy events | `https://api.trailhead.dev/v1/deploy-events`                                               |
| Idempotency   | `Idempotency-Key: <evaluation.id>` on every POST                                           |

Repos are **auto-registered** on first evaluation. See [cloud/openapi.yaml](../cloud/openapi.yaml) for the full API.

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
- Exponential backoff on 429/502/503/504 and transient network errors (up to 3 retries)

Deploy outcomes use a sibling endpoint: replace `/store` with `/deploy-event` on the same base path.

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

## Related

- [Trailhead v4 roadmap](./roadmap-v4.md)
- [Migration v3 → v4](./migration-v3-to-v4.md)
