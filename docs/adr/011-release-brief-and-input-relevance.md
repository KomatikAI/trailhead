# ADR-011: Release Brief and Input Relevance Policy — closing the communication gap

**Status:** Proposed
**Date:** 2026-08-09
**Author:** Fable (Komatik keystone), from the 2026-08-09 Komatik promotion-train post-mortem
**Builds on:** ADR-006 (Release Ready composite gate), ADR-008 (gate modes), ADR-009 (CI check classification)
**Decision owner:** David

## Context

ADR-006 already answers the authority question: Trailhead — Release Ready is designed to be **the single
required check**, composing CI status, risk, policy, freeze, health, and security into one decision. ADR-009
defines how CI inputs are read (`pass/fail/skip/pending/stale/missing`).

The 2026-08-09 Komatik promotion train (dev → staging → master, first master promotion in ~110 PRs) showed
what is still missing. Two gate failures in one night, neither a detection failure — **both were
communication failures at the decision point**, and one exposed a hole in the input model:

**Case A — the verdict that could not speak.** On the dev→staging PR (komatik #4033), the gate
(`trailhead@v4.6.0`, `gate-mode: release-ready`) returned **BLOCK: risk 90, "CI integrity blocking patterns
detected (4)"**. The four patterns were never enumerated anywhere a human could see — not on the PR, not in
the job summary; the CI log carries only the count, and the full evaluation went to `/api/trailhead/store`
and stayed there. Because Trailhead was not the required check in that repo, the human decision-owner's only
path forward was a GitHub **admin-merge — a bypass of every gate at once**, recording nothing about what risk
was reviewed and accepted. The gate reasoned correctly and communicated a number.

**Case B — the input model has no concept of "failed but irrelevant."** On the staging→master PR (komatik
#4034), GitHub's required-check bag blocked the merge on a red `Deploy Edge Functions` check. That red was a
**staging-push infra failure** — `supabase link` on `SUPABASE_STAGING_PROJECT_REF`, a secret that
*deliberately does not exist* (no staging Supabase project is provisioned; the sibling migrations workflow
has carried a skip-guard comment saying exactly this since 2026-07-26). Under ADR-009's enum this is simply
`fail`. There is no vocabulary for what it actually was: **a failed check that is irrelevant to THIS
promotion decision, for a stateable reason**. Diagnosis and repair took a human an hour of log-spelunking
plus a workflow patch (komatik #4035); a reasoning gate with a relevance policy would have classified it in
milliseconds and said so on the PR.

The shared diagnosis: **the release brief — what a human needs at the moment of decision — is owned by
nobody.** GitHub can enforce but cannot reason or narrate. Trailhead reasons, but its reasoning today
surfaces as a check conclusion plus a stored evaluation nobody is looking at.

## Decision

Three additions to the release-ready gate, in priority order. Narration first — it ships value with zero
enforcement change and would have answered both cases by itself.

### 1. The Release Brief (the communication contract)

Every evaluation — allow, warn, block, or **cannot-evaluate** — posts a structured comment on the PR (edited
in place on re-evaluation; the check's summary links to it):

```
verdict: allow | warn | block | cannot_evaluate
risk_score: <int>                 # with effective threshold and top movers
findings: [ { id, title, evidence, severity } ]     # ENUMERATED — a bare count is a bug
inputs:   [ { check_name, adr9_status, disposition, reason } ]
delta:    <string>                # vs previous evaluation of this PR/head
actions:  [ { kind: fix | override | wait, detail, link } ]
override: { by, at, scope, rationale } | null
```

Contract rules:

- **Findings are enumerated, never counted.** "CI integrity blocking patterns detected (4)" is a violation
  of this contract. Each pattern gets id, evidence, severity.
- **Every input gets a disposition with a reason** (see §2) — including the ones that did NOT count.
  Case B's line would have read:
  `Deploy Edge Functions: fail → irrelevant (staging target unconfigured by design; see
  supabase-migrations.yml guard, 2026-07-26)`.
- **Silence is a bug.** If the evaluation cannot run (store unreachable, token missing), the brief says so
  and applies the availability stance (§4). A gate that fails to evaluate must still communicate.

### 2. Input relevance policy (extends ADR-009)

ADR-009's status enum (`pass/fail/skip/pending/stale/missing`) describes what a check DID. This ADR adds a
per-target-branch **disposition** describing what it MEANS for this decision:

| Disposition | Meaning |
| --- | --- |
| `blocking` | red ⇒ release not ready |
| `advisory` | feeds risk/warn, never blocks alone |
| `irrelevant(reason)` | classified out for THIS branch pair, reason mandatory and shown in the brief |
| `missing_blocking` | ADR-009 `missing` on a check policy requires |

Policy lives in repo config (the ADR-007 config schema is the natural home) as a
`branch-pair → check-pattern → disposition` table. Seed table for komatik (the dogfood consumer):
CI Gate / type-check / test suites / certification legs / migration lint ⇒ `blocking` on both staging and
master pairs; push-triggered staging-target deploy checks ⇒ `irrelevant(unconfigured-by-design)` on
master pairs; agent-author Vercel checks ⇒ `irrelevant(documented non-blocking)`.

### 3. Scoped, recorded override

A human override becomes a first-class Trailhead action (comment command or dashboard), recorded in the
evaluation store `{by, at, scope, rationale}` and rendered in the brief. **Scope is `risk_only`**: it
overrides the risk verdict and policy findings, never mechanical `blocking` inputs (red tests stay red).
Getting past a red mechanical input remains a GitHub admin-merge — restored to what it should be: visible
and extraordinary, not the routine override path. (Komatik's `BRANCHING.md` solo-maintainer section
currently *instructs* configuring the bypass list for routine promotions — the exact pattern this replaces.)

### 4. Availability stance (per branch pair, written down)

Proposed defaults for the dogfood consumer: master pairs **fail closed** (no evaluation ⇒ no verdict ⇒ no
merge; break-glass = admin-merge, already extraordinary per §3); staging pairs **fail open with a
cannot-evaluate brief**. Consumers set their own in config; the requirement this ADR imposes is only that
it is explicit.

## Calibration note (carried from Case A, feeds ADR-006's threshold model)

Risk 90 on a train that was keystone-verified, corpus-validated, and 100%-reviewed suggests the risk model
needs a promotion-shaped calibration analog to the branch-pair exemption the scope rule already applies
(`pr_scope: branch pair dev -> staging matches an exempt rule — scope limits skipped`). Stage 1 below
measures this before any consumer flips enforcement.

## Rollout

- **Stage 0 — narrate only.** Ship the Release Brief with no enforcement change anywhere. Would have
  resolved both 2026-08-09 cases on its own.
- **Stage 1 — calibrate.** Track brief accuracy on real promotions (every block explainable? every
  `irrelevant` classification correct?). Exit: N consecutive promotions with zero human corrections.
- **Stage 2 — komatik flips staging** branch protection to require only `Trailhead — Release Ready`
  (finally wiring what ADR-006 designed).
- **Stage 3 — komatik flips master**, with fail-closed availability and recorded override live.
  Admin-merge count becomes a tracked metric, expected value zero.

## Consequences

- The gate's value becomes legible exactly where decisions happen; time-to-diagnosis for a blocked
  promotion drops from log access to reading one comment.
- Accepted risk finally leaves a record (Case A's admin-merge left none).
- New maintenance surface: the relevance policy table — deliberately small, in config, and self-auditing
  (every `irrelevant` prints its reason on every PR, so a stale reason is visible daily).
- Dogfood story: "Komatik's own production merges are governed by Trailhead" becomes a true product
  sentence, with this ADR's gap list as the roadmap that made it true.

## Source findings (2026-08-09, verified live during the train)

1. The v4.6.0 action logs a BLOCK with a findings **count**; the enumeration exists only in the stored
   evaluation, which is not linked from the check output. (§1 closes.)
2. ADR-009 has no relevance axis; a deliberately-unconfigured staging deploy target surfaces as bare
   `fail` and blocked a master promotion in a consumer whose required-check list included it. (§2 closes;
   consumer-side symptom patched as komatik #4035.)
3. The evaluation store and `warn,block` webhooks already exist — the substrate for the brief is built;
   what is missing is the PR-surface narration and the disposition vocabulary.
4. Consumer-side branch-protection guidance (komatik `BRANCHING.md`) normalizes admin-bypass for solo
   maintainers — evidence that the override path this ADR specifies is currently filled by the most
   dangerous available mechanism.
