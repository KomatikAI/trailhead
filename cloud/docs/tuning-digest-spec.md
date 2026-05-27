# Trailhead Cloud — Tuning Digest Spec

> Status: **Draft for review** — May 2026
> Owner: Trailhead Cloud
> Tracks: KomatikAI/trailhead#228 (Epic A5)

## Purpose

The strict-agent gate ships to 21 repos on v4.3.0 day one. David is not going to eyeball every block. The tuning digest is **the feedback loop** that makes "tune from data" actually work:

1. Surfaces noisy detectors before they wedge an agent fleet.
2. Drives automated `block` → `warn` downgrades when a detector's fleet-wide false-positive rate crosses a threshold.
3. Gives each repo owner a daily picture of "what is my agent fleet getting stuck on."

## Inputs

All data sourced from existing tables — no new tables required for v1.

### `trailhead_evaluations`

| Column                                      | Source   | Notes                                                          |
| ------------------------------------------- | -------- | -------------------------------------------------------------- |
| `repo_id`                                   | existing | group key                                                      |
| `pr_number`                                 | existing | join key                                                       |
| `gate_decision`                             | existing | `allow` / `warn` / `block`                                     |
| `risk_factors` (JSONB)                      | existing | iterate to count per-detector triggers                         |
| `policy_findings` (text[])                  | existing | parse detector codes for ci_integrity, workflow_security, etc. |
| `remediation` (JSONB, **new in A1**)        | new      | `fixes[].code` is the canonical detector identifier            |
| `policyOverride` (JSONB)                    | existing | non-null = override applied                                    |
| `agent_provenance_id` (text, **new in A5**) | new      | denormalised from `pr.provenance.source`                       |
| `created_at`                                | existing | windowing                                                      |

### Feedback signals → `false_positive_rate` denominator

Two sources, both write a row to `trailhead_feedback_events` (existing table):

1. **👎 reaction on the Trailhead PR comment**
   - GitHub webhook `reaction.created` on issue_comment authored by Trailhead app
   - Writes one event per (evaluation_id, github_user_id, detector_code)
2. **`trailhead-false-positive` label on the PR**
   - GitHub webhook `pull_request.labeled`
   - Requires a follow-up comment matching `/^trailhead-fp:\s*(\w[\w._-]+):\s*(.+)$/` — captures the offending detector code and reason
   - Without a matching reason comment within 10 minutes, the label is auto-removed and the requester is asked to retry

Each feedback event is anchored to **a specific detector code**. A 👎 on a comment that surfaces 3 detector findings is interpreted as feedback on all 3 — the user can refine by leaving the structured `trailhead-fp:` comment.

## Outputs

### 1. Daily digest (per repo)

Cron schedule: `0 14 * * *` UTC (07:00 PT — before David's day starts).

Payload posted to `digest_webhook_url` configured in `.trailhead.yml`. Default Slack-compatible JSON shape:

```json
{
  "schema": "trailhead.tuning-digest.v1",
  "repo": "KomatikAI/komatik",
  "window": { "start": "2026-05-19T00:00:00Z", "end": "2026-05-26T00:00:00Z", "days": 7 },
  "totals": {
    "evaluations": 142,
    "block": 18,
    "warn": 86,
    "allow": 38,
    "overrides": 4,
    "agent_prs": 119
  },
  "detectors": [
    {
      "code": "risk.test_coverage",
      "blocked": 12,
      "warned": 24,
      "fixed_after_remediation": 18,
      "fp_signals": 1,
      "fp_rate": 0.028,
      "status": "ok"
    },
    {
      "code": "policy.duplicate_logic",
      "blocked": 2,
      "warned": 19,
      "fixed_after_remediation": 3,
      "fp_signals": 6,
      "fp_rate": 0.286,
      "status": "auto_downgraded",
      "downgraded_at": "2026-05-24T14:00:00Z"
    }
  ],
  "agents": [
    {
      "agent_id": "frontend-dev",
      "prs": 22,
      "ready": 15,
      "blocked": 4,
      "abandoned": 3,
      "median_rounds_to_ready": 2,
      "sensitive_path_violations": 0,
      "trust_signal": "converging"
    }
  ],
  "overrides": [
    {
      "pr_url": "...",
      "author": "david",
      "reason": "hotfix: prod outage",
      "pre_decision": "block"
    }
  ],
  "auto_downgrades_last_7d": [
    {
      "detector": "policy.duplicate_logic",
      "downgraded_at": "...",
      "fp_rate_at_trigger": 0.31,
      "tuning_issue": "#NNN"
    }
  ]
}
```

### 2. Auto-downgrade

Cron schedule: hourly (allows fast reaction to a runaway detector).

**Trigger:** any detector whose **fleet-wide** 7-day rolling FP rate ≥ `0.15` AND has ≥ 10 emissions in the window.

**Effect:**

- Detector's `mode` flipped from `block` → `warn` in the Trailhead Cloud config layer (overrides per-repo `.trailhead.yml` until cleared)
- Auto-opens a tuning issue in `KomatikAI/trailhead` titled `[tune] detector <code> auto-downgraded (FP rate <pct>%)`
- Issue body: detector code, FP rate, sample of recent flagged PRs, sample of feedback reasons
- Reverting the downgrade requires a manual `auto-downgrade-revert` label on the tuning issue
- Webhook event `trailhead.detector_auto_downgraded` fires

**Per-repo override:** repo can disable auto-downgrade by setting `tuning.auto_downgrade: false` in `.trailhead.yml` (default: `true`).

### 3. Per-agent rolling-stats API

`GET /api/v1/agents/{agent_id}/recent-evaluations?days=30`

```json
{
  "agent_id": "frontend-dev",
  "window_days": 30,
  "evaluations": 87,
  "decisions": { "allow": 31, "warn": 38, "block": 18 },
  "ready_without_human": 49,
  "median_rounds_to_ready": 2,
  "p95_rounds_to_ready": 4,
  "sensitive_path_violations": 1,
  "top_detectors": [
    { "code": "risk.test_coverage", "count": 22 },
    { "code": "policy.pr_scope", "count": 14 }
  ],
  "trust_signal_v1": "converging"
}
```

Performance target: p95 < 500ms on Komatik's evaluation volume (~3k/month).

`trust_signal_v1` is a stub for Phase B's real trust score. Values: `converging` (ready_without_human ≥ 0.6), `flailing` (median_rounds_to_ready > 3), `quiet` (< 10 evaluations in window).

## Migrations

```sql
ALTER TABLE trailhead_evaluations
  ADD COLUMN IF NOT EXISTS agent_provenance_id text;

CREATE INDEX IF NOT EXISTS idx_trailhead_evals_agent_provenance
  ON trailhead_evaluations (agent_provenance_id, created_at DESC)
  WHERE agent_provenance_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS trailhead_detector_downgrades (
  detector_code text PRIMARY KEY,
  downgraded_at timestamptz NOT NULL DEFAULT now(),
  fp_rate_at_trigger numeric NOT NULL,
  tuning_issue_url text,
  reverted_at timestamptz,
  reverted_by text
);

ALTER TABLE trailhead_detector_downgrades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON trailhead_detector_downgrades
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Backfill `agent_provenance_id` from existing `pr.provenance.source` JSONB field — best effort, non-blocking.

## Implementation plan

1. **Week 1:** migrations + backfill + `agent_provenance_id` population in `evaluateGate`
2. **Week 2:** rolling-stats endpoint + daily digest cron + webhook delivery
3. **Week 3:** auto-downgrade hourly cron + tuning-issue auto-open + Cloud config override layer
4. **Week 4:** dogfood digest on Komatik for 5 days before the v4.3.0 release + rollout

## Open questions

1. **Should auto-downgrade be cluster-wide or per-repo?** Recommended: cluster-wide (a noisy detector is usually noisy everywhere). Per-repo opt-out exists for the rare exception.
2. **Should `trailhead-false-positive` label feedback decay over time?** Recommended: 30-day rolling window, no decay weighting in v1 (keep simple, observe).
3. **How does override usage interact with FP rate?** Recommended: overrides are tracked separately, not counted as FP signals (override = "I know better," not "this rule is wrong").
4. **Notification channel for tuning issues?** Recommended: same webhook as digest, with `event: detector_auto_downgraded` type.

## Non-goals (v1)

- Per-agent dashboard UI (deferred to Phase D)
- Real-time alerts on individual high-risk PRs (handled by existing webhook events)
- Detector A/B testing (Phase B+)
- Cross-org analytics (multi-tenant work, Phase D)
