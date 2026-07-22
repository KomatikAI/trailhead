# Release evidence contracts

Ordinary HTTP health checks remain operational signals. A release evidence contract is
different: it is an explicit, fail-closed proof that the commercial and deployment
conditions for a production promotion are currently true.

The application owns an HTTPS endpoint and keeps provider, database, and payment
credentials behind that server boundary. Trailhead fetches only a bounded JSON
attestation. It does not receive those credentials.

## Configuration

```yaml
schema_version: 2

contexts:
  - name: production
    match:
      base_branch: [main]
    environment: production

release_evidence:
  url: https://lodge.komatik.xyz/api/lodge/release-evidence
  environments: [production]
  mode: block
  max_age_minutes: 60
  expected_subject: lodge-production
  required_checks:
    - deployment.vercel_project
    - deployment.production_domain
    - credits.enforced
    - credits.prices
    - credits.model_rates
    - credits.cogs_ceilings
    - canary.debits
    - canary.refund
    - canary.topup
    - canary.usage
    - runtime.failure_contract
```

The endpoint is dormant outside the configured environments. `mode: warn` supports a
shadow rollout; `mode: block` makes any failed, pending, missing, stale, malformed, or
unreachable evidence prevent release readiness.

## Endpoint response

```json
{
  "schema_version": 1,
  "subject": "lodge-production",
  "generated_at": "2026-07-22T19:45:00.000Z",
  "evidence_url": "https://evidence.example.com/lodge/canary-42",
  "checks": [
    {
      "id": "credits.prices",
      "status": "pass",
      "summary": "chat_turn=1 and activity=3 with no paid tier",
      "evidence_url": "https://evidence.example.com/lodge/policy-42"
    },
    {
      "id": "canary.refund",
      "status": "pending",
      "summary": "No recent provider-failure refund canary"
    }
  ]
}
```

`status` is `pass`, `fail`, or `pending`. Check IDs must be unique. Trailhead evaluates
only configured required IDs, emits one policy finding per non-passing or missing ID,
and includes the check-level evidence link when present (falling back to the document
link). Documents older than `max_age_minutes` fail as stale. Future timestamps more than
one minute ahead also fail.

For safety, Trailhead requires HTTPS, refuses redirects, applies a ten-second timeout,
and rejects responses larger than 1 MB. The endpoint should publish no user identifiers,
tokens, secrets, raw ledger payloads, or other sensitive material; link to access-controlled
operator evidence when details are required.
