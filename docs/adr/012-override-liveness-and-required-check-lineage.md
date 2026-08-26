# ADR-012: Override Liveness, Required-Check Lineage, and the `|| true` Suppression Taxonomy

**Status:** Proposed
**Date:** 2026-08-26
**Author:** Fable (Komatik keystone), from the 2026-08-26 komatik train-33 post-mortem
**Builds on:** ADR-006 (Release Ready composite gate), ADR-009 (CI check classification), ADR-011 (release brief and input relevance; §3 recorded human override)
**Decision owner:** David

## Context

ADR-011 §3 introduced the recorded human override: label `trailhead-override` plus a
`trailhead-override: <reason>` PR comment, scope `risk_only`, never clearing a red mechanical CI
input. The 2026-08-26 komatik promotion train-33 (komatik PR #4880) was the override's **first
production use**, and it surfaced three latent defects — none in the override's *decision* logic,
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
head SHA — created *later* — did not count. Getting the override honored required **closing and
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

## Decision (proposed — D1–D5 await the decision owner)

**D1 — Overrides are evaluated against live PR state, never solely the event payload.** At
evaluation time the gate re-reads the PR's current labels and comments via the API (the
`githubToken` it already holds) and unions them with the payload. A recorded override is therefore
visible to *any* subsequent evaluation of that PR — including reruns — regardless of which event
minted the run. Payload-only reading is retained as the no-token fallback and the brief must say
so when it applies.

**D2 — Recording an override triggers re-evaluation.** The documented workflow template (and
`getting-started`) adds `labeled` and `unlabeled` to the `pull_request` trigger types, filtered in
the job to the `trailhead-override` label to avoid re-evaluating on unrelated labels. Applying the
override then produces a fresh verdict within minutes, on the event lineage protection consumes —
no close/reopen ceremony, no rerun-trap.

**D3 — The verdict must land on the required-check lineage, and the brief must say when it
cannot.** An evaluation triggered by any event either (a) publishes its conclusion to the same
named check run lineage that branch protection consumes for the head SHA, or (b) states in the
Release Brief that this evaluation *cannot* satisfy the required context and names the event that
can. A green gate that silently fails to unblock the merge is a communication failure by ADR-011's
own standard. (Mechanism note: GitHub check runs created by workflow runs attach to their
triggering suite; if re-publishing across suites proves impossible, option (b) is mandatory and
the close/reopen remedy is documented rather than folklore.)

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
recorded human decision is treated as a defect.

## Consequences

- The override path becomes usable in anger: record label + comment, wait one evaluation, merge.
  Today's ceremony (rerun → fail → review-trigger → fail → close/reopen → 25-minute CI re-run)
  disappears.
- Reruns become safe *for overrides* (D1). They remain payload-frozen for everything else — the
  komatik runbook rule ("a rerun never picks up new state") still applies to code and config.
- ci_integrity keeps its teeth: the exemption class is narrow, data-driven, and reviewed; the
  default stays BLOCK.
- Cost: one API read per evaluation on PRs carrying the override label (D1), one extra trigger
  type (D2), and a brief-rendering branch (D3b/D5).

## Evidence index

- komatik PR #4880 (train-33), 2026-08-26: runs 33018061932 / 33019596489 / 33019872286.
- `src/override.ts` @ 622c6e92: `hasOverrideLabel` consumes `prMatchCtx.labels` (payload-derived);
  `partitionOverrideReasons` correctly classifies ci_integrity as overridable — the decision logic
  was never the problem.
- PR #359: the trap-cleanup exemption — the per-context-patch pattern D4 replaces.
- komatik PR #4881: the dispatch-time↔PR-time drift gate that now makes every trailhead repin
  round-trip through komatik's validator — why D4's data-driven class matters for repin frequency.
