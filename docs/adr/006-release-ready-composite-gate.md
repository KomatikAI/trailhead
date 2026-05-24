# ADR-006: Release Ready Composite Gate

**Status:** Accepted
**Date:** 2026-05-23
**Author:** Trailhead team

## Context

Trailhead v3 scores PR risk in isolation and publishes a separate check from CI systems. Consumers run Trailhead in parallel with their own CI Gate, creating two merge blockers with unclear authority and duplicated developer attention.

The v4 product vision positions Trailhead as a **Release Readiness Gate** — the single required check that answers "is this PR safe to merge and deploy?"

## Decision

The primary required check is **`Trailhead — Release Ready`**. It combines live CI status, risk scoring, policy findings, freeze windows, health probes, and security signals into one composite decision:

```
release_ready =
  all(required_checks ∈ {success, skipped_allowed})
  ∧ risk_score ≤ effective_threshold
  ∧ gate_decision ≠ block (policy findings)
  ∧ freeze_clear
  ∧ health_ok (when health checks configured)
  ∧ security_clear (when require_security_clear configured)
```

When `gate.mode` is `release-ready`, this composite result drives the check conclusion and merge blocking behavior.

## Rationale

- One check, one answer — developers should not reconcile CI Gate and Trailhead independently.
- CI topology varies per repo; Trailhead reads GitHub Checks API rather than re-running CI.
- Risk scoring remains valuable but is one dimension of readiness, not the whole story.

## Consequences

- **Positive:** Clear product positioning; branch protection requires one check name.
- **Positive:** Promotion-aware policy via `contexts` (see ADR-007).
- **Negative:** Trailhead must poll/wait for CI when configured — adds latency on PRs.
- **Mitigated by:** `wait-for-checks` timeout, optional `missing_required: skip` for path-filtered jobs.

## Related

- ADR-007: Config schema v2 (contexts)
- ADR-008: Gate modes
- ADR-009: CI check classification
