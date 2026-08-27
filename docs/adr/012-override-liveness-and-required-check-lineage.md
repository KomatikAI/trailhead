# ADR-012: Override Liveness, Required-Check Lineage, and the `|| true` Suppression Taxonomy

**Status:** Accepted
**Date:** 2026-08-26
**Author:** Fable (Komatik keystone), from the 2026-08-26 komatik train-33 post-mortem
**Builds on:** ADR-006 (Release Ready composite gate), ADR-009 (CI check classification), ADR-011 (release brief and input relevance; §3 recorded human override)
**Decision owner:** David (accepted for implementation 2026-08-26)

## Context

ADR-011 §3 introduced the recorded human override: label `trailhead-override` plus a
`trailhead-override: <reason>` PR comment, scope `risk_only`, never clearing a red mechanical CI
input. The 2026-08-26 komatik promotion train-33 (komatik PR #4880) was the override's **first
production use**, and it surfaced three latent defects — none in the override's _decision_ logic,
all in how the override and the verdict travel between GitHub events, check suites, and the
required-check protection that actually blocks the merge. The train also produced the second
ci_integrity false-positive exemption request in two days. Timeline evidence: komatik runs
33018061932 (pull_request, BLOCK ×3 including two reruns), 33019596489 (pull_request_review,
SUCCESS with override), 33019872286 (pull_request after close/reopen — the run that finally fed
the required context).

**Case A — the override that was recorded but invisible.** The operator applied the label and the
reason comment exactly as ADR-011 specifies. The gate never saw them: the run being re-run carried
the **original `pull_request` event payload**, whose embedded PR object predates the label.
`gh run rerun` re-executes that frozen payload, so no number of reruns can ever observe a
subsequently-recorded override. The gate printed the same BLOCK with no mention that an override
existed. The operator's sanctioned action was silently inert — the worst communication shape
ADR-011 exists to prevent.

**Case B — the green verdict that could not satisfy the merge.** A `pull_request_review`-triggered
evaluation (its payload fresh, override visible) ran and PASSED. Branch protection still refused
the merge: `Required status check "Trailhead Gate" is failing.` The required context was pinned to
the **`pull_request`-event check-suite lineage**, where the latest attempt was the payload-frozen
failure from Case A. A passing check run of the same name, same workflow, same app, on the same
head SHA — created _later_ — did not count. Getting the override honored required **closing and
reopening the release PR** to mint a fresh `pull_request` payload: an undignified, undocumented
ceremony for a sanctioned path, and one that re-runs every other PR workflow (~25 minutes of CI)
as a side effect.

**Case C — ci_integrity pattern rigidity, second exemption in two days.** The train carried a new
workflow whose label-ensure helper reads
`gh label create "$1" --color "$2" --description "$3" >/dev/null 2>&1 || true` — creation
idempotency, with a comment at the call site documenting exactly why it is correct there. The
ci_integrity scanner blocks any `|| true` in a workflow file; the risk-61-style context does not
matter because the pattern alone forces BLOCK. PR #359 (`fix/ci-integrity-trap-cleanup`) had just
carved out the `trap` cleanup context for the identical reason. Each benign context is currently a
bespoke scanner patch plus a runtime repin — and komatik's side now gates that repin's validator
drift, so every exemption round-trips two repos.

## Decision

**D1 — Overrides are evaluated against live PR state, never solely the event payload.** At
evaluation time the gate re-reads the PR's current labels and comments via the API (the
`githubToken` it already holds). Live labels are authoritative, so removing the label revokes an
override even when an old labeled run is re-run. Event comments are not merged into a successful
live read: review/diff comments are a different surface, and stale edited/deleted payload bodies
must not outrank the PR conversation. A recorded override is therefore visible to _any_
subsequent evaluation of that PR — including reruns — regardless of which event minted the run.
When live state is unavailable, payload traces are diagnostic-only and can never authorize an
override; the brief must say what was observed and how to restore a verified read.

**D2 — Recording an override triggers re-evaluation.** The documented workflow template (and
`getting-started`) adds `labeled` and `unlabeled` to the `pull_request` trigger types, filtered in
the job to the `trailhead-override` label to avoid re-evaluating on unrelated labels. Applying the
override then produces a fresh verdict within minutes, on the event lineage protection consumes —
no close/reopen ceremony, no rerun-trap. Existing concurrency groups must isolate ignored-label
runs because GitHub applies concurrency before the job-level filter. Real gate events for a PR
share a cancel-in-progress group so a newer revocation cannot be overwritten by an older labeled
evaluation that finishes last.

**D3 — The verdict must land on the required-check lineage, and the brief must say when it
cannot.** An evaluation triggered by any event either (a) publishes its conclusion to the same
named check run lineage that branch protection consumes for the head SHA, or (b) states in the
Release Brief that this evaluation _cannot_ satisfy the required context and names the event that
can. A green gate that silently fails to unblock the merge is a communication failure by ADR-011's
own standard. (Mechanism note: GitHub check runs created by workflow runs attach to their
triggering suite. Trailhead's separate Checks API run is attached by GitHub to the app/repository/
head-SHA suite, so option (a) is implemented by making that custom check the branch-protection
contract. If custom-check publication fails, option (b) is mandatory and the recovery event is
documented rather than folklore. Protection pins both the check name and the token's publishing GitHub App;
after creation the same check run is refreshed with the publication record before the completed
brief is exposed on its other surfaces. If both refresh attempts fail, those surfaces explicitly
record `reportRefreshed: false` and **published, report stale** instead of claiming parity. A
cannot-evaluate run also publishes this contract:
success for `fail_open`, failure for `fail_closed`, both titled as cannot-evaluate rather than a
fabricated risk verdict.)

**D4 — `|| true` is classified by what it suppresses, not by its spelling.** The scanner keeps
fail-closed as the default and adds one general exemption class alongside #359's trap-cleanup
context: **idempotent-ensure and count-fallback commands whose exit code carries no CI outcome** —
creation idempotency (`gh label create … || true`, `mkdir`-like ensures) and counting fallbacks
(`grep -c … || true`). The class is defined as data (an allowlisted command-shape list, each entry
with a one-line justification), so the next benign context is a reviewed list entry, not a scanner
patch plus a two-repo repin round-trip. Anything wrapping a test, build, deploy, or verification
command remains blocking regardless of context.

**D5 — An override the evaluation cannot honor is named, not ignored.** Whenever the gate detects
any trace of an override it cannot apply (label present but comment missing, comment present but
label missing, scope excludes the reason, or — under the D1 fallback — live state unreadable), the
brief prints what was found, why it did not apply, and the exact next action. Silence about a
recorded human decision is treated as a defect. A reason retained after label removal is reported
as inactive/revoked, not as an error instructing the operator to undo the revocation.

## Consequences

- The override path becomes usable in anger: record comment + label, wait one evaluation, merge.
  Today's ceremony (rerun → fail → review-trigger → fail → close/reopen → 25-minute CI re-run)
  disappears.
- Reruns become safe _for overrides_ (D1). They remain payload-frozen for everything else — the
  komatik runbook rule ("a rerun never picks up new state") still applies to code and config.
- ci_integrity keeps its teeth: the exemption class is narrow, data-driven, and reviewed; the
  default stays BLOCK.
- Cost: one GraphQL read per PR evaluation to retrieve live labels and the newest 100 comments
  (D1), two extra `pull_request` activity types (D2), and one post-create check update plus
  brief-rendering branches (D3b/D5).
- Public fork PRs cannot publish checks with their read-only `pull_request` token. They use a
  separate `pull_request_target` publisher that never checks out or executes fork code, or an
  installed GitHub App whose identity is pinned in the ruleset. Because the target-only publisher
  does not receive review events, fork policies that enforce approvals require the App/external
  publisher path; otherwise review state cannot be a blocking Trailhead input for forks.

## Implementation

- D1/D5: `src/gate.ts` reads labels and comments in one GraphQL query immediately before override
  resolution; unverified payload state is diagnostic-only; `src/override.ts` names revoked,
  label-only, stale, capped, disabled, and scope-retained states; the Release Brief renders
  structured override status without falsely upgrading legacy source metadata.
- D2: the CLI generator, current examples, self-test workflow, README, and getting-started guide
  listen for `labeled`/`unlabeled`, filter unrelated label activity at the job, and serialize real
  gate events with an ignored-label-safe concurrency group. The old v3 Phase 2 policy kit is
  explicitly archived so its native contexts are not deployable guidance.
- D3: `Trailhead — Release Ready` (or configured `check-name`) from the token's publishing GitHub
  App is the branch-protection contract. With `GITHUB_TOKEN`, that App is GitHub Actions. Check
  publication returns a structured result; the same check is refreshed with the completed brief
  before downstream presentation/persistence, with an explicit stale-report state if both refresh
  attempts fail; the brief names publication failure and the `pull_request:labeled` recovery event. Docs explicitly reject
  native workflow job names as the protected context. Cannot-evaluate and fork-token behavior are
  explicit rather than leaving a required context pending without explanation.
- D4: `src/ci-integrity.ts` carries a reviewed data table for exact cleanup,
  idempotent-ensure, and count-fallback command shapes. Compound commands and every
  test/build/deploy/verification suppression remain blocking. App/MCP copies and committed runtime
  artifacts are regenerated from the canonical detector.

## Evidence index

- komatik PR #4880 (train-33), 2026-08-26: runs 33018061932 / 33019596489 / 33019872286.
- `src/override.ts` @ 622c6e92: `hasOverrideLabel` consumes `prMatchCtx.labels` (payload-derived);
  `partitionOverrideReasons` correctly classifies ci_integrity as overridable — the decision logic
  was never the problem.
- PR #359: the trap-cleanup exemption — the per-context-patch pattern D4 replaces.
- komatik PR #4881: the dispatch-time↔PR-time drift gate that now makes every trailhead repin
  round-trip through komatik's validator — why D4's data-driven class matters for repin frequency.
