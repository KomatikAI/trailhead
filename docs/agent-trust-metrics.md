# Agent trust metrics (v1)

Trailhead dynamic agent trust consumes a versioned metrics payload via `TRAILHEAD_AGENT_TRUST_JSON` (Action runtime) or the MCP `get-trust-score` tool.

Reference collector (komatik fleet): [KomatikAI/agents PR #206](https://github.com/KomatikAI/agents/pull/206) — shadow mode on `main`; duplicates product-owned helpers until slim follow-up.

## Komatik fleet integration

**Product owns (canonical — do not reimplement in agents):**

| Module                        | Contract                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/agent-trust-metrics.ts`  | `trailhead.agent_trust_metrics.v1`, `parseAgentTrustMetrics`, `computeScoreDistribution`, `assessColdStart` |
| `src/agent-trust-feedback.ts` | `trailhead.feedback.v1`, `rollupFeedbackForAgent`, `mergeFeedbackIntoMetrics`                               |
| `src/trust-score.ts`          | `computeAgentTrustScore()` — returns `null` on cold start                                                   |
| `src/verdict.ts`              | `trailhead.verdict.v1`; collectors read **`verdict.penalty`**, not deploy `risk.score`                      |
| `cli/dist/` (npm)             | `validate-submission`, `doctor` — `@komatikai/trailhead@4.4.5` (+ `@swc/core` at install)                   |

**Agents repo keeps (fleet-specific):**

- Events DB → metrics JSON extractor + Spark cron (`run-trust-shadow-report.sh`)
- Injection of `TRAILHEAD_AGENT_TRUST_JSON` at gate runtime (shadow only until enforce)

**Tracked debt after agents #206 merge:**

1. Delete `scripts/lib/trust-score.cjs` mirror and duplicated distribution/cold-start/schema code
2. Drop vendored `trailhead/cli-dist/` → npm pin `@komatikai/trailhead`
3. Wire `log-gate-decision.js` to Action `verdict-json` / `verdict.penalty`
4. Bump B4 `.trailhead.yml` pin `4.4.3` → `4.4.4` when trailhead promotes to `main`

Epic [#252](https://github.com/KomatikAI/trailhead/issues/252) **shipped** on trailhead `dev` ([#261](https://github.com/KomatikAI/trailhead/pull/261)).

## Schema

- **Envelope schema id:** `trailhead.agent_trust_metrics.v1`
- **Zod export:** `src/agent-trust-metrics.ts` (`AgentTrustMetricsSchema`, `AgentTrustEnvelopeSchema`)
- **Example payload:** `examples/agent-trust-metrics.v1.json`

### Core fields

| Field                         | Type    | Notes                                                                               |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `evaluations`                 | int ≥ 0 | Gate evaluations in window (+ optional feedback counts in collector)                |
| `releaseReadyCount`           | int     | Clean submissions; collectors map low **penalty** `total_score`, not binary `allow` |
| `revertCount`                 | int     | Post-merge reverts attributed to agent                                              |
| `humanReviewRequiredCount`    | int     | Blocks, warns, CI failures requiring human follow-up                                |
| `policyViolationCount`        | int     | Policy detector hits + attributed CI failures                                       |
| `sensitivePathViolationCount` | int     | Secrets / destructive SQL / env detector hits                                       |
| `remediationRoundsToReady`    | int[]   | Loop rounds for PRs that reached release-ready                                      |

### Optional continuous signals (#254)

| Field                        | Type   | Notes                                                                                   |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `penaltyQuality.mean`        | number | Mean gate penalty `total_score` (**lower = cleaner**, typically 0–8)                    |
| `penaltyQuality.stdDev`      | number | Std-dev of penalty scores; ≥ `minScoreStdDev` (default 1) satisfies cold-start variance |
| `penaltyQuality.cleanRate`   | 0–1    | Share of evaluations with penalty ≤ `cleanPenaltyThreshold` (default 1)                 |
| `penaltyQuality.sampleCount` | int    | Evaluations used for penalty stats                                                      |

### Optional post-merge feedback (#257)

| Field                  | Type |
| ---------------------- | ---- |
| `feedback.ciFailures`  | int  |
| `feedback.reverts`     | int  |
| `feedback.humanReview` | int  |

Ingest events via **`trailhead.feedback.v1`** — see [agent-trust-feedback.md](./agent-trust-feedback.md).

## Cold start (#253)

`computeAgentTrustScore()` returns **`null`** (not a flat 0.5) when:

1. Total evidence `< minEvidenceEvaluations` (default **5**), or
2. Signals are flat: all clean, zero violations, no penalty variance, no feedback.

Collectors should omit `TRAILHEAD_AGENT_TRUST_JSON` when cold-start applies. The Action logs `[agent-trust] … trust=null` if metrics are present but scoring refuses to emit trust.

## Shadow / enforce runtime (#259)

| Env var                   | Default | Effect                                                             |
| ------------------------- | ------- | ------------------------------------------------------------------ |
| `TRAILHEAD_TRUST_ENABLED` | enabled | Kill switch (`false` ignores trust JSON entirely)                  |
| `TRAILHEAD_TRUST_SHADOW`  | off     | Log trust profile; **do not** apply `thresholdDelta`               |
| `TRAILHEAD_TRUST_ENFORCE` | off     | Collector: inject JSON. Gate applies threshold unless shadow is on |

## Ingestion forms

**Bare metrics** (injected env JSON):

```json
{ "evaluations": 12, "releaseReadyCount": 10, "...": "..." }
```

**Versioned envelope** (export / storage; `trust` may be `null` during cold start):

```json
{
  "schema": "trailhead.agent_trust_metrics.v1",
  "agent_id": "pixel",
  "collected_at": "2026-05-29T00:00:00.000Z",
  "window_days": 30,
  "trust": { "...": "..." },
  "cold_start": { "emitTrust": true, "reason": null }
}
```

The Action parser accepts either form; envelope with `trust: null` yields no scoring input.

## Penalty semantics (critical)

Live `agent_gate_decision` events store **`total_score` as a penalty** (lower = cleaner), not 0–100 risk. Binary `decision: allow` was ~100% in the Komatik measurement window — map release-readiness from **low penalty**, not from `allow` alone. See agents `scripts/lib/agent-trust-penalty.js`.

## Related issues

Epic [#252](https://github.com/KomatikAI/trailhead/issues/252) shipped on trailhead `dev` ([#261](https://github.com/KomatikAI/trailhead/pull/261)): #253–#260. Komatik collector integration: [agents #206](https://github.com/KomatikAI/agents/pull/206).
