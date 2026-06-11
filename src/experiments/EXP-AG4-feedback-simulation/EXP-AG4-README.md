# EXP-AG4 — Feedback Simulation

**Status:** Research implementation (suggestion — not yet merged)  
**Author:** Edison (rd-platform)  
**Date:** 2026-06-01  
**Workflow:** Trailhead Agent Gate R&D — EXP-AG2/AG4/AG6 Implementation  

---

## Hypothesis

> "If we build a synthetic feedback generator that replays acceptance/rejection
> scenarios, we can measure per-agent adaptation rates and identify which
> feedback signals produce the most durable improvement in submission quality."

---

## What This Experiment Measures

EXP-AG4 models the Trailhead agent gate as a **feedback loop** and simulates
multiple agents with different learning behaviours running through it.

### Dependent variable
- **Quality score** at each submission round (0–100, inferred from outcome type
  and remediation rounds consumed).

### Independent variables
- `learningRate` — how fast an agent integrates feedback (0.0–1.0)
- `persistence` — how many remediation rounds an agent attempts before giving up
- `baseAcceptanceRate` — starting probability of a clean pass

### Measurement
- **Learning slope**: least-squares linear regression slope of the quality curve.
  Positive slope → improving; negative → degrading.
- **Wilson score CI**: 95 % confidence interval on the acceptance rate, so
  thin data doesn't produce overconfident readings.
- **Rolling acceptance rate**: last 5 rounds, to detect recent drift.

---

## Files

| File | Purpose |
|---|---|
| `types.ts` | Zod schemas for scenarios, rounds, agents, and reports |
| `feedback-generator.ts` | Canonical scenario library + `FeedbackGenerator` class |
| `adaptation-tracker.ts` | `AdaptationTracker`, `wilsonScoreCI`, `linearSlope` |
| `simulation-runner.ts` | `SimulationRunner` — orchestrates full experiment |
| `exp-ag4-feedback-simulation.test.ts` | 35+ vitest tests, all real computation |
| `EXP-AG4-README.md` | This file |

---

## Scenarios

Ten canonical scenarios cover the full acceptance/rejection spectrum:

| ID | Kind | Expected Direction |
|---|---|---|
| `clean-01` | `clean_accept` | improve |
| `warn-01` | `warn_then_accept` | stable |
| `reject-fix-01` | `reject_fix_accept` | improve |
| `reject-fix-02` | `reject_fix_accept` | improve |
| `multi-01` | `multi_reject` | degrade |
| `multi-02` | `multi_reject` | degrade |
| `block-01` | `permanent_block` | degrade |
| `regress-01` | `regress_recover` | stable |
| `rollback-01` | `multi_reject` | degrade |
| `rollback-recover-01` | `regress_recover` | improve |

---

## Agent Profiles

Five archetypal profiles exercise the parameter space:

| Agent | Learning Rate | Persistence | Base Accept Rate |
|---|---|---|---|
| `fast-learner` | 0.85 | 0.90 | 0.60 |
| `steady-performer` | 0.50 | 0.70 | 0.75 |
| `slow-adapter` | 0.20 | 0.80 | 0.65 |
| `high-volume` | 0.40 | 0.95 | 0.55 |
| `cautious` | 0.60 | 0.30 | 0.90 |

---

## Running the Experiment

```ts
import { SimulationRunner } from "./simulation-runner.js";

const runner = new SimulationRunner({
  generatorConfig: { seed: 42, noiseFactor: 0.1 },
  roundsPerScenario: 20,
});

const report = runner.run("exp-ag4-baseline");
console.log(report.summary);
// {
//   fastestLearner: 'fast-learner',
//   mostPersistent: 'high-volume',
//   overallTrend: 'improving',
//   meanTimeToAccept: 6.3,
//   adaptationRate: 0.6
// }
```

### Run the tests

```bash
npx vitest run src/experiments/EXP-AG4-feedback-simulation/exp-ag4-feedback-simulation.test.ts
```

---

## Interpreting Results

| Metric | What it tells you |
|---|---|
| `learningSlope > 0.3` | Agent is meaningfully improving over time |
| `learningSlope < -0.3` | Agent quality is deteriorating — investigate feedback signal |
| `recentAcceptanceRate ≫ cumulativeAcceptanceRate` | Late-session recovery — scenario initially too hard |
| `averageRemediationRounds > 2` | Agent is trying hard but the issue is systemic |
| `adaptationRate > 0.6` | Majority of agents respond positively to the feedback design |

---

## Limitations

1. Agents are parametric profiles — they don't make real code changes.
2. Learning rate and persistence are fixed per agent, not state-dependent.
3. The scenario library covers plausible trajectories, not exhaustive combinatorics.
4. Timestamps are synthetic (1 minute apart) — not real wall-clock durations.

## Next Steps

- **EXP-AG5** (proposed): Wire real Trailhead gate outcomes back into agent
  profiles using `agent-trust-feedback.ts` events to replace the parametric
  model with empirical learning rates.
- **EXP-AG6**: Agent DORA metrics integration (rd-satellite, step 3 of this
  workflow) will use the `SimulationReport` schema to seed initial DORA baselines.
