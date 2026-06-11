# Product feedback: make the agent-trust loop & detector customization end-user-ready

**From:** Komatik — first real dogfood of trailhead's agent-trust loop on a live 24/7 agent fleet
**Window observed:** 16 days, 731 gate decisions, 14 agents, local events store
**Theme:** Trailhead ships the trust *engine* (`computeAgentTrustScore`, `gate.ts` reading
`TRAILHEAD_AGENT_TRUST_JSON`) and a strong detector suite — but not the *seams* to feed,
tune, or extend them. Every adopter currently has to reverse-engineer the metrics shape,
fork `src/submission-checks/detectors.ts` to add their own rules, and discover by accident
that the scorer goes flat on a fresh deployment. Closing the seams below keeps the engine
generic (good) while making the "bring your own data + rules" layer easy instead of a
fork-and-reverse-engineer slog.

---

## P0 — the trust scorer is unusable on a real (young) deployment

### 1. The scorer goes flat when outcomes are uniform — no cold-start / continuous-signal fallback
`computeAgentTrustScore` is entirely outcome-based: `releaseReadyCount`, `revertCount`,
`humanReviewRequiredCount`, `policyViolationCount`, `sensitivePathViolationCount`. On any
young or shadow-mode deployment those are **uniform** — in our 16-day window **100% of 731
gate decisions were `allow`**, with zero reverts and zero human-review events logged. Every
outcome signal is therefore constant, so the score collapses to the same value for every
agent. The model is unusable exactly when an adopter most wants to start measuring.

**What the next user wants:** the scorer should degrade gracefully — when outcome variance
is near zero, fall back to the **continuous quality signal the gate already computes** (see
#2). Document a minimum-evidence threshold below which an agent returns `trust=null`
(callers already handle null via the risk-score fallback) rather than a falsely-confident
flat score.

### 2. The gate computes `total_score` + `factor_scores` per decision, then the trust model ignores them
This is the richest discriminating signal in the system and it's thrown away. Even with
decisions pinned at `allow`, the per-agent **score distribution** separates agents cleanly:
in our data `total_score` is a penalty score (lower = cleaner), and per-agent means ranged
from 0.0/σ0 for the cleanest agents up to 4.5/σ1.2 for the noisiest (worst single-submission
penalty observed: 8) — i.e. the distribution separates consistently-clean agents from those
that repeatedly trip detectors, which the binary allow/block (100% `allow` here) never will. Per-factor scores (16 factors:
`secrets`, `artifact_integrity`, `syntax_validity`, `reconciliation`, …) would let trust be
attributed to *which* dimension an agent is weak on.

**What the next user wants:** make the continuous `total_score`/`factor_scores`
distribution a **first-class trust input**, not just the binary decision.

### 3. Ship a documented ingestion contract + reference collector for `AgentTrustMetrics`
`gate.ts` reads trust from a `TRAILHEAD_AGENT_TRUST_JSON` env string, but there is no
published schema doc, no example file, and no reference collector. We had to read
`trust-score.ts` source to learn the shape and hand-build a collector against our own event
store. Every adopter repeats this.

**What the next user wants:** (a) a versioned JSON Schema for `AgentTrustMetrics`; (b) an
example `agent-trust-metrics.json`; (c) a reference collector or adapter interface showing
how to map an arbitrary event store → the metrics shape; (d) docs on the env contract
(path vs inline, refresh cadence, null semantics).

---

## P1 — customization requires forking product source

### 4. Detector customization needs config, not source edits
To adopt trailhead we had to edit `src/submission-checks/detectors.ts` directly to
(a) add our project's rename-enforcement patterns (old→new symbol names) and
(b) tighten `artifact_integrity`, which over-flagged: it treated any added line containing
`import|from|require|see|fix|update` + a path token in **any** file (incl. prose `.md`) as a
broken artifact reference. Both are things an end-user will need constantly, and neither
should require forking, rebuilding, and re-vendoring the engine.

**What the next user wants:** project-level config (e.g. `trailhead.config.*`) for:
- rename / banned-token pattern lists (the OLD_NAME_PATTERNS use case)
- per-detector **severity** override + **enable/disable** toggles
- per-detector **file-scope globs** (e.g. "artifact_integrity only on code files")
Detector *logic* stays in the product; the *policy* becomes data the adopter owns.

### 5. Post-merge outcome feedback (CI / reverts) has no ingestion path
The strongest real-world trust signal is "did this agent's merged work hold up?" — CI
pass/fail and reverts. We have 640 CI-failure events but no product-blessed way to feed
post-merge outcomes back into `AgentTrustMetrics` (`revertCount`,
`remediationRoundsToReady` currently have no documented source).

**What the next user wants:** a documented feedback contract for post-merge outcomes
(CI result, revert, rounds-to-green) keyed to a submission/PR id, so `revertCount` and
`remediationRoundsToReady` can actually be populated.

---

## P2 — delivery & lifecycle ergonomics

### 6. Ship a prebuilt, dependency-bundled CLI artifact
The committed `cli/dist` is gitignored and depends on `cli/node_modules` (native `@swc/core`).
A checkout missing those throws `ERR_MODULE_NOT_FOUND` on every bundle, which a harness reads
as **100% divergence** — a multi-hour false alarm for us. We worked around it by vendoring a
hand-built bundle.

**What the next user wants:** a published, dependency-bundled CLI (npm package or a release
artifact with deps inlined) so consumers neither build from source nor wrestle native deps.

### 7. First-class shadow / measurement mode for trust, with a kill switch
We're hand-rolling "compute the trust profile, log it, don't act on it." The gate has a
`mode` field but no documented shadow-mode for *trust modulation* specifically, nor a
kill switch to instantly revert to baseline strictness.

**What the next user wants:** native trust-shadow mode (records the would-be profile +
strictness, changes no behavior) plus a documented kill switch — so adopters can safely
bake trust data before letting it gate anything.

### 8. A stable, versioned verdict object
Consumers currently parse loosely-structured decision metadata. A single versioned verdict
schema (decision + total_score + factor_scores + trust profile + reasons) would let adopters
build on a stable contract instead of metadata-shape guesswork.

---

## Priority for the next adopter
If only three things ship: **#1 (graceful cold-start), #3 (documented ingestion contract +
reference collector), #4 (config-driven detector customization)**. Those three are the
difference between "read the source and fork it" and "configure it and feed it."
