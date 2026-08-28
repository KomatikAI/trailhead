---
chapter: engine/release-ready-decision
title: The Release Ready decision
description: How Trailhead combines CI meaning, risk, health, policy, and communication into one reviewable verdict.
section: engine
owner: David
order: 10
status: current
ttl_days: 30
last_verified: 2026-08-26
verified_by: "Project Book backfill from merged Trailhead pull requests"
pins:
  - pr:12
  - pr:214
  - pr:348
---

# The Release Ready decision

<a id="p-trailhead-release-ready-is-composite"></a>
### Release Ready is composite {#p-trailhead-release-ready-is-composite}

Trailhead presents one release decision that combines required CI, configured risk policy, freeze state, and health evidence. A green unit-test job is an input to that decision, not a synonym for release readiness.

> since 2026-05-24 · verified 2026-08-26 · confidence ratified · sources: `pr:214`

<a id="p-trailhead-risk-engine-is-shared"></a>
### One risk engine serves every surface {#p-trailhead-risk-engine-is-shared}

The Action owns the canonical risk implementation, and the App and MCP surfaces receive reviewed copies through the build process. Independent scoring forks are not allowed to invent different decisions for the same change.

> since 2026-04-10 · verified 2026-08-26 · confidence ratified · sources: `pr:12`

<a id="p-trailhead-ci-status-and-relevance-differ"></a>
### CI status and relevance differ {#p-trailhead-ci-status-and-relevance-differ}

A check has both a mechanical status and a configured meaning for the matched branch context. Input relevance marks it blocking, advisory, or irrelevant with a reason, so unrelated checks do not silently control a release train.

> since 2026-08-09 · verified 2026-08-26 · confidence ratified · sources: `pr:348`

<a id="p-trailhead-brief-enumerates-actionable-findings"></a>
### Brief enumerates actionable findings {#p-trailhead-brief-enumerates-actionable-findings}

The Release Brief leads the PR comment, job summary, and check summary with the verdict, threshold, top risk movers, one row per CI input, and next actions. Findings are enumerated with evidence instead of being hidden behind an unhelpful count.

> since 2026-08-09 · verified 2026-08-26 · confidence ratified · sources: `pr:348`

<a id="p-trailhead-risk-override-boundary"></a>
### Risk override cannot green red tests {#p-trailhead-risk-override-boundary}

A scoped `risk_only` override can clear risk and policy findings, but it cannot clear mechanical blocking inputs. Trailhead records both the reasons removed and the blockers that survived.

> since 2026-08-09 · verified 2026-08-26 · confidence ratified · sources: `pr:348`

<a id="p-trailhead-evaluation-failure-must-speak"></a>
### Evaluation failure must speak {#p-trailhead-evaluation-failure-must-speak}

When Trailhead cannot evaluate, it emits a `cannot_evaluate` brief that names the failure instead of going silent. The matched context can choose fail-open or fail-closed availability without pretending an unavailable evaluation was a normal verdict.

> since 2026-08-09 · verified 2026-08-26 · confidence ratified · sources: `pr:348`
