# Komatik hosted evaluation store (`komatik.ai`)

Fleet satellites POST gate evaluations to **`https://komatik.ai/api/trailhead/store`**
(legacy alias: `/api/deployguard/store` — retire only after all active consumers confirm migration).

Implementation lives in **Komatik** (`platform/web/app/api/deployguard/store/route.ts`), not in Trailhead Cloud.

## Endpoints

| Method | Path                          | Purpose                                                    |
| ------ | ----------------------------- | ---------------------------------------------------------- |
| `POST` | `/api/trailhead/store`        | Persist evaluation (GateEvaluation JSON or snake_case row) |
| `GET`  | `/api/trailhead/evaluations`  | Prior evaluations for loop bookkeeping lookup              |
| `POST` | `/api/trailhead/deploy-event` | Deploy outcome correlation (alias of deployguard path)     |

Auth: `Authorization: Bearer $INTERNAL_API_SECRET` (same secret as `evaluation-store-secret` in consumer workflows).

### POST body shapes

The store accepts **both**:

1. **HTTP path** — full `GateEvaluation` camelCase from `storeViaApi` (`remediation.loop_round` nested)
2. **Supabase fallback** — snake_case from `buildEvaluationStoreRow()` in `src/notify.ts`

Persisted loop columns (v4.3+): `remediation`, `loop_round`, `previous_evaluation_id`, `fixes_resolved`, `fixes_introduced`, `release_ready`, `pr`.

Analytics columns (v4.5+ warehouse audit): `gate_mode`, `submission_checks`, `policy_findings`, `release_ready_reasons`, `trust_profile`, `verdict`, `ci`, `context` — migration `docs/komatik-migrations/20260606120000_trailhead_analytics_columns.sql`.

## Credit metering (Komatik wallet)

Trailhead can record `deploy_check` deliverables against the Komatik prepaid credit ledger via `credit-meter-ingest`. See **[komatik-credit-metering.md](./komatik-credit-metering.md)**.

### GET loop lookup

```
GET /api/trailhead/evaluations?repo_id=KomatikAI/cairn&pr_number=28&limit=10
Authorization: Bearer <INTERNAL_API_SECRET>
```

Response:

```json
{
  "evaluations": [
    {
      "id": "dg-…",
      "remediation": { "loop_round": 0, "…": "…" },
      "loop_round": 0,
      "fixes_resolved": [],
      "fixes_introduced": ["ci.failed"]
    }
  ]
}
```

Trailhead **v4.3.1+** resolves this URL automatically when `evaluation-store-url` ends with `/api/trailhead/store` or `/api/deployguard/store` — fleet repos do **not** need `SUPABASE_URL` in the workflow for round N+1 lookup.

## Schema (Komatik Supabase)

Table: `public.trailhead_evaluations`

Base migration: `Komatik/supabase/migrations/20260524090000_trailhead_evaluations.sql`  
Loop columns: `…/20260527073857_trailhead_loop_bookkeeping.sql`

Reference copy for Trailhead Cloud hosted tier: `cloud/migrations/002_loop_bookkeeping.sql` (different deployment — do not conflate).

## Fleet rollout status (May 2026)

**A6 complete** for active DORA satellites — pinned `@v4.3.3`, store URL on `/api/trailhead/store`:

| Repo                                                       | Status                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| cairn, frontier, kindling, pack, slipstream, sundog, trace | Merged                                                                     |
| drift, floe, traverse, watchtower                          | **Retired** (archived; absorbed into trace) — do not unarchive for rollout |

**Pending:**

- [Komatik migration](../runbooks/KOMATIK-A5-STORE-MIGRATION.md) — `agent_provenance_id` column + store mapper update
- Strict-agent preset on remaining fleet repos — `scripts/batch-strict-preset-prs.mjs` (#229)

## Deployment rules (mandatory)

> **Never apply Komatik Supabase migrations or deploy store API changes via MCP `apply_migration` / direct SQL to production.**
>
> All schema and route changes must land through a **Komatik PR → merge → Vercel deploy**. Remote-only migrations break CI **Migration Drift Check** until the matching file exists in git at the **exact version** Supabase recorded.

If prod was changed out-of-band, reconcile by renaming the local migration file to match the remote version (see Komatik runbook `docs/runbooks/TRAILHEAD-EVALUATION-STORE.md`).

## Related

- [Evaluation storage](./evaluation-storage.md)
- [Roadmap v4.3 Phase A](./roadmap-v4.3-agent-autonomy.md)
- `scripts/batch-v4.3-rollout-prs.mjs` — fleet pin + store URL batch PRs
- `scripts/batch-strict-preset-prs.mjs` — strict-agent `.trailhead.yml` preset (#229)
