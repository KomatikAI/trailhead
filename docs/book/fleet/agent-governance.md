---
chapter: fleet/agent-governance
title: Agent governance
description: How Trailhead classifies agent work, returns remediation, learns trust, and reconciles shipped outcomes.
section: fleet
owner: David
order: 10
status: current
ttl_days: 30
last_verified: 2026-08-26
verified_by: "Project Book backfill from merged Trailhead pull requests"
pins:
  - commit:7fa9803444117335f3a6847d498614fff9f36e52
  - commit:b7b0f56a63606f74e7f63a06f05baeaa932653b8
  - pr:234
  - pr:244
  - pr:246
  - pr:261
  - pr:269
  - pr:273
  - pr:279
  - pr:301
---

# Agent governance

<a id="p-trailhead-agent-policy-starts-with-provenance"></a>
### Agent policy starts with provenance {#p-trailhead-agent-policy-starts-with-provenance}

Trailhead classifies PR provenance before applying agent-specific policy. Unknown or ambiguous authorship remains visible so a repository can choose a stricter posture rather than silently treating automation as a familiar human.

> since 2026-05-29 · verified 2026-08-26 · confidence ratified · sources: `pr:244`

<a id="p-trailhead-submission-gate-checks-the-handoff"></a>
### Submission gate checks the handoff {#p-trailhead-submission-gate-checks-the-handoff}

The submission engine checks the proposed artifact for security, syntax, ownership, evidence, and handoff completeness before relying on ordinary PR risk alone. Advisory Phase 0 heuristics remain distinguishable from blocking Gate 1 checks.

> since 2026-05-29 · verified 2026-08-26 · confidence ratified · sources: `pr:244`, `pr:246`

<a id="p-trailhead-readable-remediation"></a>
### Remediation serves agents and humans {#p-trailhead-readable-remediation}

A blocked evaluation produces structured remediation and a readable PR brief, while semantic events let a coordinator route the next action. Loop bookkeeping preserves the relationship between repeated attempts instead of presenting every retry as unrelated work.

> since 2026-05-27 · verified 2026-08-26 · confidence ratified · sources: `commit:7fa9803444117335f3a6847d498614fff9f36e52`, `commit:b7b0f56a63606f74e7f63a06f05baeaa932653b8`, `pr:234`

<a id="p-trailhead-trust-learns-from-outcomes"></a>
### Trust learns from outcomes {#p-trailhead-trust-learns-from-outcomes}

Agent trust combines evaluation evidence with post-merge feedback and preserves cold-start uncertainty. Shadow, enforcement, and kill-switch controls let teams calibrate the signal before it changes policy.

> since 2026-05-30 · verified 2026-08-26 · confidence ratified · sources: `pr:261`

<a id="p-trailhead-repairs-stay-reviewable"></a>
### Repairs stay reviewable {#p-trailhead-repairs-stay-reviewable}

Corrective automation is bounded to reviewed repair classes and produces a GitHub change for review rather than silently deploying a fix. Cross-repository contract repair opens a traceable PR against the declared owner.

> since 2026-06-02 · verified 2026-08-26 · confidence ratified · sources: `pr:269`, `pr:273`

<a id="p-trailhead-close-on-ship-reconnects-work"></a>
### Close-on-ship reconnects work {#p-trailhead-close-on-ship-reconnects-work}

Agent submissions can be required to name the task they will close when shipped. That link gives fleet reconciliation a durable bridge from merged code back to planned work.

> since 2026-07-18 · verified 2026-08-26 · confidence ratified · sources: `pr:301`

<a id="p-trailhead-can-backfill-historical-evaluations"></a>
### Historical PRs can be evaluated safely {#p-trailhead-can-backfill-historical-evaluations}

On-demand evaluation can score and persist an existing PR with the current engine without replaying its original side effects. In backfill mode Trailhead skips comments, labels, reviewer requests, healing, and autofix.

> since 2026-07-18 · verified 2026-08-26 · confidence ratified · sources: `pr:279`
