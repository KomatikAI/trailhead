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

| Layer            | Requirement                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Trailhead Action | `@v4.5.2` (or newer); `submission-gate: "true"`                                                             |
| Store            | `evaluation-store-url: https://komatik.ai/api/trailhead/store`                                              |
| Komatik prod     | Analytics columns migration applied; store mapper deployed                                                  |
| `.trailhead.yml` | `presets/agent-docs.yml` or equivalent `risk.non_source_globs`                                              |
| Pins             | Reviewed release tag or its full immutable commit SHA — audit with `scripts/check-fleet-trailhead-pins.mjs` |

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
- `SOAK_SINCE` (default `2026-06-06T00:00:00Z`; move forward after calibration changes)
- `SOAK_REVIEW_FILE` — JSON array of human classifications, bound to each exact
  evaluation. Without reviewed evidence the report cannot declare flip-readiness.

The script uses current finding severities, not a nonexistent `passed` flag.
A finding is not automatically a false positive. Each sampled PR needs one
classification (`clean`, `true_positive`, or `false_positive`) from a reviewer:

```json
[
  {
    "repo_id": "KomatikAI/agents",
    "pr_number": 123,
    "commit_sha": "0123456789012345678901234567890123456789",
    "evaluated_at": "2026-10-21T10:00:00Z",
    "reviewed_at": "2026-10-21T11:00:00Z",
    "classification": "false_positive",
    "reviewer": "maintainer-login",
    "evidence_url": "https://github.com/KomatikAI/agents/pull/123"
  }
]
```

The example is a schema illustration, not soak evidence. For a PR containing
multiple findings, classify it as `false_positive` if any non-advisory finding
is false; otherwise `true_positive`. `clean` requires no non-advisory findings
and review that submission checks actually ran. Re-evaluations invalidate prior
classifications, even on the same commit. Invalid or unreviewed rows, stale/future
timestamps and a possibly truncated 200-row response prevent readiness. A complete
bounded sample is required; a truncated store response must be collected and
reviewed separately before using this report for an enforcement decision.

`Flip-ready: YES` requires at least 30 reviewed post-baseline PRs, no unresolved
classifications and a false-positive PR rate strictly below 10%. Exit 1 means
not ready or unavailable evidence. The script never changes enforcement itself.

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
