# Trailhead Cloud — Marketplace Tiers

Trailhead ships as a GitHub Action with optional **Trailhead Cloud** for evaluation storage, analytics, and org management.

## Plans

| Feature                | Free | Pro      | Team      |
| ---------------------- | ---- | -------- | --------- |
| Risk-only gate (local) | Yes  | Yes      | Yes       |
| Cloud evaluation store | —    | 5,000/mo | 50,000/mo |
| Hosted dashboard       | —    | Yes      | Yes       |
| Org repo rollup        | —    | —        | Yes       |
| API key provisioning   | —    | Yes      | Yes       |
| SSO (SAML/OIDC)        | —    | —        | Yes       |
| Seats included         | 1    | 3        | 10        |

## Usage metering

Cloud API responses include quota headers on every authenticated request:

- `X-Trailhead-Plan` — `free`, `pro`, or `team`
- `X-Trailhead-Quota-Limit` — monthly evaluation cap
- `X-Trailhead-Quota-Used` — evaluations ingested this month
- `X-Trailhead-Quota-Remaining` — remaining capacity

`POST /v1/evaluations` returns **403** when the plan excludes cloud store or quota is exhausted.

## Getting started

**Pro / Team** — set a single key in your workflow:

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    trailhead-api-key: ${{ secrets.TRAILHEAD_API_KEY }}
```

Create and rotate keys in the Cloud dashboard under **Settings → API keys**. Create a new key before revoking the old one to avoid workflow downtime.

**Team SSO** — configure OIDC/SAML issuer metadata under **Settings → SSO**. Login flows are enforced at the dashboard; API keys remain valid for CI ingestion.

## Related

- [Evaluation storage](./evaluation-storage.md)
- [Cloud OpenAPI](../cloud/openapi.yaml)
