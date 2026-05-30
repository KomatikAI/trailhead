# Gate verdict contract (v1)

Stable, versioned output for collectors, event stores, and dashboards — replaces ad-hoc `agent_gate_decision.metadata` field guessing.

Related: [agent-trust-metrics.md](./agent-trust-metrics.md) · [agent-trust-feedback.md](./agent-trust-feedback.md) · Epic [#252](https://github.com/KomatikAI/trailhead/issues/252) · Issue [#260](https://github.com/KomatikAI/trailhead/issues/260)

## Schema

- **Schema id:** `trailhead.verdict.v1`
- **Zod export:** `src/verdict.ts` (`TrailheadVerdictSchema`)
- **JSON Schema:** `docs/schemas/verdict.v1.json`
- **Example:** `examples/verdict/gate-allow-clean.v1.json`

## Emission surfaces

| Surface                   | Output                                                      |
| ------------------------- | ----------------------------------------------------------- |
| GitHub Action             | `verdict-json` output (+ `evaluation-json` legacy superset) |
| Semantic webhooks         | `verdict` block on `trailhead.webhook.v1` payloads          |
| MCP `validate-submission` | `verdict` + legacy `gate_decision`                          |
| MCP `evaluate-policy`     | `verdict` + legacy `gate_decision`                          |

Build helper: `buildGateVerdict(evaluation, options)` — pure, no I/O.

## Penalty vs risk (do not conflate)

| Block         | Field                          | Semantics                     | Source                                                       |
| ------------- | ------------------------------ | ----------------------------- | ------------------------------------------------------------ |
| **`penalty`** | `total_score`, `factor_scores` | **`lower_is_cleaner`**        | Submission gate checks (severity-weighted per detector code) |
| **`risk`**    | `score`, `factors`             | **`higher_is_worse`** (0–100) | Deploy gate risk engine                                      |

Trust collectors (#255) should use **`penalty`**, not `risk.score`, for pre-merge agent quality — see [agent-trust-metrics.md](./agent-trust-metrics.md).

Default severity → penalty weights: `blocking=3`, `warn=2`, `advisory=1`. `total_score` is the mean of per-code max penalties.

## Trust profile block

When dynamic trust is active, `trust_profile` includes:

- `strictness`, `reason`, optional `score` / `profile` / `factors`
- `shadow` / `enforce` from `TRAILHEAD_TRUST_*` runtime (see [agent-trust-metrics.md](./agent-trust-metrics.md))

## Collector mapping

```typescript
import {
  aggregateVerdictPenaltyQuality,
  projectVerdictToTrustCorrelation,
} from "./verdict.js";

const correlation = projectVerdictToTrustCorrelation(verdict);
// → { evaluation_id, agent_id, penalty, release_ready_clean }

const penaltyQuality = aggregateVerdictPenaltyQuality(verdictHistory);
// → AgentTrustMetrics.penaltyQuality shape
```

Pair with post-merge events via `evaluation_id` → [agent-trust-feedback.md](./agent-trust-feedback.md).

## Backward compatibility

`_legacy` carries flat `riskScore`, `healthScore`, and finding arrays for one release. Top-level webhook fields (`riskScore`, `decision`, …) remain; prefer `verdict` for new integrations.

Komatik dogfood migration: point `log-gate-decision.js` / `agent-trust-loader.js` at `verdict.penalty` instead of parsing raw metadata keys.
