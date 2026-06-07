# Agents submission-gate soak (B4 dogfood)

KomatikAI/agents runs Trailhead in PR mode with `submission-gate: true` and stores evaluations to the Komatik hosted store. The flip criterion in `.trailhead.yml` is:

> Flip `submission.mode` to `block` after FP rate **< 10%** over **30 PRs**.

This document defines what “FP” means, why pre-v4.5.2 soak data is invalid, and how to measure flip-readiness.

## What the soak measures (submission gate, not risk gate)

The flip criterion is about **Gate 1 submission checks** (`submission_checks` in the warehouse), not risk-factor warn/block rates.

| Surface                                         | Field                           | Use for soak?                                                               |
| ----------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `trailhead_evaluations` (warehouse)             | `submission_checks`             | **Yes** — primary soak metric                                               |
| `trailhead_evaluations`                         | `risk_factors`, `gate_decision` | No — informational only; doc-heavy repos had structural FPs pre-calibration |
| `agent_gate_decision` events (agents collector) | `total_score` as **penalty**    | No — trust metrics only; no `release_ready` field                           |

Do not conflate warehouse `release_ready` with submission cleanliness. `release_ready` in risk-only/advisory mode is often a weak “not blocked” proxy.

## Invalid baseline (pre–Jun 6, 2026)

Evaluations before the v4.5.1/v4.5.2 stack shipped are **not** usable for the soak:

1. **Producer** — pre-v4.5.1 gate did not emit `submission_checks`, `gate_mode`, `verdict`, or PR-scoped security in store rows.
2. **Store** — Komatik migration `20260606140000_trailhead_analytics_columns` was not on prod until Jun 6.
3. **Risk FPs** — docs/suggestion PRs scored like application code (`sensitive_files` on `security` in markdown paths; `test_coverage = 100` on non-testable changes).

**Reset the soak counter** after v4.5.2 + agents `risk.non_source_globs` are live. Only post-baseline evals count.

## Required consumer stack

| Layer            | Requirement                                                                   |
| ---------------- | ----------------------------------------------------------------------------- |
| Trailhead Action | `@v4.5.2` (or newer); `submission-gate: "true"`                               |
| Store            | `evaluation-store-url: https://komatik.ai/api/trailhead/store`                |
| Komatik prod     | Analytics columns migration applied; store mapper deployed                    |
| `.trailhead.yml` | `presets/agent-docs.yml` or equivalent `risk.non_source_globs`                |
| Pins             | Explicit `@v4.5.x` tags — audit with `scripts/check-fleet-trailhead-pins.mjs` |

## Content-type calibration (`risk.non_source_globs`)

Docs-heavy repos (agents, suggestion markdown) need path profiles so risk scoring does not treat documentation like auth code:

```yaml
risk:
  non_source_globs:
    - "*.md"
    - "docs/**"
    - "agents/**/suggestions/**"
    - ".trailhead/**"
```

Core engine behavior (v4.5.2+):

- **`sensitive_files`** — markdown/config excluded from path-substring matching; `.github/workflows/` and `migrations/` still sensitive.
- **`test_coverage`** — skipped when the changeset has no testable source files.

Copy `presets/agent-docs.yml` or merge its `risk` block into an existing config.

## Measuring flip-readiness

### Per-PR dedupe (required)

Re-runs on new commits create multiple eval rows per PR. Always dedupe to **latest eval per `pr_number`** before computing rates.

### Soak query script

```bash
INTERNAL_API_SECRET=... node scripts/query-agents-submission-soak.mjs
```

Optional env:

- `SOAK_REPO` (default `KomatikAI/agents`)
- `SOAK_FP_THRESHOLD` (default `0.10`)
- `SOAK_MIN_PRS` (default `30`)

Flip when output shows `Flip-ready: YES` — meaning ≥30 distinct PRs with `submission_checks` populated and submission FP rate < 10%.

### Manual SQL (latest eval per PR)

```sql
WITH latest AS (
  SELECT DISTINCT ON (pr_number)
    pr_number, gate_decision, submission_checks, created_at
  FROM public.trailhead_evaluations
  WHERE repo_id = 'KomatikAI/agents'
    AND created_at >= '2026-06-06'::timestamptz  -- post-baseline only
  ORDER BY pr_number, created_at DESC
)
SELECT COUNT(*) AS distinct_prs,
       COUNT(*) FILTER (WHERE submission_checks IS NOT NULL) AS with_submission
FROM latest;
```

## Release sequencing (do not invert)

```
1. Release Trailhead (tag + @v4 advance)     → producer emits analytics fields
2. Pin fleet consumers explicitly            → scripts/batch-v4.5.1-rollout-prs.mjs
3. Promote Komatik store migration + mapper  → columns persist
4. Ship risk calibration + agents risk profile
5. Reset soak; accrue on clean data only
6. Flip submission.mode when query says YES
```

Promoting the warehouse schema before the producing Action version ships yields empty analytics columns — not a mapper bug.

## Do NOT flip early

Pre-calibration agents data showed ~20–25% risk warn/block driven by doc-classification false positives (e.g. PR 263 `sensitive_files` on suggestion markdown, PR 256 block from test_coverage + doc paths). That reflects risk-model mismatch, not agent submission quality.

## Related

- [submission-gate.md](./submission-gate.md)
- [agent-trust-metrics.md](./agent-trust-metrics.md) — penalty semantics on **events**, not warehouse
- [komatik-hosted-store.md](./komatik-hosted-store.md)
- `presets/agent-docs.yml`
- `scripts/check-fleet-trailhead-pins.mjs`
