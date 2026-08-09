# Release Brief (ADR-011)

The Release Brief is what a human reads at the moment of a release decision. Every
evaluation — allow, warn, block, or **cannot-evaluate** — posts one on the PR, edited
in place on re-evaluation, and exposes the same object on the `release-brief-json`
Action output.

See [ADR-011](adr/011-release-brief-and-input-relevance.md) for the decision record.

## The contract

```jsonc
{
  "verdict": "allow | warn | block | cannot_evaluate",
  "riskScore": 42,
  "riskThreshold": 70,
  "topMovers": [{ "factor": "code_churn", "score": 30 }], // top 3, descending
  "findings": [
    { "id": "ci_integrity/1", "title": "…", "evidence": "…", "severity": "blocking" },
  ],
  "inputs": [
    {
      "checkName": "CI Gate",
      "status": "fail",
      "disposition": "blocking",
      "reason": "…",
    },
  ],
  "delta": "vs previous: block -> allow, risk 90 -> 42, 3 findings resolved, 1 new",
  "actions": [{ "kind": "fix | wait | override", "detail": "…", "link": "…" }],
  "override": { "by": "dave", "at": "…", "scope": "risk_only", "rationale": "…" },
}
```

Three rules the implementation enforces:

1. **Findings are enumerated, never counted.** `"CI integrity blocking patterns detected (4)"`
   is a contract violation. Every detector pattern becomes its own `{id, title, evidence, severity}`
   row. (`policyFindings` keeps its legacy count strings for existing consumers;
   `enumeratedFindings` is the enumeration.)
2. **Every input gets a disposition with a reason — including the ones that did not count.**
   A check classified out still gets a row saying so and why.
3. **Silence is a bug.** If the evaluation cannot run at all, the brief says so, names the
   failure, and applies the availability stance below.

### Where it appears

| Surface                              | Content                                                      |
| ------------------------------------ | ------------------------------------------------------------ |
| PR comment (`trailhead-gate-report`) | Brief first, then the existing gate report. Edited in place. |
| Job summary / check-run summary      | The same markdown.                                           |
| `release-brief-json` output          | The brief as JSON.                                           |
| Evaluation store                     | `release_brief` + `enumerated_findings` columns.             |

### Truncation

Two independent caps, because GitHub rejects an oversized body outright (issue comments cap at
65 536 characters, a check run's `output.summary` at 65 535).

**1. The brief is capped at 20 000 characters inside the gate report.** Truncation order is
deliberate: **drop findings from the end first**, always keeping at least one plus a pointer to
the stored evaluation; then cap each finding's evidence at 300 characters; then, as a last
resort, hard-clip. Inputs, delta, actions and override are never dropped — the input table is
the part that answers "why is this blocked?".

**2. The whole body is clamped to 65 000 characters at the two GitHub surfaces.** The legacy
report appended below the brief is unbounded on its own (the files-changed list grows with the
PR), so `postPrComment` and `createCheckRun` clamp what they send. Only the tail below the
brief is trimmed — at a section boundary where one is available — and a visible
`…report truncated (N chars over GitHub's comment limit)` notice replaces it. The brief itself
is never cut by this pass. The job summary and the stored evaluation keep the full report, which
is where the notice points.

## Config reference

### `contexts[].input_relevance` (ADR-011 §2)

ADR-009's status enum (`pass|fail|skip|pending|stale|missing`) says what a check **did**.
A disposition says what it **means for this decision**:

| Disposition        | Meaning                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `blocking`         | red ⇒ release not ready                                            |
| `advisory`         | feeds risk/warn, never blocks alone                                |
| `irrelevant`       | classified out for this branch pair — **reason mandatory**         |
| `missing_blocking` | derived, never configured: ADR-009 `missing` on a `blocking` check |

Resolution rules:

- Entries are evaluated **in declaration order; the first match wins**, like `contexts[]` itself.
- A pattern matches on exact name, case-insensitive name, configured-value-as-prefix, or glob.
- No matching entry falls back to `required ? blocking : advisory` — so a config with no
  `input_relevance` block behaves exactly as it did before ADR-011.
- An `irrelevant` entry with no `reason` is a config error. It is **warned, not fatal**
  (a hard failure would drop the whole repo config to defaults over one missing string) and
  the brief prints a placeholder reason that is obviously wrong on sight.

> **Glob caveat:** `*` compiles to `[^/]*`, so `"CI Gate *"` will **not** match
> `"CI Gate / type-check"`. Check names containing `/` need `**` — `"CI Gate **"`.

### `contexts[].availability` (ADR-011 §4)

`fail_open` | `fail_closed`. When the evaluation itself fails, the matched context's stance
**overrides the `fail-mode` action input**. Absent a stance (or when no context matched),
behaviour is unchanged: the `fail-mode` input, defaulting to closed only for
`environment: production`.

Either way, a cannot-evaluate brief is posted to the PR before the run resolves.

### `override.scope` (ADR-011 §3)

The `trailhead-override` label + `trailhead-override: <rationale>` comment mechanism now
carries a scope:

- `full` (default, pre-ADR-011 behaviour) — flips release-readiness wholesale.
- `risk_only` — overrides the risk verdict and policy findings, **never mechanical blocking
  inputs**. Red tests stay red. Getting past a red mechanical input remains a GitHub
  admin-merge: visible and extraordinary, not the routine override path.

Under `risk_only`, reasons the override cleared are recorded as `overriddenReasons` and
reasons that survived as `retainedReasons`, both on the stored `policy_override`.

## Example `.trailhead.yml`

This is ADR-011's seed table for the dogfood consumer (komatik), written out in full.

```yaml
schema_version: 2

gate:
  mode: release-ready
  check_name: "Trailhead — Release Ready"

thresholds:
  risk: 90
  warn: 50

override:
  enabled: true
  max_per_week: 3

contexts:
  # dev -> staging: the promotion train's first leg.
  - name: staging-promotion
    match:
      base_branch: [staging]
      head_branch: [dev]
    environment: staging
    availability: fail_open
    thresholds:
      risk: 90
      warn: 50
    ci:
      required_checks: [CI Gate, Security Guard, Migration Lint]
      optional_checks: []
      missing_required: fail
    input_relevance:
      - pattern: "CI Gate **"
        disposition: blocking
      - pattern: "Migration Lint"
        disposition: blocking
      - pattern: "vercel**"
        disposition: irrelevant
        reason: "agent-author Vercel preview — documented non-blocking"

  # staging -> master: the promotion that ADR-011 Case B blocked.
  - name: production-promotion
    match:
      base_branch: [master, main]
      head_branch: [staging]
    environment: production
    availability: fail_closed
    thresholds:
      risk: 90
      warn: 50
    ci:
      required_checks: [CI Gate, Security Guard, Migration Lint, Certification]
      optional_checks: []
      missing_required: fail
    input_relevance:
      - pattern: "CI Gate **"
        disposition: blocking
      - pattern: "Certification **"
        disposition: blocking
      - pattern: "Migration Lint"
        disposition: blocking
      - pattern: "Deploy Edge Functions"
        disposition: irrelevant
        reason: "staging target unconfigured by design — no staging Supabase project; see supabase-migrations.yml skip-guard (2026-07-26)"
      - pattern: "vercel**"
        disposition: irrelevant
        reason: "agent-author Vercel preview — documented non-blocking"
```

With that table, ADR-011 Case B's line reads on the PR as:

```
| Deploy Edge Functions | fail | irrelevant | staging target unconfigured by design — … |
```

instead of an hour of log-spelunking.

## Evaluation store

`release_brief` and `enumerated_findings` are new `jsonb` columns:

- Cloud / Komatik-hosted stores receive the whole `GateEvaluation` JSON, so both fields
  ride along automatically — the hosted store just needs its row mapper updated.
- The direct-Supabase path is column-explicit. Apply
  [`cloud/migrations/006_release_brief.sql`](../cloud/migrations/006_release_brief.sql)
  (Komatik fleet copy:
  [`docs/komatik-migrations/20260808120000_trailhead_release_brief.sql`](komatik-migrations/20260808120000_trailhead_release_brief.sql)).
- Until it is applied, Trailhead degrades rather than failing: the insert is retried without
  the two columns (with a warning), and the delta lookup falls back to its pre-ADR-011 select
  so remediation loop bookkeeping is unaffected. You simply get no `delta` line.

## Rollout

ADR-011 ships in four stages. **Stage 0 is what is implemented today.**

| Stage | What                                                                             | Status  |
| ----- | -------------------------------------------------------------------------------- | ------- |
| 0     | Narrate only — brief, dispositions, scoped override, availability stance         | shipped |
| 1     | Calibrate — track brief accuracy on real promotions                              | next    |
| 2     | Komatik flips **staging** protection to require only `Trailhead — Release Ready` | pending |
| 3     | Komatik flips **master**, fail-closed availability + recorded override live      | pending |

> **Review caveat — `irrelevant` is narration-only until Stage 2.** A disposition only
> changes Trailhead's own verdict. If GitHub branch protection still lists
> `Deploy Edge Functions` in its required-check bag, GitHub keeps blocking the merge no
> matter what the brief says. Dispositions become enforcement — not just narration — at the
> moment Trailhead is the **sole** required check for that branch. Until then, treat an
> `irrelevant` row as "Trailhead has classified this out and told you why", and expect the
> merge button to still be red.

Exit criterion for Stage 1: N consecutive promotions with zero human corrections — every
block explainable from the brief alone, and every `irrelevant` classification correct.
