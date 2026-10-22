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

| Surface                              | Content                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| PR comment (`trailhead-gate-report`) | Brief first, then the rest of the gate report. Edited in place. |
| Job summary / check-run summary      | The same markdown.                                              |
| `release-brief-json` output          | The brief as JSON.                                              |
| Evaluation store                     | `release_brief` + `enumerated_findings` columns.                |

**The brief is stated once.** When a brief is attached, the legacy report below it drops
the sections the brief already carries — the verdict / risk-vs-threshold summary rows, the
CI-checks table, and the counted policy-findings list — and keeps everything else (size and
health, risk-factor breakdown, guidance, health checks, provenance and trust, files changed,
the remediation/agent brief, override feedback, footer). Restating them was how a stale
threshold once rendered beside the live one. Evaluations stored before the brief existed
re-render with the full legacy report, since there is nothing above it to defer to.

Every threshold the report prints is the **effective** threshold — the one the evaluation
was judged against after context, environment, agent-PR policy and trust adjustments — read
from the brief, not from the action's base `risk-threshold` input.

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
- **A default disposition describes itself.** It came from the check's required/optional
  flag, so it says so: `blocking → "required check"`, `advisory → "not required"`. No brief
  row ever renders as a bare `advisory / —`.
- **A `skip` resolves to `irrelevant` whatever its source**, reason
  `"skipped upstream (path filter or workflow condition)"` — the workflow's own path filter
  or `if:` condition already classified it out, and the brief says that rather than rendering
  the self-contradiction `skip | blocking | —` (the promotion-zero correction on
  trailhead#350). A policy `irrelevant` entry's own reason survives; a policy `blocking` or
  `advisory` entry still governs the check whenever it actually runs. This is narration-only
  and outcome-neutral: `skip` never counted against release readiness (which counts
  `fail`/`missing`/`stale`) and the blocking-set rollup already treated it as passing.
- **Policy-sourced dispositions are otherwise never rewritten.** A check an entry claims
  keeps that entry's disposition and reason for every non-`skip` ADR-009 status.
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

#### Label liveness

Labels are read **live** from the GitHub API at the start of every evaluation, not taken
from the triggering event's payload. The payload is a snapshot: re-running a workflow
replays the run's original event, so a label applied afterwards would never appear in it.
Since GitHub only turns a failed check suite green by rerunning it, a payload-only read
made the override unusable exactly where it is needed — apply the label, rerun, and the
rerun could not see it. The same live read backs context matching and merge-queue
detection, so every consumer sees one current set of labels. If the live read fails, the
run warns and falls back to the payload labels for that evaluation.

That single live label read is also what the override consumes — there is no second
label read. PR comments are fetched separately (REST `issues.listComments`) and only when
the live labels actually carry `trailhead-override`, so an evaluation with no override
intent makes no comment request. Live labels are authoritative: removing the label revokes
the override even if an older labeled run is re-run.

When the live read fails, the fallback is a **degradation, not a regression** — the
evaluation continues on the triggering event's payload and can still authorize, and the
brief records `overrideStatus.source: payload_fallback` so the degraded read is visible.
The one thing a frozen payload cannot do is supply an override reason it never carried;
that case is reported as `overrideStatus.status: unavailable` with the recovery step.

Record the comment **before** adding the label. `labeled`/`unlabeled` activity triggers
the gate only for `trailhead-override`; unrelated label changes are filtered at the job.
If a label-first run starts before the comment exists, add the comment and re-run, or
remove and re-add the label.

Use the safe concurrency group from `docs/getting-started.md` so the newest real gate
event supersedes older evaluations, including a label revocation overtaking an active
override run. GitHub evaluates concurrency before the job filter, so ignored-label runs
must use a unique group such as `github.run_id` rather than canceling the real gate, and
the group must include `github.workflow` so separate publishers cannot cancel each other.

Any incomplete or unusable trace is explicit in `overrideStatus`: comment without
label, label without comment, retained mechanical CI under `risk_only`, disabled/capped
policy, or payload-only fallback. The brief gives the next action rather than silently
ignoring the recorded human intent.

### Required-check publication (ADR-012 D3)

Branch protection must require the custom check named by `gate.check_name` or the
`check-name` action input (default **Trailhead — Release Ready** in release-ready mode and
**Trailhead** in risk-only mode), not the native workflow job name. The check's source is the
GitHub App that owns the publication token: GitHub
Actions when Trailhead uses `GITHUB_TOKEN`, or the separate App when an installation token
is supplied. The custom check is published on the evaluated PR head SHA and works across
`pull_request` and `pull_request_review` evaluations. Native job checks remain attached to
their triggering workflow suite and can reproduce the close/reopen failure that motivated
ADR-012.

An explicit `check-name` action input overrides `gate.check_name`; repo config supplies the
name when the input is absent.

Pin the token's publishing GitHub App as the expected source as well as the name. For
`GITHUB_TOKEN`, pin **GitHub Actions** (`integration_id: 15368` on github.com); for an
installation token, pin that separate App instead. A name-only rule can be satisfied by a
different app publishing the same context. GitHub Enterprise Server installations must
use the corresponding local App id.

Fork PRs are a permission boundary: their ordinary `pull_request` token is read-only and
cannot publish this custom check. Public repositories must use the no-checkout
`pull_request_target` publisher in `docs/getting-started.md`, or a GitHub App installation
token and a ruleset pinned to that App. Reapplying the label cannot repair a read-only
token by itself. The target-only publisher does not receive review events, so fork policies
that enforce approvals require an installed App or external publisher listening to review
webhooks with a write-capable installation token. Without that bridge, review state must not be
a blocking Trailhead input for fork PRs.

The Release Brief records whether custom-check publication succeeded. If it failed, the
brief states that the evaluation cannot satisfy protection and names the recovery path:
restore GitHub Checks access and re-run, or apply/reapply the override label to trigger
`pull_request:labeled`.

After the check is created, Trailhead refreshes that same check run with the publication
record before persisting the completed brief. It retries that D3 refresh twice. If both
attempts fail, `requiredCheck.reportRefreshed` is `false` and every persisted/downstream
surface warns **published, report stale**; branch protection still has the published
conclusion, but the check body does not claim to be synchronized. When refresh succeeds,
the evaluation store, JSON output, webhook, job summary, custom-check summary, and PR
comment expose the same D3 state.

If evaluation itself throws, Trailhead still best-effort publishes the custom context —
but a run that evaluated nothing never publishes `success`. `fail_open` publishes
conclusion **neutral**, titled **CANNOT EVALUATE (FAIL-OPEN)**: it does not block the
merge and does not claim a passing verdict. `fail_closed` publishes **failure**, titled
**CANNOT EVALUATE (FAIL-CLOSED)**. A Checks API failure remains visible and may leave
protection pending; fail-open is not permission to pretend publication occurred.

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
