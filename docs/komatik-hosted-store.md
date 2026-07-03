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

Analytics columns (v4.5.1+ producer, Komatik migration applied Jun 2026): `gate_mode`, `submission_checks`, `policy_findings`, `release_ready_reasons`, `trust_profile`, `verdict`, `ci`, `context`.

- Reference SQL: `docs/komatik-migrations/20260606120000_trailhead_analytics_columns.sql`
- Applied in Komatik: `supabase/migrations/20260606140000_trailhead_analytics_columns.sql` ([#2248](https://github.com/KomatikAI/komatik/pull/2248))

Columns stay null if the producing Action is older than v4.5.1 — release Trailhead **before** interpreting empty analytics as a store bug.

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
Size-factor analytics reference: `docs/komatik-migrations/20260703120000_trailhead_size_factor_analytics.sql`

Reference copy for Trailhead Cloud hosted tier: `cloud/migrations/002_loop_bookkeeping.sql` (different deployment — do not conflate).

## Fleet rollout status (Jun 2026)

**Active fleet** — explicit pin **`@v4.5.2`**, store URL `/api/trailhead/store`:

| Repo                                                                        | Pin audit                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| komatik, agents, cairn, frontier, kindling, pack, slipstream, sundog, trace | `@v4.5.2` (0 drift via `scripts/check-fleet-trailhead-pins.mjs`) |
| drift, floe, traverse, watchtower                                           | **Retired** (archived; absorbed into trace)                      |

**Pin policy:** Use explicit version tags (`@v4.5.2`), not assumed `@v4` freshness. Rollout: `TRAILHEAD_ROLLOUT_VERSION=4.5.x node scripts/batch-v4.5.1-rollout-prs.mjs --apply`.

**Agents B4 soak:** Measure submission FP on `submission_checks` only — see [agents-submission-soak.md](./agents-submission-soak.md). Pre–Jun 6 evals are invalid baseline.

## Deployment rules (mandatory)

> **Never apply Komatik Supabase migrations or deploy store API changes via MCP `apply_migration` / direct SQL to production.**
>
> All schema and route changes must land through a **Komatik PR → merge → Vercel deploy**. Remote-only migrations break CI **Migration Drift Check** until the matching file exists in git at the **exact version** Supabase recorded.

If prod was changed out-of-band, reconcile by renaming the local migration file to match the remote version (see Komatik runbook `docs/runbooks/TRAILHEAD-EVALUATION-STORE.md`).

## Related

- [Evaluation storage](./evaluation-storage.md)
- [Roadmap v4.3 Phase A](./roadmap-v4.3-agent-autonomy.md)
- `scripts/batch-v4.5.1-rollout-prs.mjs` — fleet version pin batch PRs
- `scripts/check-fleet-trailhead-pins.mjs` — pin drift audit
- `scripts/query-agents-submission-soak.mjs` — B4 submission FP measurement
- [agents-submission-soak.md](./agents-submission-soak.md) — flip criterion + sequencing
